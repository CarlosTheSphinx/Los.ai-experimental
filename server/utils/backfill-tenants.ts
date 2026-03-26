import { db } from "../db";
import { projects, loanPrograms, partners, adminTasks, systemSettings, users, funds, pricingRequests, quotePdfTemplates } from "@shared/schema";
import { isNull, sql } from "drizzle-orm";

export async function backfillTenantIds(): Promise<void> {
  const TENANT_ID = 1;

  const tables = [
    { table: projects, name: "projects" },
    { table: loanPrograms, name: "loan_programs" },
    { table: partners, name: "partners" },
    { table: adminTasks, name: "admin_tasks" },
    { table: funds, name: "funds" },
    { table: pricingRequests, name: "pricing_requests" },
    { table: quotePdfTemplates, name: "quote_pdf_templates" },
  ];

  let totalUpdated = 0;
  for (const { table, name } of tables) {
    const result = await db.update(table)
      .set({ tenantId: TENANT_ID } as any)
      .where(isNull((table as any).tenantId))
      .returning({ id: (table as any).id });
    if (result.length > 0) {
      console.log(`[Tenant Backfill] Assigned ${result.length} ${name} rows to tenant ${TENANT_ID}`);
      totalUpdated += result.length;
    }
  }

  await db.update(users)
    .set({ tenantId: TENANT_ID })
    .where(isNull(users.tenantId))
    .returning({ id: users.id });

  if (totalUpdated > 0) {
    console.log(`[Tenant Backfill] Total: ${totalUpdated} rows backfilled to tenant ${TENANT_ID}`);
  } else {
    console.log("[Tenant Backfill] All rows already have tenant IDs");
  }
}
