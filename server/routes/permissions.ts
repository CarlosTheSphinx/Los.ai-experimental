import type { Express, Request, Response } from 'express';
import { eq, and } from 'drizzle-orm';
import {
  users,
  teamPermissions,
  auditLogs,
  TEAM_ROLES,
  PERMISSION_KEYS,
  PERMISSION_CATEGORIES,
  type PermissionKey,
} from '@shared/schema';
import {
  getUserPermissions,
  clearPermissionCache,
  hasPermission,
  hasAllPermissions,
} from '../utils/permissions';

export function setupPermissionsRoutes(app: Express, { db }: any) {
  // Get current user's permissions
  app.get('/api/permissions/me', async (req: any, res: Response) => {
    if (!req.user?.id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
      const user = await db
        .select()
        .from(users)
        .where(eq(users.id, req.user.id))
        .limit(1);

      if (!user.length) {
        return res.status(404).json({ error: 'User not found' });
      }

      const userData = user[0];
      const userRoles = userData.roles && userData.roles.length > 0
        ? userData.roles
        : userData.role ? [userData.role] : ['user'];

      const permissions = await getUserPermissions(req.user.id, userRoles);

      res.json({
        permissions,
        role: userData.role || 'user',
        roles: userRoles,
      });
    } catch (error) {
      console.error('Error fetching permissions:', error);
      res.status(500).json({ error: 'Failed to fetch permissions' });
    }
  });

  // Get all permission categories with metadata
  app.get('/api/permissions/categories', async (req: any, res: Response) => {
    if (!req.user?.id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
      const user = await db
        .select()
        .from(users)
        .where(eq(users.id, req.user.id))
        .limit(1);

      if (!user.length) {
        return res.status(404).json({ error: 'User not found' });
      }

      const userData = user[0];
      const userRoles = userData.roles && userData.roles.length > 0
        ? userData.roles
        : userData.role ? [userData.role] : ['user'];

      // Only admin/super_admin can view permission categories
      if (!userRoles.includes('admin') && !userRoles.includes('super_admin')) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      res.json(PERMISSION_CATEGORIES);
    } catch (error) {
      console.error('Error fetching permission categories:', error);
      res.status(500).json({ error: 'Failed to fetch permission categories' });
    }
  });

  // Get team roles and their permissions
  app.get('/api/permissions/roles', async (req: any, res: Response) => {
    if (!req.user?.id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
      const user = await db
        .select()
        .from(users)
        .where(eq(users.id, req.user.id))
        .limit(1);

      if (!user.length) {
        return res.status(404).json({ error: 'User not found' });
      }

      const userData = user[0];
      const userRoles = userData.roles && userData.roles.length > 0
        ? userData.roles
        : userData.role ? [userData.role] : ['user'];

      // Only admin/super_admin can view role permissions
      if (!userRoles.includes('admin') && !userRoles.includes('super_admin')) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const rolePermissions = await db
        .select()
        .from(teamPermissions);

      const result = TEAM_ROLES.map(role => ({
        role,
        permissions: rolePermissions
          .filter((rp: any) => rp.role === role)
          .map((rp: any) => ({
            key: rp.permissionKey as PermissionKey,
            enabled: rp.enabled,
            scope: rp.scope,
          })),
      }));

      res.json(result);
    } catch (error) {
      console.error('Error fetching role permissions:', error);
      res.status(500).json({ error: 'Failed to fetch role permissions' });
    }
  });

  // Update permission for a role (super_admin only)
  app.patch('/api/permissions/roles/:role/:permissionKey', async (req: any, res: Response) => {
    if (!req.user?.id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
      const user = await db
        .select()
        .from(users)
        .where(eq(users.id, req.user.id))
        .limit(1);

      if (!user.length) {
        return res.status(404).json({ error: 'User not found' });
      }

      const userData = user[0];
      const userRoles = userData.roles && userData.roles.length > 0
        ? userData.roles
        : userData.role ? [userData.role] : ['user'];

      // Only super_admin can modify permissions
      if (!userRoles.includes('super_admin')) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const { role, permissionKey } = req.params;
      const { enabled, scope } = req.body;

      // Validate inputs
      if (!TEAM_ROLES.includes(role as any)) {
        return res.status(400).json({ error: 'Invalid role' });
      }

      if (!PERMISSION_KEYS.includes(permissionKey as PermissionKey)) {
        return res.status(400).json({ error: 'Invalid permission' });
      }

      // Check if permission exists for this role
      const existing = await db
        .select()
        .from(teamPermissions)
        .where(
          and(
            eq(teamPermissions.role, role),
            eq(teamPermissions.permissionKey, permissionKey)
          )
        )
        .limit(1);

      if (existing.length === 0) {
        // Create new permission entry
        await db.insert(teamPermissions).values({
          role,
          permissionKey,
          enabled: enabled ?? false,
          scope: scope ?? 'all',
          updatedBy: req.user.id,
        });
      } else {
        // Update existing permission
        await db
          .update(teamPermissions)
          .set({
            enabled: enabled ?? existing[0].enabled,
            scope: scope ?? existing[0].scope,
            updatedBy: req.user.id,
          })
          .where(
            and(
              eq(teamPermissions.role, role),
              eq(teamPermissions.permissionKey, permissionKey)
            )
          );
      }

      // Log audit
      await db.insert(auditLogs).values({
        userId: req.user.id,
        userEmail: userData.email,
        userRole: userData.role,
        action: 'update_role_permission',
        resourceType: 'permission',
        resourceId: `${role}:${permissionKey}`,
        success: true,
      });

      res.json({ success: true });
    } catch (error) {
      console.error('Error updating permission:', error);
      res.status(500).json({ error: 'Failed to update permission' });
    }
  });

  // Bulk update permissions for a role (super_admin only)
  app.post('/api/permissions/roles/:role/bulk-update', async (req: any, res: Response) => {
    if (!req.user?.id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
      const user = await db
        .select()
        .from(users)
        .where(eq(users.id, req.user.id))
        .limit(1);

      if (!user.length) {
        return res.status(404).json({ error: 'User not found' });
      }

      const userData = user[0];
      const userRoles = userData.roles && userData.roles.length > 0
        ? userData.roles
        : userData.role ? [userData.role] : ['user'];

      // Only super_admin can modify permissions
      if (!userRoles.includes('super_admin')) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const { role } = req.params;
      const { permissions: permissionsToUpdate } = req.body;

      if (!TEAM_ROLES.includes(role as any)) {
        return res.status(400).json({ error: 'Invalid role' });
      }

      if (!Array.isArray(permissionsToUpdate)) {
        return res.status(400).json({ error: 'Permissions must be an array' });
      }

      // Update each permission
      for (const perm of permissionsToUpdate) {
        const { key, enabled, scope } = perm;

        if (!PERMISSION_KEYS.includes(key as PermissionKey)) {
          continue;
        }

        const existing = await db
          .select()
          .from(teamPermissions)
          .where(
            and(
              eq(teamPermissions.role, role),
              eq(teamPermissions.permissionKey, key)
            )
          )
          .limit(1);

        if (existing.length === 0) {
          await db.insert(teamPermissions).values({
            role,
            permissionKey: key,
            enabled: enabled ?? false,
            scope: scope ?? 'all',
            updatedBy: req.user.id,
          });
        } else {
          await db
            .update(teamPermissions)
            .set({
              enabled: enabled ?? existing[0].enabled,
              scope: scope ?? existing[0].scope,
              updatedBy: req.user.id,
            })
            .where(
              and(
                eq(teamPermissions.role, role),
                eq(teamPermissions.permissionKey, key)
              )
            );
        }
      }

      // Log audit
      await db.insert(auditLogs).values({
        userId: req.user.id,
        userEmail: userData.email,
        userRole: userData.role,
        action: 'bulk_update_role_permissions',
        resourceType: 'permission',
        resourceId: role,
        success: true,
      });

      res.json({ success: true });
    } catch (error) {
      console.error('Error bulk updating permissions:', error);
      res.status(500).json({ error: 'Failed to bulk update permissions' });
    }
  });
}
