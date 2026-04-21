import { db } from '../db';
import { projects, users, tenants, dealDocuments } from '@shared/schema';
import { and, eq, inArray } from 'drizzle-orm';

export interface MergeTagContext {
  recipient?: {
    id: number;
    email?: string | null;
    phone?: string | null;
    fullName?: string | null;
    companyName?: string | null;
    role?: string | null;
  };
  loan?: {
    id: number;
    loanNumber?: string | null;
    propertyAddress?: string | null;
    loanAmount?: number | null;
    currentStage?: string | null;
    status?: string | null;
    targetCloseDate?: Date | null;
    borrowerPortalToken?: string | null;
    brokerEmail?: string | null;
    borrowerEmail?: string | null;
    missingDocuments?: string[];
  };
  lender?: {
    id: number;
    name?: string | null;
  };
  broker?: {
    fullName?: string | null;
    companyName?: string | null;
  };
}

const BASE_URL = process.env.BASE_URL || (process.env.REPLIT_DEV_DOMAIN
  ? `https://${process.env.REPLIT_DEV_DOMAIN}`
  : 'http://localhost:5000');

type ChannelType = 'email' | 'sms' | 'in_app';

const resolvers: Record<string, (ctx: MergeTagContext, channel: ChannelType) => string> = {
  resolveRecipientFirstName: (ctx) => {
    const name = ctx.recipient?.fullName || '';
    return name.split(' ')[0] || name || '';
  },
  resolveRecipientFullName: (ctx) => ctx.recipient?.fullName || '',
  resolveRecipientEmail: (ctx) => ctx.recipient?.email || '',
  resolveRecipientPhone: (ctx) => ctx.recipient?.phone || '',
  resolveLoanAddress: (ctx) => ctx.loan?.propertyAddress || '',
  resolveLoanAmount: (ctx) => {
    const amt = ctx.loan?.loanAmount;
    if (!amt) return '';
    return `$${Number(amt).toLocaleString('en-US')}`;
  },
  resolveLoanNumber: (ctx) => ctx.loan?.loanNumber || (ctx.loan?.id ? `LOAN-${ctx.loan.id}` : ''),
  resolveLoanStatus: (ctx) => {
    const stage = ctx.loan?.currentStage || ctx.loan?.status || '';
    return stage.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  },
  resolveLoanMissingDocuments: (ctx, channel) => {
    const docs = ctx.loan?.missingDocuments;
    if (!docs || docs.length === 0) return '';
    // channel_formatting: email→html_list, sms→comma_list, in_app→plain_list
    if (channel === 'email') {
      return `<ul>${docs.map(d => `<li>${escapeHtml(d)}</li>`).join('')}</ul>`;
    }
    if (channel === 'sms') {
      return docs.join(', ');
    }
    // in_app: newline-separated plain list
    return docs.join('\n');
  },
  resolveLoanTargetCloseDate: (ctx) => {
    const d = ctx.loan?.targetCloseDate;
    if (!d) return 'TBD';
    return new Date(d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  },
  resolveLoanPortalLink: (ctx, channel) => {
    const token = ctx.loan?.borrowerPortalToken;
    // Only include a link when a borrower portal token exists; never fall back to
    // internal /deals/:id URLs in outbound messages (those are lender-facing, not borrower-safe).
    if (!token) return '';
    const url = `${BASE_URL}/portal/${token}`;
    if (channel === 'email') {
      return `<a href="${url}">View Portal</a>`;
    }
    return url;
  },
  resolveLenderName: (ctx) => ctx.lender?.name || '',
  resolveBrokerFullName: (ctx) => ctx.broker?.fullName || '',
  resolveBrokerCompany: (ctx) => ctx.broker?.companyName || '',
  resolveCurrentDate: () => new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
};

const resolverKeyToFnName: Record<string, string> = {
  'recipient.first_name': 'resolveRecipientFirstName',
  'recipient.full_name': 'resolveRecipientFullName',
  'recipient.email': 'resolveRecipientEmail',
  'recipient.phone': 'resolveRecipientPhone',
  'loan.address': 'resolveLoanAddress',
  'loan.amount': 'resolveLoanAmount',
  'loan.number': 'resolveLoanNumber',
  'loan.status': 'resolveLoanStatus',
  'loan.missing_documents': 'resolveLoanMissingDocuments',
  'loan.target_close_date': 'resolveLoanTargetCloseDate',
  'loan.portal_link': 'resolveLoanPortalLink',
  'lender.name': 'resolveLenderName',
  'broker.full_name': 'resolveBrokerFullName',
  'broker.company': 'resolveBrokerCompany',
  'current_date': 'resolveCurrentDate',
};

export function resolveTag(key: string, ctx: MergeTagContext, channel: ChannelType): string {
  const fnName = resolverKeyToFnName[key];
  if (!fnName) return `{{${key}}}`;
  const fn = resolvers[fnName];
  if (!fn) return `{{${key}}}`;
  try {
    return fn(ctx, channel);
  } catch {
    return '';
  }
}

/** Escape HTML entities in user-controlled values to prevent stored XSS when
 *  merge-tag values are inserted into HTML email templates. */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

/**
 * Tags whose resolvers intentionally produce safe HTML markup (e.g. anchors).
 * These are system-generated and exempt from HTML escaping when in email context.
 * All other tags resolve to plain text from user-controlled data and MUST be escaped.
 */
const SAFE_HTML_TAGS = new Set(['loan.portal_link', 'loan.missing_documents']);

export function resolveTemplate(
  body: string,
  subject: string | null | undefined,
  ctx: MergeTagContext,
  channel: ChannelType
): { resolvedBody: string; resolvedSubject: string | null; resolvedMergeTags: Record<string, string> } {
  const resolvedMergeTags: Record<string, string> = {};

  const replacer = (text: string, escapeUserValues: boolean): string => {
    return text.replace(/\{\{([^}]+)\}\}/g, (match, key) => {
      const trimmedKey = key.trim();
      if (!(trimmedKey in resolvedMergeTags)) {
        resolvedMergeTags[trimmedKey] = resolveTag(trimmedKey, ctx, channel);
      }
      // HTML-escape user-controlled values in email bodies; skip tags that produce safe markup
      const needsEscaping = escapeUserValues && !SAFE_HTML_TAGS.has(trimmedKey);
      return needsEscaping ? escapeHtml(resolvedMergeTags[trimmedKey]) : resolvedMergeTags[trimmedKey];
    });
  };

  // HTML-escape user-controlled merge-tag values in email templates; SMS/in_app are plain text
  const shouldEscapeHtml = channel === 'email';
  const resolvedBody = replacer(body, shouldEscapeHtml);
  const resolvedSubject = subject ? replacer(subject, false) : null; // subject is always plain text

  return { resolvedBody, resolvedSubject, resolvedMergeTags };
}

export async function buildContext(params: {
  recipientId?: number;
  loanId?: number;
  tenantId: number;
}): Promise<MergeTagContext> {
  const { tenantId } = params;
  const ctx: MergeTagContext = {};

  // Tenant-scoped recipient lookup
  if (params.recipientId) {
    const [user] = await db.select().from(users)
      .where(and(eq(users.id, params.recipientId), eq(users.tenantId, tenantId)))
      .limit(1);
    if (user) {
      ctx.recipient = {
        id: user.id,
        email: user.email,
        phone: user.phone,
        fullName: user.fullName,
        companyName: user.companyName,
        role: user.role,
      };
    }
  }

  // Tenant-scoped loan lookup — projects don't have a direct tenantId column,
  // so we verify ownership via the project's userId → users.tenantId chain.
  if (params.loanId) {
    const [loan] = await db.select().from(projects)
      .where(eq(projects.id, params.loanId))
      .limit(1);
    if (loan) {
      // Verify the loan belongs to this tenant. projects has no direct tenantId column,
      // so we verify strictly via projects.userId → users.tenantId.
      // Loans with null userId produce no loan context to prevent IDOR via alternative
      // ownership heuristics (e.g. broker email matching could span tenants).
      let loanBelongsToTenant = false;
      if (loan.userId) {
        const [loanOwner] = await db.select({ tenantId: users.tenantId }).from(users)
          .where(and(eq(users.id, loan.userId), eq(users.tenantId, tenantId)))
          .limit(1);
        loanBelongsToTenant = !!loanOwner;
      }

      if (loanBelongsToTenant) {
        ctx.loan = {
          id: loan.id,
          loanNumber: loan.loanNumber,
          propertyAddress: loan.propertyAddress,
          loanAmount: loan.loanAmount ? Number(loan.loanAmount) : null,
          currentStage: loan.currentStage,
          status: loan.status,
          targetCloseDate: loan.targetCloseDate,
          borrowerPortalToken: loan.borrowerPortalToken,
          brokerEmail: loan.brokerEmail,
          borrowerEmail: loan.borrowerEmail,
        };

        // Precompute missing (pending) documents for loan.missing_documents merge tag
        const pendingDocs = await db.select({ documentName: dealDocuments.documentName })
          .from(dealDocuments)
          .where(and(
            eq(dealDocuments.dealId, loan.id),
            inArray(dealDocuments.status, ['pending', 'rejected'])
          ));
        ctx.loan.missingDocuments = pendingDocs.map(d => d.documentName);

        // Tenant-scoped broker lookup by email within the same tenant
        if (loan.brokerEmail) {
          const [brokerUser] = await db.select().from(users)
            .where(and(eq(users.email, loan.brokerEmail), eq(users.tenantId, tenantId)))
            .limit(1);
          if (brokerUser) {
            ctx.broker = {
              fullName: brokerUser.fullName,
              companyName: brokerUser.companyName,
            };
          }
        }
      }
    }
  }

  // Lender (tenant) context
  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  if (tenant) {
    ctx.lender = {
      id: tenant.id,
      name: tenant.name,
    };
  }

  return ctx;
}
