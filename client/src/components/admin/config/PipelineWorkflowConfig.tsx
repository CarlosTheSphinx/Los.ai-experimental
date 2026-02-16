import { useTenantConfig } from "@/hooks/use-tenant-config";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useEffect } from "react";
import { Save, Plus, Trash2, GitBranch, XCircle, PauseCircle, Bell } from "lucide-react";

interface ApprovalStep {
  stage: string;
  requiredRole: string;
  description: string;
}

const defaults = {
  stageConfigs: {} as Record<string, any>,
  approvalSteps: [
    { stage: "underwriting", requiredRole: "admin", description: "Admin approval required before moving to closing" },
  ] as ApprovalStep[],
  denialReasons: [
    "Credit score below minimum",
    "Insufficient collateral",
    "Incomplete documentation",
    "Failed background check",
    "Property does not meet guidelines",
    "Borrower experience insufficient",
    "Loan amount exceeds program limits",
  ],
  suspensionReasons: [
    "Awaiting additional documentation",
    "Pending appraisal review",
    "Title issues",
    "Insurance verification pending",
    "Borrower unresponsive",
  ],
  autoNotifications: true,
  taskRemindersEnabled: true,
  taskReminderDays: 3,
};

export default function PipelineWorkflowConfig() {
  const { config, isLoading, hasChanges, updateField, save, isPending, isSuccess } =
    useTenantConfig("tenant_pipeline_config", defaults);
  const { toast } = useToast();

  useEffect(() => {
    if (isSuccess) {
      toast({ title: "Pipeline settings saved", description: "Your pipeline and workflow configuration has been updated." });
    }
  }, [isSuccess]);

  const updateApprovalStep = (index: number, field: keyof ApprovalStep, value: string) => {
    const updated = [...config.approvalSteps];
    updated[index] = { ...updated[index], [field]: value };
    updateField("approvalSteps", updated);
  };

  const addApprovalStep = () => {
    updateField("approvalSteps", [...config.approvalSteps, { stage: "", requiredRole: "admin", description: "" }]);
  };

  const removeApprovalStep = (index: number) => {
    updateField("approvalSteps", config.approvalSteps.filter((_: ApprovalStep, i: number) => i !== index));
  };

  const updateDenialReason = (index: number, value: string) => {
    const updated = [...config.denialReasons];
    updated[index] = value;
    updateField("denialReasons", updated);
  };

  const addDenialReason = () => {
    updateField("denialReasons", [...config.denialReasons, ""]);
  };

  const removeDenialReason = (index: number) => {
    updateField("denialReasons", config.denialReasons.filter((_: string, i: number) => i !== index));
  };

  const updateSuspensionReason = (index: number, value: string) => {
    const updated = [...config.suspensionReasons];
    updated[index] = value;
    updateField("suspensionReasons", updated);
  };

  const addSuspensionReason = () => {
    updateField("suspensionReasons", [...config.suspensionReasons, ""]);
  };

  const removeSuspensionReason = (index: number) => {
    updateField("suspensionReasons", config.suspensionReasons.filter((_: string, i: number) => i !== index));
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-72" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle data-testid="text-pipeline-config-title">Pipeline & Workflow Configuration</CardTitle>
        <CardDescription data-testid="text-pipeline-config-description">
          Configure approval workflows, denial/suspension reasons, and automation settings.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-8">
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <GitBranch className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-medium">Approval Stages</h3>
          </div>
          <div className="grid gap-3">
            {config.approvalSteps.map((step: ApprovalStep, index: number) => (
              <div key={index} className="flex items-start gap-2 rounded-md border p-3 flex-wrap">
                <div className="grid flex-1 gap-2 sm:grid-cols-3 min-w-0">
                  <div className="space-y-1">
                    <Label htmlFor={`approval-stage-${index}`}>Stage</Label>
                    <Input
                      id={`approval-stage-${index}`}
                      data-testid={`input-approval-stage-${index}`}
                      value={step.stage}
                      onChange={(e) => updateApprovalStep(index, "stage", e.target.value)}
                      placeholder="e.g. underwriting"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`approval-role-${index}`}>Required Role</Label>
                    <Select
                      value={step.requiredRole}
                      onValueChange={(val) => updateApprovalStep(index, "requiredRole", val)}
                    >
                      <SelectTrigger data-testid={`select-approval-role-${index}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="super_admin">Super Admin</SelectItem>
                        <SelectItem value="manager">Manager</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`approval-desc-${index}`}>Description</Label>
                    <Input
                      id={`approval-desc-${index}`}
                      data-testid={`input-approval-desc-${index}`}
                      value={step.description}
                      onChange={(e) => updateApprovalStep(index, "description", e.target.value)}
                      placeholder="Description of this approval stage"
                    />
                  </div>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  data-testid={`button-remove-approval-${index}`}
                  onClick={() => removeApprovalStep(index)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
          <Button
            variant="outline"
            data-testid="button-add-approval-step"
            onClick={addApprovalStep}
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Approval Stage
          </Button>
        </section>

        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <XCircle className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-medium">Denial Reasons</h3>
          </div>
          <div className="grid gap-2">
            {config.denialReasons.map((reason: string, index: number) => (
              <div key={index} className="flex items-center gap-2">
                <Input
                  data-testid={`input-denial-reason-${index}`}
                  value={reason}
                  onChange={(e) => updateDenialReason(index, e.target.value)}
                  placeholder="Denial reason"
                />
                <Button
                  size="icon"
                  variant="ghost"
                  data-testid={`button-remove-denial-${index}`}
                  onClick={() => removeDenialReason(index)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
          <Button
            variant="outline"
            data-testid="button-add-denial-reason"
            onClick={addDenialReason}
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Reason
          </Button>
        </section>

        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <PauseCircle className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-medium">Suspension Reasons</h3>
          </div>
          <div className="grid gap-2">
            {config.suspensionReasons.map((reason: string, index: number) => (
              <div key={index} className="flex items-center gap-2">
                <Input
                  data-testid={`input-suspension-reason-${index}`}
                  value={reason}
                  onChange={(e) => updateSuspensionReason(index, e.target.value)}
                  placeholder="Suspension reason"
                />
                <Button
                  size="icon"
                  variant="ghost"
                  data-testid={`button-remove-suspension-${index}`}
                  onClick={() => removeSuspensionReason(index)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
          <Button
            variant="outline"
            data-testid="button-add-suspension-reason"
            onClick={addSuspensionReason}
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Reason
          </Button>
        </section>

        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-medium">Automation Settings</h3>
          </div>
          <div className="grid gap-4">
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <Label htmlFor="autoNotifications">Auto Notifications</Label>
                <p className="text-sm text-muted-foreground">Automatically send notifications on stage changes</p>
              </div>
              <Switch
                id="autoNotifications"
                data-testid="switch-auto-notifications"
                checked={config.autoNotifications}
                onCheckedChange={(checked) => updateField("autoNotifications", checked)}
              />
            </div>
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <Label htmlFor="taskRemindersEnabled">Task Reminders</Label>
                <p className="text-sm text-muted-foreground">Send reminders for overdue tasks</p>
              </div>
              <Switch
                id="taskRemindersEnabled"
                data-testid="switch-task-reminders"
                checked={config.taskRemindersEnabled}
                onCheckedChange={(checked) => updateField("taskRemindersEnabled", checked)}
              />
            </div>
            {config.taskRemindersEnabled && (
              <div className="space-y-2">
                <Label htmlFor="taskReminderDays">Reminder Interval (days)</Label>
                <Input
                  id="taskReminderDays"
                  data-testid="input-task-reminder-days"
                  type="number"
                  min={1}
                  value={config.taskReminderDays}
                  onChange={(e) => updateField("taskReminderDays", parseInt(e.target.value) || 1)}
                />
              </div>
            )}
          </div>
        </section>

        <Button
          data-testid="button-save-pipeline-config"
          onClick={save}
          disabled={!hasChanges || isPending}
        >
          <Save className="mr-2 h-4 w-4" />
          {isPending ? "Saving..." : "Save Changes"}
        </Button>
      </CardContent>
    </Card>
  );
}
