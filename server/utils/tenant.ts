export function getTenantId(user: { id: number; role: string; tenantId?: number | null; invitedBy?: number | null }): number | null {
  return user.tenantId ?? null;
}
