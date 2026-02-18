import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Shield } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { PERMISSION_CATEGORIES, SCOPABLE_PERMISSIONS, type PermissionKey } from "@shared/schema";

interface PermissionValue {
  enabled: boolean;
  scope: string;
}

interface PermissionState {
  [role: string]: {
    [key: string]: PermissionValue;
  };
}

function TeamPermissionsPage() {
  const { toast } = useToast();
  const [selectedRole, setSelectedRole] = useState<string>("processor");

  const { data, isLoading, refetch } = useQuery<PermissionState>({
    queryKey: ["team-permissions"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/admin/team-permissions");
      return response.json();
    },
  });

  const updatePermissionMutation = useMutation({
    mutationFn: async (payload: {
      role: string;
      permissionKey: string;
      enabled: boolean;
      scope?: string;
    }) => {
      return await apiRequest("PUT", "/api/admin/team-permissions", payload);
    },
    onSuccess: () => {
      toast({
        title: "Permission updated",
      });
      queryClient.invalidateQueries({ queryKey: ["team-permissions"] });
      refetch();
    },
    onError: () => {
      toast({
        title: "Failed to update permission",
        variant: "destructive",
      });
    },
  });

  const handleToggle = (role: string, permissionKey: string, currentValue: boolean) => {
    updatePermissionMutation.mutate({
      role,
      permissionKey,
      enabled: !currentValue,
    });
  };

  const handleScopeChange = (role: string, permissionKey: string, scope: string) => {
    const currentEnabled = data?.[role]?.[permissionKey]?.enabled ?? false;
    updatePermissionMutation.mutate({
      role,
      permissionKey,
      enabled: currentEnabled,
      scope,
    });
  };

  const isEditableRole = (role: string) => {
    return role === "processor";
  };

  const isScopable = (key: string) => {
    return SCOPABLE_PERMISSIONS.includes(key as PermissionKey);
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Team Permissions</CardTitle>
            <CardDescription>
              Manage role-based permissions for team members
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-20" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const roleOptions = [
    { value: "processor", label: "Processor" },
    { value: "admin", label: "Admin" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-4xl font-bold tracking-tight flex items-center gap-2" data-testid="text-team-permissions-title">
          <Shield className="h-10 w-10" />
          Team Permissions
        </h1>
        <p className="text-muted-foreground mt-2">
          Configure role-based permissions for processors and admin users
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Permission Management</CardTitle>
          <CardDescription>
            Select a role to view and edit its permissions. Admin role has all permissions and cannot be modified.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="processor" value={selectedRole} onValueChange={setSelectedRole}>
            <TabsList className="grid w-full grid-cols-2">
              {roleOptions.map((role) => (
                <TabsTrigger key={role.value} value={role.value} data-testid={`tab-role-${role.value}`}>
                  <div className="flex items-center gap-2">
                    {role.label}
                    {role.value === "admin" && (
                      <Badge variant="secondary" className="ml-1">
                        Full
                      </Badge>
                    )}
                  </div>
                </TabsTrigger>
              ))}
            </TabsList>

            {roleOptions.map((role) => (
              <TabsContent key={role.value} value={role.value} className="space-y-6">
                {!isEditableRole(role.value) && (
                  <div className="bg-muted p-4 rounded-lg border border-border">
                    <p className="text-sm text-muted-foreground">
                      Admin users have full access to all permissions.
                    </p>
                  </div>
                )}

                <div className="space-y-6">
                  {Object.entries(PERMISSION_CATEGORIES).map(
                    ([categoryKey, category]) => (
                      <div
                        key={categoryKey}
                        className="border rounded-lg p-4 space-y-4"
                      >
                        <div className="flex items-center justify-between">
                          <h3 className="font-semibold text-base">
                            {category.label}
                          </h3>
                          <Badge variant="outline">
                            {category.permissions.filter((p) => {
                              const permValue = data?.[role.value]?.[p.key];
                              return permValue?.enabled;
                            }).length} / {category.permissions.length}
                          </Badge>
                        </div>

                        <div className="space-y-3">
                          {category.permissions.map((permission) => {
                            const permValue = data?.[role.value]?.[permission.key];
                            const isEnabled = permValue?.enabled || false;
                            const scope = permValue?.scope || "all";
                            const isEditable = isEditableRole(role.value);
                            const showScope = isEditable && isScopable(permission.key) && isEnabled;

                            return (
                              <div
                                key={permission.key}
                                className="p-3 bg-muted/50 rounded"
                              >
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-3 flex-1">
                                    <Label
                                      htmlFor={`${role.value}-${permission.key}`}
                                      className="cursor-pointer flex-1 font-normal"
                                    >
                                      {permission.label}
                                    </Label>
                                    <code className="text-xs text-muted-foreground bg-background px-2 py-1 rounded">
                                      {permission.key}
                                    </code>
                                  </div>

                                  {isEditable ? (
                                    <Switch
                                      id={`${role.value}-${permission.key}`}
                                      checked={isEnabled}
                                      onCheckedChange={() =>
                                        handleToggle(role.value, permission.key, isEnabled)
                                      }
                                      disabled={updatePermissionMutation.isPending}
                                      data-testid={`switch-${role.value}-${permission.key}`}
                                    />
                                  ) : (
                                    <Badge
                                      variant={isEnabled ? "default" : "secondary"}
                                    >
                                      {isEnabled ? "Enabled" : "Disabled"}
                                    </Badge>
                                  )}
                                </div>

                                {showScope && (
                                  <div className="mt-3 flex items-center gap-3 pl-1">
                                    <span className="text-xs text-muted-foreground">Scope:</span>
                                    <Select
                                      value={scope}
                                      onValueChange={(val) => handleScopeChange(role.value, permission.key, val)}
                                      disabled={updatePermissionMutation.isPending}
                                    >
                                      <SelectTrigger className="w-[180px] h-8 text-xs" data-testid={`select-scope-${permission.key}`}>
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="all">All</SelectItem>
                                        <SelectItem value="assigned_only">Assigned Only</SelectItem>
                                      </SelectContent>
                                    </Select>
                                    {scope === "assigned_only" && (
                                      <span className="text-xs text-muted-foreground">
                                        Only sees items on deals they are assigned to
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )
                  )}
                </div>
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>

      <Card className="bg-muted/50 border-muted">
        <CardHeader>
          <CardTitle className="text-sm">Role Hierarchy</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            <span className="font-semibold">Processor:</span> Can be assigned to specific deals and tasks. Permissions are customizable above. Use "Assigned Only" scope to limit visibility to their assigned deals.
          </p>
          <p>
            <span className="font-semibold">Admin:</span> Has full access to all
            permissions and settings.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export default TeamPermissionsPage;
