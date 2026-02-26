import { useState, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Upload, FileText, CheckCircle2, Clock, AlertCircle, Eye,
  Loader2, Zap, Hand, FolderOpen, ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/ui/phase1/empty-state";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

function statusDisplay(status: string) {
  const s = status?.toLowerCase();
  switch (s) {
    case "approved":
    case "accepted":
      return { dot: "bg-emerald-500", label: "Approved" };
    case "ai_reviewed":
      return { dot: "bg-blue-500", label: "AI Reviewed" };
    case "pending":
    case "in_review":
      return { dot: "bg-amber-500", label: "Pending" };
    case "rejected":
      return { dot: "bg-red-500", label: "Rejected" };
    case "uploaded":
      return { dot: "bg-blue-400", label: "Uploaded" };
    case "waived":
      return { dot: "bg-gray-400", label: "Waived" };
    default:
      return { dot: "bg-gray-300", label: status || "Pending" };
  }
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

  const apiBase = `/api/admin/deals`;
  const numericDealId = parseInt(dealId);

  const reviewModeQuery = useQuery<{
    dealReviewMode: string;
    dealIntervalMinutes: number | null;
    scheduledTime: string | null;
    scheduledDays: string[] | null;
    timezone: string | null;
    communicationFrequencyMinutes: number | null;
  }>({
    queryKey: ["/api/projects", numericDealId, "review-mode"],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${numericDealId}/review-mode`, { credentials: "include" });
      if (!res.ok) return { dealReviewMode: "manual", dealIntervalMinutes: null, scheduledTime: null, scheduledDays: null, timezone: null, communicationFrequencyMinutes: null };
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

  const aiReviewedCount = documents.filter((d) => d.status === "ai_reviewed").length;

  const approveAllMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `${apiBase}/${dealId}/documents/approve-all`);
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: [`/api/deals/${dealId}/documents`] });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/deals/${dealId}/documents`] });
      toast({ title: `Approved ${data.approved || 0} documents` });
    },
    onError: () => {
      toast({ title: "Failed to approve documents", variant: "destructive" });
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
              <span className="text-[12px] text-muted-foreground ml-2">
                {REVIEW_MODE_DESCRIPTIONS[currentMode] || REVIEW_MODE_DESCRIPTIONS.manual}
              </span>
            </div>
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

          {currentMode === "automatic" && (
            <div className="border-t pt-3 flex items-center gap-4 flex-wrap" data-testid="panel-automatic-settings">
              <div className="flex items-center gap-2">
                <Label className="text-[12px] text-muted-foreground whitespace-nowrap">Update message frequency</Label>
                <Select
                  value={String(reviewData?.communicationFrequencyMinutes ?? "30")}
                  onValueChange={(val) =>
                    updateReviewMode.mutate({
                      aiReviewMode: "automatic",
                      communicationFrequencyMinutes: parseInt(val),
                    })
                  }
                >
                  <SelectTrigger className="w-[140px] h-8 text-[12px]" data-testid="select-comm-frequency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="5">Every 5 min</SelectItem>
                    <SelectItem value="15">Every 15 min</SelectItem>
                    <SelectItem value="30">Every 30 min</SelectItem>
                    <SelectItem value="60">Every 1 hour</SelectItem>
                    <SelectItem value="120">Every 2 hours</SelectItem>
                    <SelectItem value="360">Every 6 hours</SelectItem>
                    <SelectItem value="720">Every 12 hours</SelectItem>
                    <SelectItem value="1440">Every 24 hours</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {currentMode === "timed" && (
            <div className="border-t pt-3 flex items-center gap-4 flex-wrap" data-testid="panel-timed-settings">
              <div className="flex items-center gap-2">
                <Label className="text-[12px] text-muted-foreground whitespace-nowrap">Review frequency</Label>
                <Select
                  value={String(reviewData?.dealIntervalMinutes ?? "60")}
                  onValueChange={(val) =>
                    updateReviewMode.mutate({
                      aiReviewMode: "timed",
                      intervalMinutes: parseInt(val),
                      scheduledTime: reviewData?.scheduledTime || null,
                      scheduledDays: reviewData?.scheduledDays || null,
                    })
                  }
                >
                  <SelectTrigger className="w-[140px] h-8 text-[12px]" data-testid="select-review-frequency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="15">Every 15 min</SelectItem>
                    <SelectItem value="30">Every 30 min</SelectItem>
                    <SelectItem value="60">Every 1 hour</SelectItem>
                    <SelectItem value="120">Every 2 hours</SelectItem>
                    <SelectItem value="360">Every 6 hours</SelectItem>
                    <SelectItem value="720">Every 12 hours</SelectItem>
                    <SelectItem value="1440">Daily</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-[12px] text-muted-foreground whitespace-nowrap">Scheduled time</Label>
                <Input
                  type="time"
                  className="w-[120px] h-8 text-[12px]"
                  value={reviewData?.scheduledTime || ""}
                  onChange={(e) =>
                    updateReviewMode.mutate({
                      aiReviewMode: "timed",
                      intervalMinutes: reviewData?.dealIntervalMinutes || 60,
                      scheduledTime: e.target.value || null,
                      scheduledDays: reviewData?.scheduledDays || null,
                    })
                  }
                  data-testid="input-scheduled-time"
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="py-3 px-4">
          <div className="flex items-center justify-between">
            <div className="text-[13px]">
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
                <div key={f} className="flex items-center gap-2 text-[12px] text-muted-foreground">
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
          />
        ));
      })()}
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
}: {
  stageOrder: number;
  stageName: string;
  completedCount: number;
  totalCount: number;
  allComplete: boolean;
  documents: any[];
  dealId: string;
  defaultOpen?: boolean;
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
            <div className="h-5 w-5 rounded-full border-2 border-muted-foreground/40 flex items-center justify-center text-[10px] font-bold text-muted-foreground">
              {stageOrder}
            </div>
          )}
          <span className="text-[13px] font-semibold">
            Stage {stageOrder}: {stageName}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[12px] text-muted-foreground">
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
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-border/30 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2">Document</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Files</th>
                <th className="px-4 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((doc) => {
                const { dot, label } = statusDisplay(doc.status);
                const downloadUrl = `/api/admin/deals/${dealId}/documents/${doc.id}/download`;

                return (
                  <tr
                    key={doc.id}
                    className="border-b border-border/20 last:border-0 hover:bg-muted/30"
                    data-testid={`doc-row-${doc.id}`}
                  >
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <FolderOpen className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="truncate font-medium">
                          {doc.documentName || doc.fileName || "Untitled"}
                        </span>
                        {doc.isRequired && (
                          <Badge variant="destructive" className="text-[9px] px-1.5 py-0 shrink-0">
                            REQ
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <span className={cn("w-2 h-2 rounded-full shrink-0", dot)} />
                        <span className="text-[12px]">{label}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground text-[12px]">
                      {fileCountLabel(doc)}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {(doc.filePath || doc.fileName || doc.googleDriveFileUrl) && (
                        <a
                          href={doc.googleDriveFileUrl || downloadUrl}
                          target={doc.googleDriveFileUrl ? "_blank" : undefined}
                          rel="noreferrer"
                        >
                          <Button variant="ghost" size="sm" data-testid={`button-view-doc-${doc.id}`}>
                            <Eye className="h-3.5 w-3.5 mr-1" /> View
                          </Button>
                        </a>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
