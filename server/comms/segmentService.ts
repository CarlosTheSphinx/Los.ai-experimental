import { db } from '../db';
import { users, projects } from '@shared/schema';
import { and, eq, inArray, gte, lte, isNotNull, or, sql, type SQL } from 'drizzle-orm';

export type Audience = 'broker' | 'borrower' | 'lender_user';

export interface SegmentFilter {
  type:
    | 'has_loan_in_stage'
    | 'has_loan_in_status'
    | 'closing_within_days'
    | 'stalled_days'
    | 'created_within_days'
    | 'has_phone'
    | 'has_email_consent'
    | 'has_sms_consent';
  values?: string[];
  value?: number | boolean;
}

export interface SegmentFilterConfig {
  audience: Audience;
  filters: SegmentFilter[];
}

const LENDER_ROLES = ['super_admin', 'lender', 'processor'];

export function audienceRoleCondition(audience: Audience): SQL {
  if (audience === 'lender_user') return inArray(users.role, LENDER_ROLES);
  return eq(users.role, audience);
}

interface ResolvedRecipient {
  id: number;
  fullName: string | null;
  email: string;
  phone: string | null;
  role: string;
  companyName: string | null;
}

/**
 * Compile a segment filter config to a tenant-scoped query and return matching recipients.
 * AND-only combinator (every filter must pass).
 *
 * Loan-related filters are evaluated by joining `users` to `projects`:
 *   - audience=borrower: projects.user_id = users.id (or projects.borrower_email = users.email)
 *   - audience=broker:   projects.broker_email = users.email
 *   - audience=lender_user: skipped (no per-loan association)
 *
 * Recipients are deduplicated by user id.
 */
export async function resolveSegment(
  config: SegmentFilterConfig,
  tenantId: number,
  opts: { limit?: number } = {}
): Promise<{ count: number; recipients: ResolvedRecipient[] }> {
  const audience = config.audience;
  const limit = opts.limit;

  const conditions: SQL[] = [
    eq(users.tenantId, tenantId),
    eq(users.isActive, true),
    audienceRoleCondition(audience),
  ];

  // Non-loan filters apply directly to users
  for (const f of config.filters || []) {
    if (f.type === 'created_within_days' && typeof f.value === 'number') {
      const since = new Date(Date.now() - f.value * 86400_000);
      conditions.push(gte(users.createdAt, since));
    } else if (f.type === 'has_phone' && f.value) {
      conditions.push(isNotNull(users.phone));
    } else if (f.type === 'has_email_consent' && f.value) {
      conditions.push(eq(users.emailConsent, true));
    } else if (f.type === 'has_sms_consent' && f.value) {
      conditions.push(eq(users.smsConsent, true));
    }
  }

  // Loan-related filters → derive a set of user ids that satisfy the loan filter,
  // then add WHERE users.id IN (...). Lender users have no direct loan association
  // (they own many), so loan filters are ignored for them in v1.
  const loanFilters = (config.filters || []).filter(f =>
    ['has_loan_in_stage', 'has_loan_in_status', 'closing_within_days', 'stalled_days'].includes(f.type)
  );

  if (loanFilters.length && audience !== 'lender_user') {
    const projectConds: SQL[] = [
      eq(projects.tenantId, tenantId),
      eq(projects.isArchived, false),
    ];
    for (const f of loanFilters) {
      if (f.type === 'has_loan_in_stage' && f.values?.length) {
        projectConds.push(inArray(projects.currentStage, f.values));
      } else if (f.type === 'has_loan_in_status' && f.values?.length) {
        projectConds.push(inArray(projects.status, f.values));
      } else if (f.type === 'closing_within_days' && typeof f.value === 'number') {
        const horizon = new Date(Date.now() + f.value * 86400_000);
        projectConds.push(isNotNull(projects.targetCloseDate));
        projectConds.push(lte(projects.targetCloseDate, horizon));
        projectConds.push(gte(projects.targetCloseDate, new Date()));
      } else if (f.type === 'stalled_days' && typeof f.value === 'number') {
        const cutoff = new Date(Date.now() - f.value * 86400_000);
        projectConds.push(lte(projects.lastUpdated, cutoff));
      }
    }

    // Build subquery: project rows the user is associated with (per audience)
    if (audience === 'borrower') {
      // Borrowers may be linked to a project either by projects.userId OR by projects.borrowerEmail
      const [byUserId, byEmail] = await Promise.all([
        db.selectDistinct({ userId: projects.userId })
          .from(projects)
          .where(and(...projectConds, isNotNull(projects.userId))),
        db.selectDistinct({ email: projects.borrowerEmail })
          .from(projects)
          .where(and(...projectConds, isNotNull(projects.borrowerEmail))),
      ]);
      const ids = byUserId.map(r => r.userId).filter((x): x is number => x != null);
      const emails = byEmail.map(r => r.email).filter((x): x is string => !!x);
      if (!ids.length && !emails.length) return { count: 0, recipients: [] };
      const orConds: SQL[] = [];
      if (ids.length) orConds.push(inArray(users.id, ids));
      if (emails.length) orConds.push(inArray(users.email, emails));
      const combined = orConds.length === 1 ? orConds[0] : or(...orConds)!;
      conditions.push(combined);
    } else if (audience === 'broker') {
      const matched = await db.selectDistinct({ email: projects.brokerEmail })
        .from(projects)
        .where(and(...projectConds, isNotNull(projects.brokerEmail)));
      const emails = matched.map(r => r.email).filter((x): x is string => !!x);
      if (!emails.length) return { count: 0, recipients: [] };
      conditions.push(inArray(users.email, emails));
    }
  }

  const baseQuery = db.select({
    id: users.id,
    fullName: users.fullName,
    email: users.email,
    phone: users.phone,
    role: users.role,
    companyName: users.companyName,
  })
    .from(users)
    .where(and(...conditions));

  const rows = limit
    ? await baseQuery.limit(limit + 1) // +1 to detect "more"
    : await baseQuery;

  // For preview we ask for limit+1 so we can return both a sample and an honest count.
  // Without limit, count = rows.length.
  if (limit) {
    const total = await db.select({ c: sql<number>`count(*)::int` })
      .from(users)
      .where(and(...conditions));
    return {
      count: total[0]?.c ?? 0,
      recipients: rows.slice(0, limit),
    };
  }
  return { count: rows.length, recipients: rows };
}
