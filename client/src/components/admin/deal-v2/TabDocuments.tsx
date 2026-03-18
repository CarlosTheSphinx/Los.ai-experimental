import { useState, useRef, useCallback, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Upload, FileText, CheckCircle2, Clock, AlertCircle, Eye,
  Loader2, Zap, Hand, FolderOpen, ChevronDown, ChevronRight, Bot, CloudUpload,
  XCircle, Shield, ShieldCheck, Play, RotateCw, HardDriveUpload, ExternalLink,
  X, Download, Plus, User,
} from "lucide-react";
import { formatDateTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/ui/phase1/empty-state";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

function statusDisplay(status: string, aiReviewStatus?: string, driveStatus?: string) {
  const s = status?.toLowerCase();
  const ai = aiReviewStatus?.toLowerCase();
  const drive = driveStatus?.toLowerCase();

  if (s === "approved" || s === "accepted") {
    return { dot: "bg-emerald-500", label: "Approved", step: 4 };
  }
  if (s === "rejected" || s === "denied") {
    return { dot: "bg-red-500", label: s === "denied" ? "Denied" : "Rejected", step: 4 };
  }
  if (s === "update_needed") {
    return { dot: "bg-amber-500", label: "Update Needed", step: 4 };
  }
  if (s === "conditional") {
    return { dot: "bg-amber-500", label: "Conditional", step: 4 };
  }
  if (s === "at_risk") {
    return { dot: "bg-orange-500", label: "At Risk", step: 4 };
  }
  if (ai === "approved") {
    return { dot: "bg-blue-500", label: "AI Approved", step: 3 };
  }
  if (ai === "denied") {
    return { dot: "bg-red-400", label: "AI Rejected", step: 3 };
  }
  if (s === "ai_reviewed" || ai === "reviewed") {
    return { dot: "bg-blue-500", label: "AI Reviewed", step: 3 };
  }
  if (ai === "reviewing") {
    return { dot: "bg-blue-400 animate-pulse", label: "Reviewing...", step: 2.5 };
  }
  if (ai === "pending") {
    return { dot: "bg-amber-400", label: "Queued for Review", step: 2.5 };
  }
  if (s === "uploaded") {
    return { dot: "bg-blue-400", label: "Uploaded", step: 2 };
  }
  if (s === "waived") {
    return { dot: "bg-gray-400", label: "Waived", step: 0 };
  }
  if (s === "not_applicable") {
    return { dot: "bg-gray-400", label: "N/A", step: 0 };
  }
  return { dot: "bg-gray-300", label: "Outstanding", step: 1 };
}

function fileCountLabel(doc: any) {
  const count = doc.fileCount || (doc.filePath || doc.fileName ? 1 : 0);
  if (count === 0) return "0 files";
  return count === 1 ? "1 file" : `${count} files`;
}

const REVIEW_MODE_DESCRIPTIONS: Record<string, string> = {
  automatic: "Documents are reviewed automatically on upload",
  timed: "Documents are reviewed on a scheduled basis",
  manual: "Documents are reviewed when manually triggered",
};

const FREQUENCY_PRESETS = [
  { value: "720", label: "Twice daily" },
  { value: "1440", label: "Daily" },
  { value: "2880", label: "Every 2 days" },
  { value: "4320", label: "Every 3 days" },
  { value: "7200", label: "Every 5 days" },
  { value: "10080", label: "Weekly" },
  { value: "custom", label: "Custom" },
];

const PRESET_VALUES = new Set(FREQUENCY_PRESETS.filter(p => p.value !== "custom").map(p => p.value));

function deriveCustomState(val: number | null) {
  const strVal = val ? String(val) : "1440";
  const isPreset = PRESET_VALUES.has(strVal);
  if (!val || isPreset) return { isCustom: false, amount: 1, unit: "days" as const };
  const unit = val % 10080 === 0 ? "weeks" as const : "days" as const;
  const amount = unit === "weeks" ? val / 10080 : val / 1440;
  return { isCustom: true, amount: Math.max(1, Math.round(amount)), unit };
}

function FrequencyPicker({
  value,
  onChange,
  testId,
}: {
  value: number | null;
  onChange: (minutes: number) => void;
  testId: string;
}) {
  const initial = deriveCustomState(value);
  const [isCustom, setIsCustom] = useState(initial.isCustom);
  const [customAmount, setCustomAmount] = useState(initial.amount);
  const [customUnit, setCustomUnit] = useState<"days" | "weeks">(initial.unit);

  useEffect(() => {
    const derived = deriveCustomState(value);
    setIsCustom(derived.isCustom);
    setCustomAmount(derived.amount);
    setCustomUnit(derived.unit);
  }, [value]);

  const selectValue = isCustom ? "custom" : (value ? String(value) : "1440");

  const handlePresetChange = (val: string) => {
    if (val === "custom") {
      setIsCustom(true);
      setCustomAmount(1);
      setCustomUnit("days");
      onChange(1440);
    } else {
      setIsCustom(false);
      onChange(parseInt(val));
    }
  };

  const handleCustomUpdate = (amount: number, unit: "days" | "weeks") => {
    const clamped = Math.max(1, amount);
    setCustomAmount(clamped);
    setCustomUnit(unit);
    const minutes = unit === "weeks" ? clamped * 10080 : clamped * 1440;
    onChange(minutes);
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Select
        value={selectValue}
        onValueChange={handlePresetChange}
      >
        <SelectTrigger className="w-[150px] h-8 text-[14px]" data-testid={testId}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {FREQUENCY_PRESETS.map((p) => (
            <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {isCustom && (
        <div className="flex items-center gap-1.5">
          <Input
            type="number"
            min={1}
            value={customAmount}
            onChange={(e) => handleCustomUpdate(parseInt(e.target.value) || 1, customUnit)}
            className="w-[60px] h-8 text-[14px]"
            data-testid={`${testId}-custom-amount`}
          />
          <Select
            value={customUnit}
            onValueChange={(v) => handleCustomUpdate(customAmount, v as "days" | "weeks")}
          >
            <SelectTrigger className="w-[90px] h-8 text-[14px]" data-testid={`${testId}-custom-unit`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="days">days</SelectItem>
              <SelectItem value="weeks">weeks</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}

export default function TabDocuments({
  deal,
  documents,
  dealId,
  stages: stagesProp,
}: {
  deal: any;
  documents: any[];
  dealId: string;
  stages?: any[];
}) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingFiles, setUploadingFiles] = useState<string[]>([]);
  const [previewDoc, setPreviewDoc] = useState<{ url: string; fileName: string; mimeType: string } | null>(null);

  const apiBase = `/api/admin/deals`;
  const numericDealId = parseInt(dealId);

  const reviewModeQuery = useQuery<{
    dealReviewMode: string;
    dealIntervalMinutes: number | null;
    scheduledTime: string | null;
    scheduledDays: string[] | null;
    timezone: string | null;
    communicationFrequencyMinutes: number | null;
    commAutoSend: boolean;
    commSendDeadline: string | null;
  }>({
    queryKey: ["/api/projects", numericDealId, "review-mode"],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${numericDealId}/review-mode`, { credentials: "include" });
      if (!res.ok) return { dealReviewMode: "manual", dealIntervalMinutes: null, scheduledTime: null, scheduledDays: null, timezone: null, communicationFrequencyMinutes: null, commAutoSend: false, commSendDeadline: null };
      return res.json();
    },
    enabled: !!dealId,
  });

  const currentMode = reviewModeQuery.data?.dealReviewMode ?? deal?.aiReviewMode ?? "manual";
  const reviewData = reviewModeQuery.data;

  const updateReviewMode = useMutation({
    mutationFn: async (payload: Record<string, any>) => {
      const res = await apiRequest("PUT", `/api/projects/${dealId}/review-mode`, payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", numericDealId, "review-mode"] });
      toast({ title: "Review mode updated" });
    },
    onError: () => {
      toast({ title: "Failed to update review mode", variant: "destructive" });
    },
  });

  const aiReviewedCount = documents.filter((d) => d.status === "ai_reviewed" || d.aiReviewStatus === "approved").length;

  const approveAllMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `${apiBase}/${dealId}/documents/approve-all`);
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: [`/api/deals/${dealId}/documents`] });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/deals/${dealId}/documents`] });
      queryClient.invalidateQueries({ queryKey: [apiBase, dealId, "documents"] });
      toast({ title: `Approved ${data.approved || 0} documents` });
    },
    onError: () => {
      toast({ title: "Failed to approve documents", variant: "destructive" });
    },
  });

  const reviewAllMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `${apiBase}/${dealId}/documents/review-all`);
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: [`/api/deals/${dealId}/documents`] });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/deals/${dealId}/documents`] });
      queryClient.invalidateQueries({ queryKey: [apiBase, dealId, "documents"] });
      toast({ title: data.message || `Triggered review for ${data.reviewed || 0} documents` });
    },
    onError: () => {
      toast({ title: "Failed to trigger batch review", variant: "destructive" });
    },
  });

  const stagesQuery = useQuery<any[]>({
    queryKey: ["/api/admin/deals", dealId, "stages"],
    queryFn: async () => {
      const res = await fetch(`/api/admin/deals/${dealId}`, { credentials: "include" });
      if (!res.ok) return [];
      const data = await res.json();
      return data.stages || [];
    },
    enabled: !!dealId && !stagesProp?.length,
  });
  const stages = stagesProp?.length ? stagesProp : (stagesQuery.data || []);

  const handleFileUpload = useCallback(
    async (files: FileList) => {
      for (const file of Array.from(files)) {
        const fileName = file.name;
        setUploadingFiles((prev) => [...prev, fileName]);
        try {
          const urlRes = await apiRequest("POST", `/api/deals/${dealId}/documents/upload-url`, {
            name: file.name,
            size: file.size,
            contentType: file.type,
          });
          const urlData = await urlRes.json();

          let objectPath: string;
          if (urlData.useDirectUpload) {
            const fd = new FormData();
            fd.append("file", file);
            const dr = await fetch(urlData.uploadURL, { method: "POST", body: fd, credentials: "include" });
            if (!dr.ok) throw new Error("Upload failed");
            objectPath = (await dr.json()).objectPath;
          } else {
            await fetch(urlData.uploadURL, {
              method: "PUT",
              body: file,
              headers: { "Content-Type": file.type || "application/octet-stream" },
            });
            objectPath = urlData.objectPath;
          }

          await apiRequest("POST", `/api/deals/${dealId}/documents/upload-complete`, {
            objectPath,
            fileName: file.name,
            fileSize: file.size,
            mimeType: file.type,
          });

          toast({ title: `Uploaded: ${file.name}` });
        } catch {
          toast({ title: `Failed to upload ${file.name}`, variant: "destructive" });
        } finally {
          setUploadingFiles((prev) => prev.filter((f) => f !== fileName));
        }
      }
      queryClient.invalidateQueries({ queryKey: [`/api/deals/${dealId}/documents`] });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/deals`, dealId, "documents"] });
      queryClient.invalidateQueries({ queryKey: [apiBase, dealId, "documents"] });
    },
    [dealId, toast, apiBase]
  );

  const stageMap = new Map<number, any>();
  stages.forEach((s: any) => {
    stageMap.set(s.id, s);
  });

  const docsByStage = new Map<number | null, any[]>();
  documents.forEach((doc) => {
    const key = doc.stageId || null;
    if (!docsByStage.has(key)) docsByStage.set(key, []);
    docsByStage.get(key)!.push(doc);
  });

  const sortedStageKeys: (number | null)[] = [];
  const stageIds = stages
    .sort((a: any, b: any) => (a.stageOrder ?? 0) - (b.stageOrder ?? 0))
    .map((s: any) => s.id);
  stageIds.forEach((id: number) => {
    sortedStageKeys.push(id);
  });
  docsByStage.forEach((_, key) => {
    if (key !== null && !sortedStageKeys.includes(key)) sortedStageKeys.push(key);
  });
  if (docsByStage.has(null)) sortedStageKeys.push(null);

  const uploaded = documents.filter((d) => d.filePath || d.fileName).length;
  const uploadedNotReviewed = documents.filter((d) => (d.status === "uploaded") && (d.aiReviewStatus === "not_reviewed" || d.aiReviewStatus === "pending")).length;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="py-3 px-4 space-y-3">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              {[
                { value: "automatic", label: "Automatic", icon: Zap },
                { value: "timed", label: "Timed", icon: Clock },
                { value: "manual", label: "Manual", icon: Hand },
              ].map((mode) => (
                <Button
                  key={mode.value}
                  variant={currentMode === mode.value ? "default" : "outline"}
                  size="sm"
                  onClick={() => updateReviewMode.mutate({ aiReviewMode: mode.value })}
                  disabled={updateReviewMode.isPending}
                  className={cn(
                    currentMode === mode.value && mode.value === "automatic" &&
                      "bg-emerald-600 text-white border-emerald-600"
                  )}
                  data-testid={`button-review-mode-${mode.value}`}
                >
                  <mode.icon className="h-3.5 w-3.5 mr-1.5" />
                  {mode.label}
                </Button>
              ))}
              <span className="text-[14px] text-muted-foreground ml-2">
                {REVIEW_MODE_DESCRIPTIONS[currentMode] || REVIEW_MODE_DESCRIPTIONS.manual}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {currentMode === "manual" && (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  onClick={() => reviewAllMutation.mutate()}
                  disabled={reviewAllMutation.isPending || uploadedNotReviewed === 0}
                  data-testid="button-auto-process-docs"
                >
                  {reviewAllMutation.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Play className="h-3.5 w-3.5" />
                  )}
                  Auto Process ({uploadedNotReviewed})
                </Button>
              )}
              <Button
                size="sm"
                className="bg-emerald-600 text-white border-emerald-600"
                onClick={() => approveAllMutation.mutate()}
                disabled={approveAllMutation.isPending || aiReviewedCount === 0}
                data-testid="button-approve-all-docs"
              >
                {approveAllMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                )}
                Approve All ({aiReviewedCount})
              </Button>
            </div>
          </div>

          {currentMode === "automatic" && (
            <div className="border-t pt-3 space-y-3" data-testid="panel-automatic-settings">
              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <Label className="text-[14px] text-muted-foreground whitespace-nowrap">Message frequency</Label>
                  <FrequencyPicker
                    value={reviewData?.communicationFrequencyMinutes ?? null}
                    onChange={(minutes) =>
                      updateReviewMode.mutate({
                        aiReviewMode: "automatic",
                        communicationFrequencyMinutes: minutes,
                      })
                    }
                    testId="select-comm-frequency"
                  />
                </div>
              </div>
              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={reviewData?.commAutoSend ?? false}
                    onCheckedChange={(checked) =>
                      updateReviewMode.mutate({
                        aiReviewMode: "automatic",
                        commAutoSend: checked,
                        commSendDeadline: reviewData?.commSendDeadline || "10:00",
                      })
                    }
                    data-testid="switch-auto-send"
                  />
                  <Label className="text-[14px] text-muted-foreground whitespace-nowrap">
                    Auto-send if not reviewed by
                  </Label>
                </div>
                {reviewData?.commAutoSend && (
                  <Input
                    type="time"
                    className="w-[120px] h-8 text-[14px]"
                    value={reviewData?.commSendDeadline || "10:00"}
                    onChange={(e) =>
                      updateReviewMode.mutate({
                        aiReviewMode: "automatic",
                        commAutoSend: true,
                        commSendDeadline: e.target.value || null,
                      })
                    }
                    data-testid="input-send-deadline"
                  />
                )}
              </div>
            </div>
          )}

          {currentMode === "timed" && (
            <div className="border-t pt-3 space-y-3" data-testid="panel-timed-settings">
              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <Label className="text-[14px] text-muted-foreground whitespace-nowrap">Review time</Label>
                  <Input
                    type="time"
                    className="w-[120px] h-8 text-[14px]"
                    value={reviewData?.scheduledTime || ""}
                    onChange={(e) =>
                      updateReviewMode.mutate({
                        aiReviewMode: "timed",
                        scheduledTime: e.target.value || null,
                        scheduledDays: reviewData?.scheduledDays || null,
                      })
                    }
                    data-testid="input-scheduled-time"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-[14px] text-muted-foreground whitespace-nowrap">Message frequency</Label>
                  <FrequencyPicker
                    value={reviewData?.communicationFrequencyMinutes ?? null}
                    onChange={(minutes) =>
                      updateReviewMode.mutate({
                        aiReviewMode: "timed",
                        communicationFrequencyMinutes: minutes,
                        scheduledTime: reviewData?.scheduledTime || null,
                        scheduledDays: reviewData?.scheduledDays || null,
                      })
                    }
                    testId="select-review-frequency"
                  />
                </div>
              </div>
              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={reviewData?.commAutoSend ?? false}
                    onCheckedChange={(checked) =>
                      updateReviewMode.mutate({
                        aiReviewMode: "timed",
                        commAutoSend: checked,
                        commSendDeadline: reviewData?.commSendDeadline || "10:00",
                        scheduledTime: reviewData?.scheduledTime || null,
                        scheduledDays: reviewData?.scheduledDays || null,
                      })
                    }
                    data-testid="switch-timed-auto-send"
                  />
                  <Label className="text-[14px] text-muted-foreground whitespace-nowrap">
                    Auto-send if not reviewed by
                  </Label>
                </div>
                {reviewData?.commAutoSend && (
                  <Input
                    type="time"
                    className="w-[120px] h-8 text-[14px]"
                    value={reviewData?.commSendDeadline || "10:00"}
                    onChange={(e) =>
                      updateReviewMode.mutate({
                        aiReviewMode: "timed",
                        commAutoSend: true,
                        commSendDeadline: e.target.value || null,
                        scheduledTime: reviewData?.scheduledTime || null,
                        scheduledDays: reviewData?.scheduledDays || null,
                      })
                    }
                    data-testid="input-timed-send-deadline"
                  />
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="py-3 px-4">
          <div className="flex items-center justify-between">
            <div className="text-[16px]">
              <span className="font-medium">{uploaded}</span>
              <span className="text-muted-foreground"> of {documents.length} documents uploaded</span>
            </div>
            <Button size="sm" onClick={() => fileInputRef.current?.click()} data-testid="button-upload-doc">
              <Upload className="h-3.5 w-3.5 mr-1.5" /> Upload
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              data-testid="input-file-upload"
              onChange={(e) => e.target.files && handleFileUpload(e.target.files)}
            />
          </div>
          {uploadingFiles.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {uploadingFiles.map((f) => (
                <div key={f} className="flex items-center gap-2 text-[14px] text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" /> Uploading {f}...
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {sortedStageKeys.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No documents yet"
          description="Upload documents to get started."
          actionLabel="Upload"
          onAction={() => fileInputRef.current?.click()}
        />
      ) : (() => {
        const stageData = sortedStageKeys.map((stageId, idx) => {
          const stageDocs = docsByStage.get(stageId) || [];
          const stage = stageId !== null ? stageMap.get(stageId) : null;
          const stageOrder = stage?.stageOrder ?? idx + 1;
          const stageName = stage?.stageName || stage?.label || stage?.name || (stageId === null ? "General Documents" : `Stage ${stageOrder}`);
          const completedCount = stageDocs.filter(
            (d) => d.status === "approved" || d.status === "accepted"
          ).length;
          const allComplete = completedCount === stageDocs.length && stageDocs.length > 0;
          return { stageId, stageOrder, stageName, completedCount, totalCount: stageDocs.length, allComplete, stageDocs };
        });
        const activeIdx = stageData.findIndex((s) => !s.allComplete);

        return stageData.map((s, idx) => (
          <StageSection
            key={s.stageId ?? "general"}
            stageOrder={s.stageOrder}
            stageName={s.stageName}
            completedCount={s.completedCount}
            totalCount={s.totalCount}
            allComplete={s.allComplete}
            documents={s.stageDocs}
            dealId={dealId}
            defaultOpen={idx === activeIdx}
            currentMode={currentMode}
            onPreview={setPreviewDoc}
          />
        ));
      })()}

      {previewDoc && (
        <DocumentPreviewModal
          url={previewDoc.url}
          fileName={previewDoc.fileName}
          mimeType={previewDoc.mimeType}
          onClose={() => setPreviewDoc(null)}
        />
      )}
    </div>
  );
}

function DocumentPreviewModal({
  url,
  fileName,
  mimeType,
  onClose,
}: {
  url: string;
  fileName: string;
  mimeType: string;
  onClose: () => void;
}) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isImage = mimeType?.startsWith("image/");
  const isPdf = mimeType === "application/pdf";

  useEffect(() => {
    if (isPdf) {
      setLoading(false);
      return;
    }

    let revoke: string | null = null;
    const controller = new AbortController();

    fetch(url, { credentials: "include", signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load file");
        return res.blob();
      })
      .then((blob) => {
        const objectUrl = URL.createObjectURL(blob);
        revoke = objectUrl;
        setBlobUrl(objectUrl);
      })
      .catch((err) => {
        if (err.name !== "AbortError") setError(err.message);
      })
      .finally(() => setLoading(false));

    return () => {
      controller.abort();
      if (revoke) URL.revokeObjectURL(revoke);
    };
  }, [url, isPdf]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      onClick={onClose}
      data-testid="preview-overlay"
    >
      <div
        className="relative w-[90vw] h-[90vh] max-w-6xl bg-card rounded-lg shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 shrink-0">
          <span className="text-[15px] font-semibold truncate mr-4">{fileName}</span>
          <div className="flex items-center gap-2">
            <a
              href={`${url}?download=true`}
              className="h-8 w-8 rounded-full bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center transition-colors"
              data-testid="button-download-preview"
            >
              <Download className="h-4 w-4" />
            </a>
            <button
              onClick={onClose}
              className="h-8 w-8 rounded-full bg-muted hover:bg-muted/80 text-foreground flex items-center justify-center transition-colors"
              data-testid="button-close-preview"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-auto flex items-center justify-center p-4">
          {isPdf ? (
            <div className="w-full h-full flex flex-col">
              <iframe
                src={url}
                className="w-full flex-1 rounded border"
                title={fileName}
                data-testid="preview-pdf"
              />
              <div className="flex justify-center pt-3 shrink-0">
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary"
                  data-testid="link-open-pdf-tab"
                >
                  Open in new tab
                </a>
              </div>
            </div>
          ) : loading ? (
            <div className="flex flex-col items-center gap-3" data-testid="preview-loading">
              <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
              <p className="text-[14px] text-muted-foreground">Loading preview...</p>
            </div>
          ) : error ? (
            <div className="text-center space-y-4" data-testid="preview-error">
              <FileText className="h-16 w-16 text-muted-foreground mx-auto" />
              <p className="text-[16px] text-muted-foreground">Failed to load preview</p>
              <a
                href={`${url}?download=true`}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-[14px] transition-colors"
                data-testid="link-download-error"
              >
                <Download className="h-4 w-4" /> Download File
              </a>
            </div>
          ) : blobUrl && isImage ? (
            <img
              src={blobUrl}
              alt={fileName}
              className="max-w-full max-h-full object-contain"
              data-testid="preview-image"
            />
          ) : (
            <div className="text-center space-y-4" data-testid="preview-unsupported">
              <FileText className="h-16 w-16 text-muted-foreground mx-auto" />
              <p className="text-[16px] text-muted-foreground">Preview not available for this file type</p>
              <a
                href={`${url}?download=true`}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-[14px] transition-colors"
                data-testid="link-download-unsupported"
              >
                <Download className="h-4 w-4" /> Download File
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StageSection({
  stageOrder,
  stageName,
  completedCount,
  totalCount,
  allComplete,
  documents,
  dealId,
  defaultOpen = false,
  currentMode,
  onPreview,
}: {
  stageOrder: number;
  stageName: string;
  completedCount: number;
  totalCount: number;
  allComplete: boolean;
  documents: any[];
  dealId: string;
  defaultOpen?: boolean;
  currentMode: string;
  onPreview: (doc: { url: string; fileName: string; mimeType: string }) => void;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border rounded-md bg-card" data-testid={`stage-section-${stageOrder}`}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-4 py-3 hover-elevate transition-colors"
        data-testid={`button-toggle-stage-${stageOrder}`}
      >
        <div className="flex items-center gap-2.5">
          {allComplete ? (
            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
          ) : (
            <div className="h-5 w-5 rounded-full border-2 border-muted-foreground/40 flex items-center justify-center text-[12px] font-bold text-muted-foreground">
              {stageOrder}
            </div>
          )}
          <span className="text-[16px] font-semibold text-muted-foreground">
            Stage {stageOrder}: {stageName}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[14px] text-muted-foreground">
            {completedCount}/{totalCount} complete
          </span>
          <ChevronDown
            className={cn(
              "h-4 w-4 text-muted-foreground transition-transform duration-200",
              !isOpen && "-rotate-90"
            )}
          />
        </div>
      </button>

      {isOpen && (
        <div className="border-t border-border/50">
          <table className="w-full text-[16px]">
            <thead>
              <tr className="border-b border-border/30 text-left text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2">Document</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Files</th>
                <th className="px-4 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((doc) => (
                <DocumentRow
                  key={doc.id}
                  doc={doc}
                  dealId={dealId}
                  currentMode={currentMode}
                  onPreview={onPreview}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const DOC_STATUS_OPTIONS = [
  { value: "approved", label: "Approved", dot: "bg-emerald-500" },
  { value: "update_needed", label: "Update Needed", dot: "bg-amber-500" },
  { value: "rejected", label: "Rejected", dot: "bg-red-500" },
  { value: "pending", label: "Outstanding", dot: "bg-gray-300" },
] as const;

function DocumentRow({
  doc,
  dealId,
  currentMode,
  onPreview,
}: {
  doc: any;
  dealId: string;
  currentMode: string;
  onPreview: (doc: { url: string; fileName: string; mimeType: string }) => void;
}) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const expandFileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [showNotePrompt, setShowNotePrompt] = useState(false);
  const [updateNote, setUpdateNote] = useState("");

  const { dot, label } = statusDisplay(doc.status, doc.aiReviewStatus, doc.driveUploadStatus);
  const downloadUrl = `/api/admin/deals/${dealId}/documents/${doc.id}/download`;
  const hasFile = doc.filePath || doc.fileName;
  const canReview = hasFile && (doc.aiReviewStatus === "not_reviewed" || doc.aiReviewStatus === "pending" || !doc.aiReviewStatus);

  const invalidateDocQueries = () => {
    queryClient.invalidateQueries({ queryKey: [`/api/deals/${dealId}/documents`] });
    queryClient.invalidateQueries({ queryKey: [`/api/admin/deals/${dealId}/documents`] });
    queryClient.invalidateQueries({ queryKey: [`/api/admin/deals`, dealId, "documents"] });
  };

  const reviewMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/deals/${dealId}/documents/${doc.id}/review`);
      return res.json();
    },
    onSuccess: () => {
      invalidateDocQueries();
      toast({ title: "AI review triggered" });
    },
    onError: () => {
      toast({ title: "Failed to trigger review", variant: "destructive" });
    },
  });

  const driveSyncMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/deals/${dealId}/documents/${doc.id}/drive/retry`);
      return res.json();
    },
    onSuccess: () => {
      invalidateDocQueries();
      toast({ title: "Pushed to Google Drive" });
    },
    onError: () => {
      toast({ title: "Failed to push to Drive", variant: "destructive" });
    },
  });

  const statusMutation = useMutation({
    mutationFn: async ({ status, reviewNotes }: { status: string; reviewNotes?: string }) => {
      const res = await apiRequest("PATCH", `/api/admin/deals/${dealId}/documents/${doc.id}`, {
        status,
        ...(reviewNotes !== undefined ? { reviewNotes } : {}),
      });
      return res.json();
    },
    onSuccess: (_data: any, variables: { status: string }) => {
      invalidateDocQueries();
      const statusLabel = DOC_STATUS_OPTIONS.find(s => s.value === variables.status)?.label || variables.status;
      toast({ title: `Status set to ${statusLabel}` });
    },
    onError: () => {
      toast({ title: "Failed to update status", variant: "destructive" });
    },
  });

  const [deletingFileId, setDeletingFileId] = useState<number | null>(null);
  const deleteFileMutation = useMutation({
    mutationFn: async (fileId: number) => {
      setDeletingFileId(fileId);
      const res = await apiRequest("DELETE", `/api/admin/document-files/${fileId}`);
      return res.json();
    },
    onSuccess: () => {
      setDeletingFileId(null);
      invalidateDocQueries();
      toast({ title: "File removed" });
    },
    onError: () => {
      setDeletingFileId(null);
      toast({ title: "Failed to remove file", variant: "destructive" });
    },
  });

  const isApproved = doc.status === "approved" || doc.status === "accepted";

  const isSynced = doc.driveUploadStatus === "ok" || doc.driveUploadStatus === "synced" || !!doc.googleDriveFileId;
  const canPushToDrive = hasFile && !isSynced;

  const handlePerDocUpload = async (files: FileList) => {
    for (const file of Array.from(files)) {
      setUploading(true);
      try {
        const urlRes = await apiRequest("POST", `/api/admin/deals/${dealId}/documents/${doc.id}/upload-url`, {
          name: file.name,
          size: file.size,
          contentType: file.type,
        });
        const urlData = await urlRes.json();

        let objectPath: string;
        if (urlData.useDirectUpload) {
          const fd = new FormData();
          fd.append("file", file);
          const dr = await fetch(urlData.uploadURL, { method: "POST", body: fd, credentials: "include" });
          if (!dr.ok) throw new Error("Upload failed");
          objectPath = (await dr.json()).objectPath;
        } else {
          await fetch(urlData.uploadURL, {
            method: "PUT",
            body: file,
            headers: { "Content-Type": file.type || "application/octet-stream" },
          });
          objectPath = urlData.objectPath;
        }

        await apiRequest("POST", `/api/admin/deals/${dealId}/documents/${doc.id}/upload-complete`, {
          objectPath,
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type,
        });

        toast({ title: `Uploaded: ${file.name}` });
      } catch {
        toast({ title: `Failed to upload ${file.name}`, variant: "destructive" });
      } finally {
        setUploading(false);
      }
    }
    invalidateDocQueries();
  };

  const files: any[] = doc.files || [];
  const fileCount = doc.fileCount || files.length || (doc.filePath || doc.fileName ? 1 : 0);

  const openFilePreview = (file: any) => {
    const fileDownloadUrl = `/api/admin/document-files/${file.id}/download`;
    const name = file.fileName || "Document";
    let mime = file.mimeType || "";
    if (!mime) {
      const ext = name.split(".").pop()?.toLowerCase();
      if (ext === "pdf") mime = "application/pdf";
      else if (["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp"].includes(ext || "")) mime = `image/${ext === "jpg" ? "jpeg" : ext}`;
    }
    onPreview({ url: fileDownloadUrl, fileName: name, mimeType: mime });
  };

  return (
    <>
      <tr
        className={cn(
          "border-b border-border/20 last:border-0 hover:bg-muted/30 cursor-pointer transition-colors",
          expanded && "bg-muted/20"
        )}
        data-testid={`doc-row-${doc.id}`}
        onClick={() => setExpanded(!expanded)}
      >
        <td className="px-4 py-2.5">
          <div className="flex items-center gap-2 min-w-0">
            {expanded ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0 transition-transform" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 transition-transform" />
            )}
            <FolderOpen className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="truncate font-medium">
              {doc.documentName || doc.fileName || "Untitled"}
            </span>
            {doc.isRequired && (
              <Badge variant="destructive" className="text-[11px] px-1.5 py-0 shrink-0">
                REQ
              </Badge>
            )}
          </div>
        </td>
        <td className="px-4 py-2.5">
          <div className="flex items-center gap-1.5">
            <span className={cn("w-2 h-2 rounded-full shrink-0", dot)} />
            <span className="text-[14px] font-medium">{label}</span>
          </div>
        </td>
        <td className="px-4 py-2.5 text-muted-foreground text-[14px]">
          {fileCount === 0 ? "0 files" : fileCount === 1 ? "1 file" : `${fileCount} files`}
        </td>
        <td className="px-4 py-2.5">
          <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              data-testid={`input-upload-doc-${doc.id}`}
              onChange={(e) => e.target.files && handlePerDocUpload(e.target.files)}
            />
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className="h-7 w-7 rounded-full bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center transition-colors disabled:opacity-50"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  data-testid={`button-upload-doc-${doc.id}`}
                >
                  {uploading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Upload className="h-3.5 w-3.5" />
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent>Upload File</TooltipContent>
            </Tooltip>

            {canReview && currentMode === "manual" && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    className="h-7 w-7 rounded-full bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center transition-colors disabled:opacity-50"
                    onClick={() => reviewMutation.mutate()}
                    disabled={reviewMutation.isPending}
                    data-testid={`button-review-doc-${doc.id}`}
                  >
                    {reviewMutation.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Bot className="h-3.5 w-3.5" />
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent>AI Review</TooltipContent>
              </Tooltip>
            )}

            {canPushToDrive && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    className="h-7 w-7 rounded-full bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center transition-colors disabled:opacity-50"
                    onClick={() => driveSyncMutation.mutate()}
                    disabled={driveSyncMutation.isPending}
                    data-testid={`button-push-drive-${doc.id}`}
                  >
                    {driveSyncMutation.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <HardDriveUpload className="h-3.5 w-3.5" />
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent>Push to Drive</TooltipContent>
              </Tooltip>
            )}

            {isSynced && doc.googleDriveFileUrl && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <a
                    href={doc.googleDriveFileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="h-7 w-7 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center transition-colors"
                    data-testid={`button-drive-link-${doc.id}`}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </TooltipTrigger>
                <TooltipContent>Open in Drive</TooltipContent>
              </Tooltip>
            )}

            {(doc.filePath || doc.fileName) && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => {
                      const name = doc.fileName || doc.documentName || "Document";
                      let mime = doc.mimeType || "";
                      if (!mime) {
                        const ext = name.split(".").pop()?.toLowerCase();
                        if (ext === "pdf") mime = "application/pdf";
                        else if (["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp"].includes(ext || "")) mime = `image/${ext === "jpg" ? "jpeg" : ext}`;
                      }
                      onPreview({ url: downloadUrl, fileName: name, mimeType: mime });
                    }}
                    className="h-7 w-7 rounded-full bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center transition-colors"
                    data-testid={`button-view-doc-${doc.id}`}
                  >
                    <Eye className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Preview</TooltipContent>
              </Tooltip>
            )}
          </div>
        </td>
      </tr>

      {expanded && (
        <tr data-testid={`doc-detail-${doc.id}`}>
          <td colSpan={4} className="px-0 py-0">
            <div className="bg-muted/10 border-t border-border/20 px-6 py-4 space-y-4">
              <div className="flex items-start gap-6">
                <div className="flex-1 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Files ({fileCount})
                    </h4>
                    <input
                      ref={expandFileInputRef}
                      type="file"
                      multiple
                      className="hidden"
                      data-testid={`input-expand-upload-doc-${doc.id}`}
                      onChange={(e) => e.target.files && handlePerDocUpload(e.target.files)}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-[12px] gap-1"
                      onClick={() => expandFileInputRef.current?.click()}
                      disabled={uploading}
                      data-testid={`button-expand-upload-${doc.id}`}
                    >
                      {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                      Add File
                    </Button>
                  </div>

                  {files.length > 0 ? (
                    <div className="space-y-1.5">
                      {files.map((file: any, idx: number) => (
                        <div
                          key={file.id || idx}
                          className="flex items-center justify-between gap-3 px-3 py-2 rounded-md bg-card border border-border/30 hover:border-border/60 transition-colors"
                          data-testid={`doc-file-${doc.id}-${file.id || idx}`}
                        >
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <FileText className="h-4 w-4 text-blue-400 shrink-0" />
                            <span className="text-[13px] font-medium truncate">
                              {file.fileName || `File ${idx + 1}`}
                            </span>
                            {file.uploadedAt && (
                              <span className="text-[11px] text-muted-foreground shrink-0">
                                {formatDateTime(file.uploadedAt)}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  onClick={() => openFilePreview(file)}
                                  className="h-6 w-6 rounded bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 flex items-center justify-center transition-colors"
                                  data-testid={`button-preview-file-${file.id || idx}`}
                                >
                                  <Eye className="h-3 w-3" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent>Preview</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <a
                                  href={`/api/admin/document-files/${file.id}/download?download=true`}
                                  className="h-6 w-6 rounded bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 flex items-center justify-center transition-colors"
                                  data-testid={`button-download-file-${file.id || idx}`}
                                >
                                  <Download className="h-3 w-3" />
                                </a>
                              </TooltipTrigger>
                              <TooltipContent>Download</TooltipContent>
                            </Tooltip>
                            {file.id && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    onClick={() => deleteFileMutation.mutate(file.id)}
                                    disabled={deletingFileId === file.id}
                                    className="h-6 w-6 rounded bg-red-600/10 hover:bg-red-600/20 text-red-400 flex items-center justify-center transition-colors disabled:opacity-50"
                                    data-testid={`button-remove-file-${file.id}`}
                                  >
                                    {deletingFileId === file.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent>Remove</TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : hasFile ? (
                    <div className="flex items-center gap-3 px-3 py-2 rounded-md bg-card border border-border/30">
                      <FileText className="h-4 w-4 text-blue-400 shrink-0" />
                      <span className="text-[13px] font-medium truncate">
                        {doc.fileName || doc.documentName || "Uploaded file"}
                      </span>
                      <div className="flex items-center gap-1.5 ml-auto shrink-0">
                        <button
                          onClick={() => {
                            const name = doc.fileName || doc.documentName || "Document";
                            let mime = doc.mimeType || "";
                            if (!mime) {
                              const ext = name.split(".").pop()?.toLowerCase();
                              if (ext === "pdf") mime = "application/pdf";
                              else if (["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp"].includes(ext || "")) mime = `image/${ext === "jpg" ? "jpeg" : ext}`;
                            }
                            onPreview({ url: downloadUrl, fileName: name, mimeType: mime });
                          }}
                          className="h-6 w-6 rounded bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 flex items-center justify-center transition-colors"
                          data-testid={`button-preview-legacy-${doc.id}`}
                        >
                          <Eye className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-[13px] text-muted-foreground italic px-1">No files uploaded yet</p>
                  )}
                </div>

                <div className="w-px bg-border/40 self-stretch" />

                <div className="w-[220px] shrink-0 space-y-4">
                  <div className="space-y-2">
                    <h4 className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">Status</h4>
                    <div className="space-y-1">
                      {DOC_STATUS_OPTIONS.map((opt) => {
                        const isSelected = doc.status === opt.value ||
                          (opt.value === "approved" && doc.status === "accepted") ||
                          (opt.value === "pending" && !["approved", "accepted", "update_needed", "rejected"].includes(doc.status));
                        return (
                          <button
                            key={opt.value}
                            onClick={() => {
                              if (opt.value === "update_needed") {
                                setUpdateNote("");
                                setShowNotePrompt(true);
                              } else {
                                statusMutation.mutate({ status: opt.value });
                              }
                            }}
                            disabled={statusMutation.isPending}
                            className={cn(
                              "w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-[13px] font-medium transition-colors text-left",
                              isSelected
                                ? "bg-card border border-border ring-1 ring-blue-500/40"
                                : "hover:bg-muted/50"
                            )}
                            data-testid={`button-status-${opt.value}-${doc.id}`}
                          >
                            <span className={cn("w-2 h-2 rounded-full shrink-0", opt.dot)} />
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                    {showNotePrompt && (
                      <div className="space-y-2 pt-2 border-t border-border/30">
                        <Label className="text-[12px] text-muted-foreground">Why is an update needed?</Label>
                        <Textarea
                          value={updateNote}
                          onChange={(e) => setUpdateNote(e.target.value)}
                          placeholder="Describe what needs to be updated..."
                          className="text-[13px] min-h-[60px] resize-none"
                          data-testid={`input-update-note-${doc.id}`}
                        />
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            className="h-7 text-[12px]"
                            disabled={!updateNote.trim() || statusMutation.isPending}
                            onClick={() => {
                              statusMutation.mutate({ status: "update_needed", reviewNotes: updateNote.trim() });
                              setShowNotePrompt(false);
                              setUpdateNote("");
                            }}
                            data-testid={`button-submit-update-note-${doc.id}`}
                          >
                            {statusMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                            Submit
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-[12px]"
                            onClick={() => { setShowNotePrompt(false); setUpdateNote(""); }}
                            data-testid={`button-cancel-update-note-${doc.id}`}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>

                  {doc.reviewedAt && (
                    <div className="space-y-1.5">
                      <h4 className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">Review</h4>
                      <div className="flex items-start gap-2 text-[12px] text-muted-foreground">
                        <User className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                        <div>
                          <p className="font-medium text-foreground">{doc.reviewerName || "Admin"}</p>
                          <p>{formatDateTime(doc.reviewedAt)}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {doc.reviewNotes && (
                    <div className="space-y-1">
                      <h4 className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">Notes</h4>
                      <p className="text-[12px] text-muted-foreground">{doc.reviewNotes}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
