import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  FileText, Search, FolderOpen, Download, Eye, CheckCircle2,
  Clock, AlertCircle, Building2, Filter,
} from "lucide-react";

interface BrokerDocument {
  id: number;
  dealId: number;
  dealName: string;
  loanNumber: string | null;
  propertyAddress: string | null;
  dealStatus: string | null;
  documentName: string;
  documentCategory: string | null;
  status: string;
  isRequired: boolean;
  fileName: string | null;
  fileSize: number | null;
  hasFile: boolean;
  uploadedAt: string | null;
}

const CATEGORIES = [
  { value: "all", label: "All Categories" },
  { value: "borrower_docs", label: "Borrower Documents" },
  { value: "entity_docs", label: "Entity Documents" },
  { value: "property_docs", label: "Property Documents" },
  { value: "financial_docs", label: "Financial Documents" },
  { value: "closing_docs", label: "Closing Documents" },
];

function formatFileSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function getStatusIcon(status: string) {
  switch (status) {
    case "approved": return <CheckCircle2 className="h-4 w-4 text-green-600" />;
    case "uploaded": case "submitted": case "ai_reviewed": return <Clock className="h-4 w-4 text-amber-500" />;
    case "rejected": return <AlertCircle className="h-4 w-4 text-red-600" />;
    case "waived": case "not_applicable": return <CheckCircle2 className="h-4 w-4 text-gray-400" />;
    default: return <FileText className="h-4 w-4 text-gray-400" />;
  }
}

function getStatusLabel(status: string): string {
  switch (status) {
    case "approved": return "Approved";
    case "uploaded": case "submitted": case "ai_reviewed": return "Under Review";
    case "rejected": return "Needs Revision";
    case "waived": case "not_applicable": return "Not Required";
    default: return "Pending";
  }
}

function getStatusBadgeVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "approved": return "default";
    case "uploaded": case "submitted": case "ai_reviewed": return "secondary";
    case "rejected": return "destructive";
    default: return "outline";
  }
}

function getCategoryLabel(category: string | null): string {
  if (!category) return "Other";
  const found = CATEGORIES.find(c => c.value === category);
  return found ? found.label : category.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());
}

export default function BrokerDocumentsPage() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");

  const { data, isLoading } = useQuery<{ documents: BrokerDocument[] }>({
    queryKey: ["/api/broker/documents", category, search],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (category !== "all") params.set("category", category);
      if (search.trim()) params.set("search", search.trim());
      const res = await fetch(`/api/broker/documents?${params.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch documents");
      return res.json();
    },
  });

  const documents = data?.documents || [];

  const groupedByDeal = documents.reduce<Record<number, { dealName: string; loanNumber: string | null; propertyAddress: string | null; docs: BrokerDocument[] }>>((acc, doc) => {
    if (!acc[doc.dealId]) {
      acc[doc.dealId] = {
        dealName: doc.dealName,
        loanNumber: doc.loanNumber,
        propertyAddress: doc.propertyAddress,
        docs: [],
      };
    }
    acc[doc.dealId].docs.push(doc);
    return acc;
  }, {});

  const dealGroups = Object.entries(groupedByDeal).sort(([, a], [, b]) => a.dealName.localeCompare(b.dealName));

  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6 max-w-5xl mx-auto" data-testid="broker-documents-page">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold" data-testid="page-title">Documents</h1>
        <p className="text-sm text-muted-foreground mt-1">All documents across your deals</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3" data-testid="filters">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search documents..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            data-testid="input-search"
          />
        </div>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-full sm:w-[200px]" data-testid="select-category">
            <Filter className="h-4 w-4 mr-2 text-muted-foreground" />
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            {CATEGORIES.map(c => (
              <SelectItem key={c.value} value={c.value} data-testid={`category-${c.value}`}>{c.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ))}
        </div>
      ) : documents.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FolderOpen className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              {search || category !== "all" ? "No documents match your filters." : "No documents found across your deals."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {dealGroups.map(([dealId, group]) => (
            <div key={dealId} data-testid={`deal-group-${dealId}`}>
              <div className="flex items-center gap-2 mb-2">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold" data-testid={`deal-name-${dealId}`}>
                  {group.loanNumber || group.dealName}
                </h3>
                {group.propertyAddress && (
                  <span className="text-xs text-muted-foreground truncate hidden sm:inline">
                    — {group.propertyAddress}
                  </span>
                )}
                <Badge variant="outline" className="text-[10px] ml-auto">{group.docs.length} docs</Badge>
              </div>

              <div className="space-y-2">
                {group.docs.map(doc => (
                  <Card key={doc.id} className="overflow-hidden" data-testid={`doc-row-${doc.id}`}>
                    <CardContent className="p-3 sm:p-4">
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          {getStatusIcon(doc.status)}
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate" data-testid={`doc-name-${doc.id}`}>{doc.documentName}</p>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
                              {doc.documentCategory && (
                                <span className="text-[11px] text-muted-foreground">{getCategoryLabel(doc.documentCategory)}</span>
                              )}
                              {doc.fileName && (
                                <span className="text-[11px] text-muted-foreground truncate max-w-[150px]">{doc.fileName}</span>
                              )}
                              {doc.fileSize && (
                                <span className="text-[11px] text-muted-foreground">{formatFileSize(doc.fileSize)}</span>
                              )}
                              {doc.uploadedAt && (
                                <span className="text-[11px] text-muted-foreground">{formatDate(doc.uploadedAt)}</span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 self-end sm:self-auto flex-shrink-0">
                          <Badge
                            variant={getStatusBadgeVariant(doc.status)}
                            className={`text-[11px] ${doc.status === 'approved' ? 'bg-green-600' : ''}`}
                            data-testid={`status-${doc.id}`}
                          >
                            {getStatusLabel(doc.status)}
                          </Badge>
                          {doc.hasFile && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2"
                              onClick={(e) => {
                                e.stopPropagation();
                                window.open(`/api/projects/${doc.dealId}/deal-documents/${doc.id}/download`, '_blank', 'noopener,noreferrer');
                              }}
                              data-testid={`button-view-${doc.id}`}
                            >
                              <Eye className="h-3.5 w-3.5 mr-1" />
                              <span className="text-xs">View</span>
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="text-xs text-muted-foreground text-center pt-2" data-testid="doc-count">
        {documents.length} document{documents.length !== 1 ? "s" : ""} across {dealGroups.length} deal{dealGroups.length !== 1 ? "s" : ""}
      </div>
    </div>
  );
}
