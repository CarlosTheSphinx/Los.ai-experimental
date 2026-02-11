import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  FileSignature,
  Clock,
  Eye,
  CheckCircle,
  XCircle,
  Send,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  FolderPlus,
  Loader2,
} from "lucide-react";

interface Envelope {
  id: number;
  vendor: string;
  quoteId: number;
  externalDocumentId: string;
  documentName: string;
  status: string;
  signingUrl: string | null;
  viewedAt: string | null;
  sentAt: string | null;
  completedAt: string | null;
  createdAt: string;
  events: Array<{
    id: number;
    eventType: string;
    createdAt: string;
  }>;
}

interface EnvelopesResponse {
  envelopes: Envelope[];
}

const getStatusVariant = (status: string): "default" | "secondary" | "destructive" | "outline" => {
  switch (status.toLowerCase()) {
    case "draft":
      return "secondary";
    case "sent":
      return "default";
    case "viewed":
      return "secondary";
    case "completed":
      return "outline";
    case "declined":
      return "destructive";
    case "voided":
      return "secondary";
    default:
      return "default";
  }
};

const getStatusIcon = (status: string) => {
  const iconClass = "w-4 h-4";
  switch (status.toLowerCase()) {
    case "draft":
      return <FileSignature className={iconClass} />;
    case "sent":
      return <Send className={iconClass} />;
    case "viewed":
      return <Eye className={iconClass} />;
    case "completed":
      return <CheckCircle className={iconClass} />;
    case "declined":
      return <XCircle className={iconClass} />;
    case "voided":
      return <FileSignature className={iconClass} />;
    default:
      return <Clock className={iconClass} />;
  }
};

const formatDate = (dateString: string | null) => {
  if (!dateString) return null;
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const getStatusColor = (status: string) => {
  switch (status.toLowerCase()) {
    case "completed":
      return "text-green-600 dark:text-green-400";
    case "declined":
      return "text-red-600 dark:text-red-400";
    default:
      return "text-muted-foreground";
  }
};

export function TermSheetStatus({ quoteId, isAdmin = false }: { quoteId: number; isAdmin?: boolean }) {
  const [expandedEnvelopes, setExpandedEnvelopes] = useState<number[]>([]);
  const { toast } = useToast();

  const { data, isLoading } = useQuery<EnvelopesResponse>({
    queryKey: ["/api/esign/pandadoc/quote", quoteId, "envelopes"],
  });

  const createProjectMutation = useMutation({
    mutationFn: async (envelopeId: number) => {
      const res = await apiRequest("POST", `/api/admin/envelopes/${envelopeId}/create-project`);
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Project Created",
        description: `Loan project ${data.project?.projectNumber || ''} has been created successfully.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/esign/pandadoc/quote", quoteId, "envelopes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/deals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create project from signed document",
        variant: "destructive",
      });
    },
  });

  const envelopes = data?.envelopes || [];

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSignature className="w-5 h-5" />
            Signing Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground">Loading envelope status...</div>
        </CardContent>
      </Card>
    );
  }

  if (!envelopes || envelopes.length === 0) {
    return null;
  }

  const toggleExpanded = (envelopeId: number) => {
    setExpandedEnvelopes((prev) =>
      prev.includes(envelopeId) ? prev.filter((id) => id !== envelopeId) : [...prev, envelopeId]
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileSignature className="w-5 h-5" />
          Signing Status
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {envelopes.map((envelope) => {
          const isExpanded = expandedEnvelopes.includes(envelope.id);

          return (
            <div key={envelope.id} className="border rounded-lg p-4 space-y-3 border-border">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{envelope.documentName}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Created {formatDate(envelope.createdAt)}
                  </div>
                </div>
                <Badge variant={getStatusVariant(envelope.status)} className="flex items-center gap-1.5 whitespace-nowrap">
                  {getStatusIcon(envelope.status)}
                  <span>{envelope.status}</span>
                </Badge>
              </div>

              <div className="space-y-2 text-xs">
                {envelope.sentAt && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Send className="w-4 h-4 flex-shrink-0" />
                    <span>Sent {formatDate(envelope.sentAt)}</span>
                  </div>
                )}
                {envelope.viewedAt && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Eye className="w-4 h-4 flex-shrink-0" />
                    <span>Viewed {formatDate(envelope.viewedAt)}</span>
                  </div>
                )}
                {envelope.completedAt && (
                  <div className={`flex items-center gap-2 ${getStatusColor(envelope.status)}`}>
                    <CheckCircle className="w-4 h-4 flex-shrink-0" />
                    <span>Completed {formatDate(envelope.completedAt)}</span>
                  </div>
                )}
              </div>

              {envelope.events && envelope.events.length > 0 && (
                <div className="pt-2 border-t border-border">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleExpanded(envelope.id)}
                    className="w-full justify-between h-auto p-2"
                    data-testid={`button-toggle-events-${envelope.id}`}
                  >
                    <span className="text-xs font-medium">Events ({envelope.events.length})</span>
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                  </Button>

                  {isExpanded && (
                    <div className="mt-2 space-y-1 pl-2 border-l-2 border-muted">
                      {envelope.events.map((event) => (
                        <div key={event.id} className="text-xs text-muted-foreground py-1">
                          <div className="font-medium text-foreground">{event.eventType}</div>
                          <div>{formatDate(event.createdAt)}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {envelope.signingUrl && envelope.status.toLowerCase() !== "completed" && (
                <div className="pt-2">
                  <Button
                    size="sm"
                    variant="default"
                    onClick={() => window.open(envelope.signingUrl || "", "_blank")}
                    className="w-full gap-2"
                    data-testid={`button-open-signing-${envelope.id}`}
                  >
                    <ExternalLink className="w-4 h-4" />
                    Open Signing Link
                  </Button>
                </div>
              )}

              {isAdmin && envelope.status.toLowerCase() === "completed" && (
                <div className="pt-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => createProjectMutation.mutate(envelope.id)}
                    disabled={createProjectMutation.isPending}
                    className="w-full gap-2"
                    data-testid={`button-create-project-${envelope.id}`}
                  >
                    {createProjectMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <FolderPlus className="w-4 h-4" />
                    )}
                    Create Loan Project
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
