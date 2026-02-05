import { useQuery } from "@tanstack/react-query";
import type { PermissionKey } from "@shared/schema";

interface PermissionsResponse {
  permissions: Record<string, boolean>;
  role: string;
  roles: string[];
}

export function usePermissions() {
  const { data, isLoading } = useQuery<PermissionsResponse>({
    queryKey: ["/api/permissions/me"],
    staleTime: 60000,
  });

  const roles = data?.roles ?? [data?.role ?? "user"];

  const hasPermission = (key: PermissionKey): boolean => {
    if (!data) return false;
    if (roles.includes("super_admin")) return true;
    return data.permissions[key] ?? false;
  };

  const isSuperAdmin = roles.includes("super_admin");
  const isAdmin = roles.includes("admin") || isSuperAdmin;
  const isStaff = roles.includes("staff") || isAdmin;
  const isProcessor = roles.includes("processor");
  const isTeamMember = isStaff || isProcessor;

  return {
    permissions: data?.permissions ?? {},
    role: data?.role ?? "user",
    roles,
    isLoading,
    hasPermission,
    isSuperAdmin,
    isAdmin,
    isStaff,
    isProcessor,
    isTeamMember,
  };
}
