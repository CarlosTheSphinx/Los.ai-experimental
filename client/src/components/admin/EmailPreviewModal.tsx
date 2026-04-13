import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Mail,
  Send,
  Calendar,
  Edit3,
  Check,
  X,
  Loader2,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface EmailPreviewModalProps {
  open: boolean;
  onClose: () => void;
  communications: any[];
  projectId: number;
}

export function EmailPreviewModal({
  open,
  onClose,
  communications,
  projectId,
}: EmailPreviewModalProps) {
  const { toast } = useToast();
  const [activeIndex, setActiveIndex] = useState(0);
  const [editing, setEditing] = useState(false);
  const [editSubject, setEditSubject] = useState("");
  const [editBody, setEditBody] = useState("");

  const comm = communications[activeIndex];

  useEffect(() => {
    if (comm) {
      setEditSubject(comm.subject || "");
      setEditBody(comm.editedBody || comm.body || "");
      setEditing(false);
    }
  }, [activeIndex, comm?.id]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("PATCH", `/api/projects/${projectId}/agent-communications/${comm.id}`, {
        subject: editSubject,
        body: editBody,
      });
    },
    onSuccess: () => {
      toast({ title: "Saved", description: "Email draft updated" });
      setEditing(false);
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/agent-communications`] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error?.message || "Failed to save", variant: "destructive" });
    },
  });

  const approveMutation = useMutation({
    mutationFn: async () => {
      if (editing) {
        await apiRequest("PATCH", `/api/projects/${projectId}/agent-communications/${comm.id}`, {
          subject: editSubject,
          body: editBody,
        });
      }
      return apiRequest("PUT", `/api/projects/${projectId}/agent-communications/${comm.id}/approve`);
    },
    onSuccess: () => {
      toast({ title: "Email Approved", description: "The email has been approved and scheduled for delivery." });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/agent-communications`] });
      if (activeIndex < communications.length - 1) {
        setActiveIndex(activeIndex + 1);
      } else {
        onClose();
      }
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error?.message || "Failed to approve", variant: "destructive" });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("PUT", `/api/projects/${projectId}/agent-communications/${comm.id}/reject`, {
        reason: "Discarded by lender",
      });
    },
    onSuccess: () => {
      toast({ title: "Discarded", description: "Email draft discarded" });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/agent-communications`] });
      if (activeIndex < communications.length - 1) {
        setActiveIndex(activeIndex + 1);
      } else {
        onClose();
      }
    },
  });

  if (!comm) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] p-0 gap-0" data-testid="email-preview-modal">
        <DialogHeader className="px-6 pt-6 pb-4 border-b bg-blue-50/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100">
                <Mail className="h-5 w-5 text-blue-700" />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold">Email Preview</DialogTitle>
                {communications.length > 1 && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Email {activeIndex + 1} of {communications.length}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {communications.length > 1 && communications.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setActiveIndex(i)}
                  className={cn(
                    "w-2 h-2 rounded-full transition-colors",
                    i === activeIndex ? "bg-blue-600" : "bg-slate-300"
                  )}
                />
              ))}
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="flex-1 max-h-[calc(85vh-200px)]">
          <div className="px-6 py-4 space-y-4">
            <div className="flex items-center gap-2 text-sm">
              <User className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">To:</span>
              <Badge variant="outline" className="text-xs capitalize">
                {comm.recipientType || "borrower"}
              </Badge>
              {comm.recipientName && (
                <span className="font-medium">{comm.recipientName}</span>
              )}
              {comm.recipientEmail && (
                <span className="text-muted-foreground">&lt;{comm.recipientEmail}&gt;</span>
              )}
            </div>

            {editing ? (
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Subject</label>
                  <Input
                    value={editSubject}
                    onChange={(e) => setEditSubject(e.target.value)}
                    className="text-sm"
                    data-testid="input-edit-subject"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Body</label>
                  <Textarea
                    value={editBody}
                    onChange={(e) => setEditBody(e.target.value)}
                    className="text-sm min-h-[300px] font-sans leading-relaxed"
                    data-testid="input-edit-body"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="p-3 rounded-lg border bg-white">
                  <p className="text-xs text-muted-foreground mb-1">Subject</p>
                  <p className="text-sm font-medium" data-testid="text-email-subject">{comm.subject || "Untitled"}</p>
                </div>
                <div className="p-4 rounded-lg border bg-white">
                  <p className="text-sm whitespace-pre-line leading-relaxed" data-testid="text-email-body">
                    {comm.editedBody || comm.body || ""}
                  </p>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="border-t bg-slate-50/50 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {editing ? (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setEditSubject(comm.subject || "");
                      setEditBody(comm.editedBody || comm.body || "");
                      setEditing(false);
                    }}
                    data-testid="button-cancel-edit"
                  >
                    <X className="h-3.5 w-3.5 mr-1" /> Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => saveMutation.mutate()}
                    disabled={saveMutation.isPending}
                    data-testid="button-save-edit"
                  >
                    {saveMutation.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                    ) : (
                      <Check className="h-3.5 w-3.5 mr-1" />
                    )}
                    Save Changes
                  </Button>
                </>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setEditing(true)}
                  data-testid="button-edit-email"
                >
                  <Edit3 className="h-3.5 w-3.5 mr-1" /> Edit
                </Button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                onClick={() => rejectMutation.mutate()}
                disabled={rejectMutation.isPending}
                data-testid="button-discard-email"
              >
                <X className="h-3.5 w-3.5 mr-1" /> Discard
              </Button>
              <Button
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={() => approveMutation.mutate()}
                disabled={approveMutation.isPending}
                data-testid="button-approve-send"
              >
                {approveMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                ) : (
                  <Send className="h-3.5 w-3.5 mr-1" />
                )}
                Approve & Schedule
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
