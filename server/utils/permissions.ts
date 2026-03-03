import { db } from '../db';
import { teamPermissions, PERMISSION_KEYS, SCOPABLE_PERMISSIONS, type PermissionKey } from '@shared/schema';
import { eq, and } from 'drizzle-orm';

interface PermissionCache {
  permissions: Record<PermissionKey, boolean>;
  roles: string[];
  expiresAt: number;
}

const permissionCache = new Map<number, PermissionCache>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function getUserPermissions(userId: number, roles: string[]) {
  const now = Date.now();
  const cached = permissionCache.get(userId);
  
  if (cached && cached.expiresAt > now) {
    return cached.permissions;
  }

  const permissions: Record<string, boolean> = {};
  
  // Super admin has all permissions
  if (roles.includes('super_admin')) {
    PERMISSION_KEYS.forEach(key => {
      permissions[key] = true;
    });
  } else {
    // Get permissions from team_permissions table for user's roles
    const rolePermissions = await db
      .select()
      .from(teamPermissions)
      .where(
        and(
          ...[
            roles.length > 0 ? eq(teamPermissions.role, roles[0]) : undefined,
          ].filter(Boolean) as any[]
        )
      );

    // Initialize all permissions as false
    PERMISSION_KEYS.forEach(key => {
      permissions[key] = false;
    });

    // Enable permissions that are configured
    rolePermissions.forEach(perm => {
      if (perm.enabled) {
        permissions[perm.permissionKey] = true;
      }
    });
  }

  // Cache the result
  permissionCache.set(userId, {
    permissions: permissions as Record<PermissionKey, boolean>,
    roles,
    expiresAt: now + CACHE_TTL,
  });

  return permissions as Record<PermissionKey, boolean>;
}

export function clearPermissionCache(userId: number) {
  permissionCache.delete(userId);
}

export function hasPermission(
  permissions: Record<string, boolean>,
  requiredPermission: PermissionKey
): boolean {
  return permissions[requiredPermission] === true;
}

export function hasAllPermissions(
  permissions: Record<string, boolean>,
  requiredPermissions: PermissionKey[]
): boolean {
  return requiredPermissions.every(perm => permissions[perm] === true);
}

export function hasAnyPermission(
  permissions: Record<string, boolean>,
  requiredPermissions: PermissionKey[]
): boolean {
  return requiredPermissions.some(perm => permissions[perm] === true);
}
