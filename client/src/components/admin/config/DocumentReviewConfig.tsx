import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Save,
  FileSearch,
  Zap,
  Clock,
  Hand,
  Bell,
  Mail,
  MessageSquare,
  Smartphone,
  Users,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Play,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface ReviewConfig {
  id?: number;
  aiReviewMode: string;
  timedReviewIntervalMinutes: number;
  failAlertEnabled: boolean;
  failAlertRecipients: string;
  failAlertChannels: { email?: boolean; sms?: boolean; inApp?: boolean };
  passNotifyEnabled: boolean;
  passNotifyChannels: { email?: boolean; inApp?: boolean };
  digestAutoSend: boolean;
  aiDraftAutoSend: boolean;
  draftReadyNotifyEnabled: boolean;
  draftReadyNotifyChannels: { email?: boolean; inApp?: boolean };
}

const DEFAULT_CONFIG: ReviewConfig = {
  aiReviewMode: "manual",
  timedReviewIntervalMinutes: 60,
  failAlertEnabled: true,
  failAlertRecipients: "both",
  failAlertChannels: { email: true, sms: false, inApp: true },
  passNotifyEnabled: true,
  passNotifyChannels: { email: false, inApp: true },
  digestAutoSend: false,
  aiDraftAutoSend: false,
  draftReadyNotifyEnabled: true,
  draftReadyNotifyChannels: { email: true, inApp: true },
};

export default function DocumentReviewConfig() {
  const { toast } = useToast();
  const [config, setConfig] = useState<ReviewConfig>(DEFAULT_CONFIG);
  const [hasChanges, setHasChanges] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["/api/admin/review-config"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/review-config");
      return res.json();
    },
  });

  useEffect(() => {
    if (data) {
      setConfig({
        ...DEFAULT_CONFIG,
        ...data,
        failAlertChannels: data.failAlertChannels || DEFAULT_CONFIG.failAlertChannels,
        passNotifyChannels: data.passNotifyChannels || DEFAULT_CONFIG.passNotifyChannels,
        draftReadyNotifyChannels: data.draftReadyNotifyChannels || DEFAULT_CONFIG.draftReadyNotifyChannels,
      });
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: async (configData: ReviewConfig) => {
      const res = await apiRequest("PUT", "/api/admin/review-config", configData);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/review-config"] });
      setHasChanges(false);
      toast({ title: "Configuration saved", description: "Document review settings updated successfully." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save configuration.", variant: "destructive" });
    },
  });

  const batchMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/review-config/run-batch");
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Batch Review Complete",
        description: `Reviewed ${data.reviewed} documents. ${data.errors} errors.`,
      });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to run batch review.", variant: "destructive" });
    },
  });

  const updateConfig = (updates: Partial<ReviewConfig>) => {
    setConfig((prev) => ({ ...prev, ...updates }));
    setHasChanges(true);
  };

  const updateChannels = (
    field: "failAlertChannels" | "passNotifyChannels" | "draftReadyNotifyChannels",
    channel: string,
    value: boolean
  ) => {
    setConfig((prev) => ({
      ...prev,
      [field]: { ...prev[field], [channel]: value },
    }));
    setHasChanges(true);
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  const reviewModeIcons: Record<string, React.ReactNode> = {
    automatic: <Zap className="h-4 w-4 text-green-500" />,
    timed: <Clock className="h-4 w-4 text-blue-500" />,
    manual: <Hand className="h-4 w-4 text-gray-500" />,
  };

  return (
    <div className="space-y-6">
      {/* Header with save button */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Document Review & Communications</h2>
          <p className="text-sm text-muted-foreground">
            Configure how uploaded documents are reviewed and how notifications are sent.
          </p>
        </div>
        <Button
          onClick={() => saveMutation.mutate(config)}
          disabled={!hasChanges || saveMutation.isPending}
        >
          <Save className="h-4 w-4 mr-2" />
          {saveMutation.isPending ? "Saving..." : "Save Changes"}
        </Button>
      </div>

      {/* AI Review Mode */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSearch className="h-5 w-5" />
            AI Document Review Mode
          </CardTitle>
          <CardDescription>
            Choose when AI reviews uploaded documents against your configured rules.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            {[
              {
                value: "automatic",
                label: "Automatic",
                desc: "Review immediately when a document is uploaded",
                icon: <Zap className="h-5 w-5 text-green-500" />,
              },
              {
                value: "timed",
                label: "Timed / Batch",
                desc: "Review documents on a schedule (batch processing)",
                icon: <Clock className="h-5 w-5 text-blue-500" />,
              },
              {
                value: "manual",
                label: "Manual",
                desc: "You trigger AI review manually per document",
                icon: <Hand className="h-5 w-5 text-gray-500" />,
              },
            ].map((mode) => (
              <button
                key={mode.value}
                onClick={() => updateConfig({ aiReviewMode: mode.value })}
                className={`p-4 rounded-lg border-2 text-left transition-colors ${
                  config.aiReviewMode === mode.value
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50"
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  {mode.icon}
                  <span className="font-medium">{mode.label}</span>
                </div>
                <p className="text-xs text-muted-foreground">{mode.desc}</p>
              </button>
            ))}
          </div>

          {config.aiReviewMode === "timed" && (
            <div className="flex items-center gap-4 pt-2">
              <Label className="whitespace-nowrap">Review every</Label>
              <Input
                type="number"
                min={15}
                max={1440}
                value={config.timedReviewIntervalMinutes}
                onChange={(e) =>
                  updateConfig({ timedReviewIntervalMinutes: parseInt(e.target.value) || 60 })
                }
                className="w-24"
              />
              <span className="text-sm text-muted-foreground">minutes</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => batchMutation.mutate()}
                disabled={batchMutation.isPending}
              >
                <Play className="h-3 w-3 mr-1" />
                {batchMutation.isPending ? "Running..." : "Run Now"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Fail Alert Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <XCircle className="h-5 w-5 text-red-500" />
            Failed Review Alerts
          </CardTitle>
          <CardDescription>
            When a document fails AI review, instantly notify the borrower and/or broker.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label>Enable instant fail alerts</Label>
            <Switch
              checked={config.failAlertEnabled}
              onCheckedChange={(v) => updateConfig({ failAlertEnabled: v })}
            />
          </div>

          {config.failAlertEnabled && (
            <>
              <Separator />
              <div className="space-y-3">
                <Label>Who gets notified?</Label>
                <Select
                  value={config.failAlertRecipients}
                  onValueChange={(v) => updateConfig({ failAlertRecipients: v })}
                >
                  <SelectTrigger className="w-[200px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="borrower">Borrower only</SelectItem>
                    <SelectItem value="broker">Broker only</SelectItem>
                    <SelectItem value="both">Both borrower & broker</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-3">
                <Label>Alert channels</Label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Switch
                      checked={config.failAlertChannels?.inApp ?? true}
                      onCheckedChange={(v) => updateChannels("failAlertChannels", "inApp", v)}
                    />
                    <Bell className="h-4 w-4" />
                    <span className="text-sm">In-App</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Switch
                      checked={config.failAlertChannels?.email ?? false}
                      onCheckedChange={(v) => updateChannels("failAlertChannels", "email", v)}
                    />
                    <Mail className="h-4 w-4" />
                    <span className="text-sm">Email</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Switch
                      checked={config.failAlertChannels?.sms ?? false}
                      onCheckedChange={(v) => updateChannels("failAlertChannels", "sms", v)}
                    />
                    <Smartphone className="h-4 w-4" />
                    <span className="text-sm">SMS</span>
                  </label>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Pass Notification Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-500" />
            Passed Review Notifications
          </CardTitle>
          <CardDescription>
            When a document passes AI review, you get notified to give final human approval.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label>Notify me when documents pass AI review</Label>
            <Switch
              checked={config.passNotifyEnabled}
              onCheckedChange={(v) => updateConfig({ passNotifyEnabled: v })}
            />
          </div>

          {config.passNotifyEnabled && (
            <>
              <Separator />
              <div className="space-y-3">
                <Label>Notification channels</Label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Switch
                      checked={config.passNotifyChannels?.inApp ?? true}
                      onCheckedChange={(v) => updateChannels("passNotifyChannels", "inApp", v)}
                    />
                    <Bell className="h-4 w-4" />
                    <span className="text-sm">In-App</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Switch
                      checked={config.passNotifyChannels?.email ?? false}
                      onCheckedChange={(v) => updateChannels("passNotifyChannels", "email", v)}
                    />
                    <Mail className="h-4 w-4" />
                    <span className="text-sm">Email</span>
                  </label>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Communications Engine */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Communications Engine
          </CardTitle>
          <CardDescription>
            Control how AI-drafted communications and scheduled digests are handled.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Digest auto-send */}
          <div className="flex items-center justify-between">
            <div>
              <Label>Auto-send scheduled digests</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                When off, digest drafts require your approval before sending.
              </p>
            </div>
            <Switch
              checked={config.digestAutoSend}
              onCheckedChange={(v) => updateConfig({ digestAutoSend: v })}
            />
          </div>

          <Separator />

          {/* AI draft auto-send */}
          <div className="flex items-center justify-between">
            <div>
              <Label>Auto-send AI communication drafts</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                When off, AI-generated emails go to your review queue before sending.
              </p>
            </div>
            <Switch
              checked={config.aiDraftAutoSend}
              onCheckedChange={(v) => updateConfig({ aiDraftAutoSend: v })}
            />
          </div>

          <Separator />

          {/* Draft ready notification */}
          <div className="flex items-center justify-between">
            <div>
              <Label>Notify when a draft is ready for review</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Get alerted when a new communication draft needs your attention.
              </p>
            </div>
            <Switch
              checked={config.draftReadyNotifyEnabled}
              onCheckedChange={(v) => updateConfig({ draftReadyNotifyEnabled: v })}
            />
          </div>

          {config.draftReadyNotifyEnabled && (
            <div className="space-y-3 pl-4">
              <Label className="text-xs">Draft notification channels</Label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <Switch
                    checked={config.draftReadyNotifyChannels?.inApp ?? true}
                    onCheckedChange={(v) => updateChannels("draftReadyNotifyChannels", "inApp", v)}
                  />
                  <Bell className="h-4 w-4" />
                  <span className="text-sm">In-App</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <Switch
                    checked={config.draftReadyNotifyChannels?.email ?? false}
                    onCheckedChange={(v) => updateChannels("draftReadyNotifyChannels", "email", v)}
                  />
                  <Mail className="h-4 w-4" />
                  <span className="text-sm">Email</span>
                </label>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Status summary */}
      <Card className="bg-muted/30">
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="gap-1">
              {reviewModeIcons[config.aiReviewMode]}
              Review: {config.aiReviewMode}
            </Badge>
            <Badge variant={config.failAlertEnabled ? "default" : "secondary"} className="gap-1">
              <AlertTriangle className="h-3 w-3" />
              Fail alerts: {config.failAlertEnabled ? "on" : "off"}
            </Badge>
            <Badge variant={config.passNotifyEnabled ? "default" : "secondary"} className="gap-1">
              <CheckCircle2 className="h-3 w-3" />
              Pass notify: {config.passNotifyEnabled ? "on" : "off"}
            </Badge>
            <Badge variant={config.digestAutoSend ? "destructive" : "secondary"} className="gap-1">
              Digests: {config.digestAutoSend ? "auto-send" : "approval required"}
            </Badge>
            <Badge variant={config.aiDraftAutoSend ? "destructive" : "secondary"} className="gap-1">
              AI drafts: {config.aiDraftAutoSend ? "auto-send" : "approval required"}
            </Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
