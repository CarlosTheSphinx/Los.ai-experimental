import { useRef, useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AddressAutocomplete } from "@/components/AddressAutocomplete";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  DollarSign,
  Building,
  Building2,
  User,
  Users,
  Calendar,
  CalendarDays,
  FileText,
  CheckSquare,
  Mail,
  Pencil,
  Check,
  Clock,
  Upload,
  AlertCircle,
  XCircle,
  FileCheck,
  Folder,
  Eye,
  Download,
  Loader2,
  Phone,
  Plus,
  Circle,
  CheckCircle2,
  Copy,
  MoreHorizontal,
  Send,
  ExternalLink,
  Activity,
  MapPin,
  Trash2,
  UserPlus,
  ChevronDown,
  ChevronRight,
  ListChecks,
  Paperclip,
  BarChart3,
  RefreshCw,
  CloudUpload,
  LinkIcon,
  Zap,
  FileSearch,
  Hand,
  FolderOpen,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { DigestConfigPanel } from "@/components/DigestConfigPanel";
import { LinkedEmailsSection } from "@/components/admin/LinkedEmailsSection";
import { AIInsightsPanel } from "@/components/admin/AIInsightsPanel";
import { DealMemoryPanel } from "@/components/admin/DealMemoryPanel";

function getPreviewType(fileName: string | null, mimeType?: string | null): 'image' | 'pdf' | 'unsupported' {
  const mime = (mimeType || '').toLowerCase();
  const name = (fileName || '').toLowerCase();
  if (mime.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(name)) return 'image';
  if (mime === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
  return 'unsupported';
}

function getFileExtensionLabel(fileName: string | null): string {
  if (!fileName) return 'Document';
  const ext = fileName.split('.').pop()?.toUpperCase();
  const labels: Record<string, string> = {
    DOC: 'Word Document', DOCX: 'Word Document',
    XLS: 'Excel Spreadsheet', XLSX: 'Excel Spreadsheet',
    PPT: 'PowerPoint', PPTX: 'PowerPoint',
    CSV: 'CSV File', TXT: 'Text File',
    ZIP: 'ZIP Archive', RAR: 'RAR Archive',
  };
  return labels[ext || ''] || `${ext} File`;
}

interface Deal {
  id: number;
  userId: number | null;
  customerFirstName: string;
  customerLastName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  propertyAddress: string;
  loanData: {
    loanAmount: number;
    propertyValue: number;
    ltv?: string;
    loanType: string;
    loanPurpose: string;
    propertyType: string;
    loanTerm?: string;
  };
  applicationData?: Record<string, any> | null;
  interestRate: string;
  pointsCharged: number;
  pointsAmount: number;
  tpoPremiumAmount: number;
  totalRevenue: number;
  commission: number;
  stage: string;
  projectStatus: string;
  createdAt: string;
  targetCloseDate?: string;
  userName: string | null;
  userEmail: string | null;
  programId?: number | null;
  programName?: string | null;
  borrowerPortalToken?: string | null;
  borrowerPortalEnabled?: boolean;
  brokerPortalToken?: string | null;
  brokerPortalEnabled?: boolean;
}

interface DealDocument {
  id: number;
  dealId: number;
  stageId: number | null;
  documentName: string;
  documentCategory: string | null;
  documentDescription: string | null;
  status: string;
  isRequired: boolean | null;
  filePath: string | null;
  fileName: string | null;
  fileSize: number | null;
  mimeType: string | null;
  uploadedAt: string | null;
  uploadedBy: number | null;
  reviewedAt: string | null;
  reviewedBy: number | null;
  reviewNotes: string | null;
  sortOrder: number | null;
  googleDriveFileId: string | null;
  googleDriveFileUrl: string | null;
  driveUploadStatus: string | null;
  driveUploadError: string | null;
  createdAt: string;
}

interface DealTask {
  id: number;
  dealId: number;
  taskName: string;
  taskDescription: string | null;
  status: string;
  priority: string | null;
  assignedTo: number | null;
  assigneeName: string | null;
  assigneeEmail: string | null;
  dueDate: string | null;
  completedAt: string | null;
  createdAt: string;
}

interface TeamMember {
  id: number;
  fullName: string | null;
  email: string;
  role: string;
}

interface DealProperty {
  id: number;
  dealId: number;
  address: string;
  city: string | null;
  state: string | null;
  zip: string | null;
  propertyType: string | null;
  estimatedValue: number | null;
  units: number | null;
  monthlyRent: number | null;
  annualTaxes: number | null;
  annualInsurance: number | null;
  isPrimary: boolean;
  sortOrder: number;
  createdAt: string;
}

interface DealDetailResponse {
  deal: Deal;
  documents: DealDocument[];
  properties: DealProperty[];
}

interface ProjectTask {
  id: number;
  stageId: number | null;
  taskTitle: string;
  taskType: string;
  priority: string;
  status: string;
  assignedTo: string | null;
  completedAt: string | null;
  completedBy: string | null;
  visibleToBorrower: boolean;
  borrowerActionRequired: boolean;
}

interface ProjectStage {
  id: number;
  stageName: string;
  stageKey: string;
  stageOrder: number;
  stageDescription: string;
  status: string;
  startedAt: string | null;
  completedAt: string | null;
  tasks: ProjectTask[];
}

interface ProjectActivityItem {
  id: number;
  activityType: string;
  activityDescription: string;
  createdAt: string;
  visibleToBorrower: boolean;
}

interface ProjectDetailResponse {
  project: {
    id: number;
    projectNumber: string;
    projectName: string;
    status: string;
    currentStage: string;
    progressPercentage: number;
    borrowerName: string;
    borrowerEmail: string;
    borrowerPhone: string | null;
    loanAmount: number | null;
    interestRate: number | null;
    loanTermMonths: number | null;
    loanType: string | null;
    propertyAddress: string | null;
    propertyType: string | null;
    borrowerPortalToken: string | null;
    borrowerPortalEnabled: boolean;
    brokerPortalToken: string | null;
    brokerPortalEnabled: boolean;
    googleDriveFolderId: string | null;
    googleDriveFolderUrl: string | null;
  };
  stages: ProjectStage[];
  tasks: ProjectTask[];
  activity: ProjectActivityItem[];
  documents?: DealDocument[];
}

interface DealStage {
  id: number;
  key: string;
  label: string;
  color: string;
  icon?: string;
  sortOrder: number;
  isActive: boolean;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16),
  } : null;
}

function getStageStyle(stage: string, stages: DealStage[]): { backgroundColor: string; color: string } {
  const stageObj = stages.find(s => s.key === stage);
  const hex = stageObj?.color || '#6b7280';
  const rgb = hexToRgb(hex);
  if (rgb) {
    return {
      backgroundColor: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.15)`,
      color: hex,
    };
  }
  return { backgroundColor: 'rgba(107, 114, 128, 0.15)', color: '#6b7280' };
}

function getStageLabelFromStages(stage: string, stages: DealStage[]): string {
  const stageObj = stages.find(s => s.key === stage);
  return stageObj?.label || stage;
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

function getLoanTypeLabel(loanType: string): string {
  const labels: Record<string, string> = {
    "rtl": "RTL",
    "dscr": "DSCR",
    "fix-and-flip": "Fix & Flip",
    "bridge": "Bridge",
    "ground-up": "Ground Up",
    "rental": "Rental",
  };
  return labels[loanType?.toLowerCase()] || loanType || "N/A";
}

function parseAddress(address: string) {
  const parts = address.split(",").map((p) => p.trim());
  const street = parts[0] || "";
  const city = parts[1] || "";
  const stateZip = parts[2] || "";
  const [state, zip] = stateZip.split(" ").filter(Boolean);
  return { street, city, state: state || "", zip: zip || "" };
}

function getDocumentStatusIcon(status: string) {
  switch (status) {
    case "approved":
      return <Check className="h-4 w-4 text-success" />;
    case "ai_reviewed":
      return <FileCheck className="h-4 w-4 text-info" />;
    case "uploaded":
      return <FileCheck className="h-4 w-4 text-info" />;
    case "rejected":
      return <XCircle className="h-4 w-4 text-destructive" />;
    case "not_applicable":
      return <AlertCircle className="h-4 w-4 text-muted-foreground" />;
    default:
      return <Clock className="h-4 w-4 text-warning" />;
  }
}

function getDocumentStatusBadge(status: string) {
  const styles: Record<string, string> = {
    pending: "bg-warning/10 text-warning",
    uploaded: "bg-info/10 text-info",
    ai_reviewed: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
    approved: "bg-success/10 text-success",
    rejected: "bg-destructive/10 text-destructive",
    not_applicable: "bg-muted text-muted-foreground",
  };
  const labels: Record<string, string> = {
    pending: "Pending",
    uploaded: "Uploaded",
    ai_reviewed: "AI Reviewed",
    approved: "Approved",
    rejected: "Rejected",
    not_applicable: "N/A",
  };
  return (
    <Badge className={cn("text-xs", styles[status] || "bg-muted text-muted-foreground")}>
      {labels[status] || status}
    </Badge>
  );
}

function getCategoryLabel(category: string | null): string {
  const labels: Record<string, string> = {
    borrower_docs: "Borrower Documents",
    entity_docs: "Entity Documents",
    property_docs: "Property Documents",
    financial_docs: "Financial Documents",
    closing_docs: "Closing Documents",
    lender_ordered: "Ordered by Lender",
  };
  return labels[category || ""] || "Other";
}

function getCategoryIcon(category: string | null) {
  switch (category) {
    case "borrower_docs":
      return <User className="h-4 w-4" />;
    case "entity_docs":
      return <Building className="h-4 w-4" />;
    case "property_docs":
      return <Building className="h-4 w-4" />;
    case "financial_docs":
      return <DollarSign className="h-4 w-4" />;
    case "closing_docs":
      return <FileText className="h-4 w-4" />;
    case "lender_ordered":
      return <FileCheck className="h-4 w-4" />;
    default:
      return <Folder className="h-4 w-4" />;
  }
}

function DealReviewModeControl({ dealId }: { dealId: number }) {
  const { toast } = useToast();
  const reviewModeQuery = useQuery<{
    dealReviewMode: string;
    dealIntervalMinutes: number | null;
    scheduledTime: string | null;
    scheduledDays: string[] | null;
    timezone: string | null;
    communicationFrequencyMinutes: number | null;
  }>({
    queryKey: ['/api/deals', dealId, 'review-mode'],
    queryFn: async () => {
      const res = await fetch(`/api/deals/${dealId}/review-mode`);
      if (!res.ok) throw new Error('Failed to fetch review mode');
      return res.json();
    },
  });

  const updateReviewMode = useMutation({
    mutationFn: async (payload: { aiReviewMode: string; intervalMinutes?: number | null; scheduledTime?: string | null; scheduledDays?: string[] | null; timezone?: string | null; communicationFrequencyMinutes?: number | null }) => {
      const res = await apiRequest('PUT', `/api/deals/${dealId}/review-mode`, payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/deals', dealId, 'review-mode'] });
      toast({ title: "Review mode updated" });
    },
    onError: () => {
      toast({ title: "Failed to update review mode", variant: "destructive" });
    },
  });

  const currentMode = reviewModeQuery.data?.dealReviewMode ?? 'manual';
  const currentInterval = reviewModeQuery.data?.dealIntervalMinutes ?? null;
  const currentScheduledTime = reviewModeQuery.data?.scheduledTime ?? '09:00';
  const currentScheduledDays = reviewModeQuery.data?.scheduledDays ?? [];
  const currentTimezone = reviewModeQuery.data?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const currentCommFreq = reviewModeQuery.data?.communicationFrequencyMinutes ?? null;

  const modes = [
    { value: "automatic", label: "Automatic", icon: <Zap className="h-4 w-4" />, desc: "Immediate review on upload" },
    { value: "timed", label: "Timed / Batch", icon: <Clock className="h-4 w-4" />, desc: "Scheduled review at set times" },
    { value: "manual", label: "Manual", icon: <Hand className="h-4 w-4" />, desc: "Only when you trigger it" },
  ];

  const sweepFrequencyOptions = [
    { value: 1440, label: "Every day" },
    { value: 2880, label: "Every 2 days" },
    { value: 4320, label: "Every 3 days" },
    { value: 10080, label: "Every week" },
  ];

  const commFrequencyOptions = [
    { value: 0, label: "After every review" },
    { value: 1440, label: "Once a day" },
    { value: 2880, label: "Every 2 days" },
    { value: 4320, label: "Every 3 days" },
    { value: 10080, label: "Once a week" },
  ];

  const dayOptions = [
    { value: "mon", label: "Mon" },
    { value: "tue", label: "Tue" },
    { value: "wed", label: "Wed" },
    { value: "thu", label: "Thu" },
    { value: "fri", label: "Fri" },
    { value: "sat", label: "Sat" },
    { value: "sun", label: "Sun" },
  ];

  const timeOptions: string[] = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 30) {
      const hStr = h.toString().padStart(2, '0');
      const mStr = m.toString().padStart(2, '0');
      timeOptions.push(`${hStr}:${mStr}`);
    }
  }

  const formatTime12 = (t: string) => {
    const [hh, mm] = t.split(':').map(Number);
    const ampm = hh >= 12 ? 'PM' : 'AM';
    const h12 = hh % 12 || 12;
    return `${h12}:${mm.toString().padStart(2, '0')} ${ampm}`;
  };

  const toggleDay = (day: string) => {
    const days = [...currentScheduledDays];
    const idx = days.indexOf(day);
    if (idx >= 0) {
      days.splice(idx, 1);
    } else {
      days.push(day);
    }
    updateReviewMode.mutate({
      aiReviewMode: 'timed',
      scheduledTime: currentScheduledTime,
      scheduledDays: days,
      timezone: currentTimezone,
    });
  };

  return (
    <div className="mt-4 pt-4 border-t" data-testid="deal-review-mode-control">
      <div className="flex items-center gap-2 mb-3">
        <FileSearch className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">AI Document Review Mode</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {modes.map((mode) => {
          const isSelected = currentMode === mode.value;
          return (
            <button
              key={mode.value}
              onClick={() => {
                if (mode.value === 'timed') {
                  updateReviewMode.mutate({
                    aiReviewMode: 'timed',
                    scheduledTime: currentScheduledTime,
                    scheduledDays: currentScheduledDays.length > 0 ? currentScheduledDays : ['mon', 'tue', 'wed', 'thu', 'fri'],
                    timezone: currentTimezone,
                  });
                } else {
                  updateReviewMode.mutate({ aiReviewMode: mode.value, intervalMinutes: mode.value === 'automatic' ? (currentInterval || 1440) : null });
                }
              }}
              disabled={updateReviewMode.isPending}
              className={`flex flex-col items-center gap-1 p-3 rounded-lg border text-xs transition-colors ${
                isSelected
                  ? 'border-primary bg-primary/5 text-primary'
                  : 'border-border hover:border-muted-foreground/30 text-muted-foreground'
              }`}
              data-testid={`button-review-mode-${mode.value}`}
            >
              {mode.icon}
              <span className="font-medium">{mode.label}</span>
              <span className="text-[10px] text-center opacity-70">{mode.desc}</span>
            </button>
          );
        })}
      </div>

      {currentMode === "automatic" && (
        <div className="mt-3 p-3 bg-muted/30 rounded-lg border" data-testid="review-frequency-config">
          <div className="flex items-center gap-2 mb-1">
            <Zap className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs font-medium">Immediate Review on Upload</span>
          </div>
          <p className="text-[11px] text-muted-foreground mb-3">
            Documents are reviewed by AI as soon as they're uploaded. Choose how often the AI also runs a sweep to catch anything missed:
          </p>
          <span className="text-[11px] font-medium text-muted-foreground mb-1.5 block">Catch-up Sweep Frequency</span>
          <div className="flex flex-wrap gap-1.5">
            {sweepFrequencyOptions.map((opt) => {
              const isActive = currentInterval === opt.value;
              return (
                <button
                  key={opt.value}
                  onClick={() => updateReviewMode.mutate({ aiReviewMode: 'automatic', intervalMinutes: opt.value, communicationFrequencyMinutes: currentCommFreq })}
                  disabled={updateReviewMode.isPending}
                  className={`px-2.5 py-1.5 rounded-md border text-xs font-medium transition-colors ${
                    isActive
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border hover:border-muted-foreground/30 text-muted-foreground hover:text-foreground'
                  }`}
                  data-testid={`button-sweep-frequency-${opt.value}`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          <div className="mt-4 pt-3 border-t border-border/50">
            <div className="flex items-center gap-2 mb-1">
              <Send className="h-3.5 w-3.5 text-primary" />
              <span className="text-xs font-medium">AI Communication Frequency</span>
            </div>
            <p className="text-[11px] text-muted-foreground mb-2">
              How often should the AI generate and send messages to borrowers/brokers about review results?
            </p>
            <div className="flex flex-wrap gap-1.5">
              {commFrequencyOptions.map((opt) => {
                const isActive = currentCommFreq === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => updateReviewMode.mutate({ aiReviewMode: 'automatic', intervalMinutes: currentInterval, communicationFrequencyMinutes: opt.value })}
                    disabled={updateReviewMode.isPending}
                    className={`px-2.5 py-1.5 rounded-md border text-xs font-medium transition-colors ${
                      isActive
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border hover:border-muted-foreground/30 text-muted-foreground hover:text-foreground'
                    }`}
                    data-testid={`button-comm-frequency-${opt.value}`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
            {currentCommFreq == null && (
              <p className="text-[10px] text-amber-600 mt-2">
                Select a frequency to control how often AI sends messages
              </p>
            )}
          </div>
        </div>
      )}

      {currentMode === "timed" && (
        <div className="mt-3 p-3 bg-muted/30 rounded-lg border" data-testid="review-schedule-config">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs font-medium">Batch Review Schedule</span>
          </div>
          <p className="text-[11px] text-muted-foreground mb-3">
            The AI will review all pending documents at the scheduled time on selected days.
          </p>

          <div className="mb-3">
            <span className="text-[11px] font-medium text-muted-foreground mb-1.5 block">Review Time</span>
            <select
              value={currentScheduledTime}
              onChange={(e) => updateReviewMode.mutate({
                aiReviewMode: 'timed',
                scheduledTime: e.target.value,
                scheduledDays: currentScheduledDays,
                timezone: currentTimezone,
              })}
              disabled={updateReviewMode.isPending}
              className="w-40 px-2.5 py-1.5 rounded-md border text-xs bg-background"
              data-testid="select-review-time"
            >
              {timeOptions.map((t) => (
                <option key={t} value={t}>{formatTime12(t)}</option>
              ))}
            </select>
          </div>

          <div className="mb-3">
            <span className="text-[11px] font-medium text-muted-foreground mb-1.5 block">Review Days</span>
            <div className="flex flex-wrap gap-1.5">
              {dayOptions.map((day) => {
                const isActive = currentScheduledDays.includes(day.value);
                return (
                  <button
                    key={day.value}
                    onClick={() => toggleDay(day.value)}
                    disabled={updateReviewMode.isPending}
                    className={`w-10 py-1.5 rounded-md border text-xs font-medium transition-colors ${
                      isActive
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border hover:border-muted-foreground/30 text-muted-foreground hover:text-foreground'
                    }`}
                    data-testid={`button-day-${day.value}`}
                  >
                    {day.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <span className="text-[11px] font-medium text-muted-foreground mb-1.5 block">Timezone</span>
            <span className="text-xs text-foreground">{currentTimezone}</span>
          </div>

          {currentScheduledDays.length === 0 && (
            <p className="text-[10px] text-amber-600 mt-2">
              Select at least one day to activate scheduled reviews
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default function AdminDealDetail() {
  const [, params] = useRoute("/admin/deals/:id");
  const dealId = params?.id;
  const { toast } = useToast();
  const [uploadingDocId, setUploadingDocId] = useState<number | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    customerFirstName: "",
    customerLastName: "",
    customerEmail: "",
    customerPhone: "",
    propertyAddress: "",
    loanAmount: "",
    propertyValue: "",
    interestRate: "",
    loanType: "",
    loanPurpose: "",
    propertyType: "",
    loanTerm: "",
  });
  const [appEditDialogOpen, setAppEditDialogOpen] = useState(false);
  const [appEditForm, setAppEditForm] = useState<Record<string, string>>({});
  
  // Task dialog state
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [taskForm, setTaskForm] = useState({
    taskName: "",
    taskDescription: "",
    priority: "medium",
    assignedTo: "",
    dueDate: "",
  });
  
  // Document dialog state
  const [documentDialogOpen, setDocumentDialogOpen] = useState(false);
  const [documentForm, setDocumentForm] = useState({
    documentName: "",
    documentCategory: "other",
    documentDescription: "",
    isRequired: true,
  });

  const [propertyDialogOpen, setPropertyDialogOpen] = useState(false);
  const [editingProperty, setEditingProperty] = useState<DealProperty | null>(null);
  const [propertyForm, setPropertyForm] = useState({
    address: "",
    city: "",
    state: "",
    zip: "",
    propertyType: "",
    estimatedValue: "",
    units: "",
    monthlyRent: "",
    annualTaxes: "",
    annualInsurance: "",
    isPrimary: false,
  });

  const { data, isLoading, error } = useQuery<DealDetailResponse>({
    queryKey: [`/api/admin/deals/${dealId}`],
    enabled: !!dealId,
  });
  
  const { data: tasksData } = useQuery<{ tasks: DealTask[] }>({
    queryKey: [`/api/admin/deals/${dealId}/tasks`],
    enabled: !!dealId,
  });
  
  const { data: teamData } = useQuery<{ teamMembers: TeamMember[] }>({
    queryKey: ['/api/admin/team-members'],
    staleTime: 5 * 60 * 1000, // Team members rarely change — cache 5 min
  });

  // Deal ID is now the project ID directly (deals are projects)
  const linkedProjectId = dealId ? parseInt(dealId) : null;
  const [showAddProcessor, setShowAddProcessor] = useState(false);
  const [selectedProcessorId, setSelectedProcessorId] = useState<string>("");
  const [showEditBorrower, setShowEditBorrower] = useState(false);
  const [borrowerForm, setBorrowerForm] = useState({ firstName: "", lastName: "", email: "", phone: "" });
  const [showEditBroker, setShowEditBroker] = useState(false);
  const [selectedBrokerId, setSelectedBrokerId] = useState<string>("");
  const [showAddThirdParty, setShowAddThirdParty] = useState(false);
  const [thirdPartyForm, setThirdPartyForm] = useState({ name: "", email: "", phone: "", role: "", company: "", customRole: "" });
  const [editingThirdPartyId, setEditingThirdPartyId] = useState<number | null>(null);

  const { data: projectDetailData, isLoading: projectLoading } = useQuery<ProjectDetailResponse>({
    queryKey: ['/api/admin/projects', linkedProjectId],
    enabled: !!linkedProjectId,
  });

  const { data: stagesData } = useQuery<{ stages: DealStage[] }>({
    queryKey: [`/api/admin/deals/${dealId}/program-stages`],
    enabled: !!dealId,
  });

  const { data: dealProcessorsData } = useQuery<any[]>({
    queryKey: ['/api/admin/projects', linkedProjectId, 'processors'],
    enabled: !!linkedProjectId,
  });

  const { data: availableProcessors } = useQuery<any[]>({
    queryKey: ['/api/admin/processors'],
    staleTime: 5 * 60 * 1000, // Processor list rarely changes — cache 5 min
  });

  const addProcessorMutation = useMutation({
    mutationFn: async (userId: number) => {
      return apiRequest("POST", `/api/admin/projects/${linkedProjectId}/processors`, { userId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/projects', linkedProjectId, 'processors'] });
      setShowAddProcessor(false);
      setSelectedProcessorId("");
      toast({ title: "Processor added to deal" });
    },
    onError: () => {
      toast({ title: "Failed to add processor", variant: "destructive" });
    },
  });

  const removeProcessorMutation = useMutation({
    mutationFn: async (processorId: number) => {
      return apiRequest("DELETE", `/api/admin/projects/${linkedProjectId}/processors/${processorId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/projects', linkedProjectId, 'processors'] });
      toast({ title: "Processor removed from deal" });
    },
    onError: () => {
      toast({ title: "Failed to remove processor", variant: "destructive" });
    },
  });

  const updatePeopleMutation = useMutation({
    mutationFn: async (payload: { borrowerName?: string; borrowerEmail?: string; borrowerPhone?: string; brokerId?: number | null }) => {
      return apiRequest("PATCH", `/api/admin/deals/${dealId}/people`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/deals/${dealId}`] });
      setShowEditBorrower(false);
      setShowEditBroker(false);
      toast({ title: "People updated" });
    },
    onError: () => {
      toast({ title: "Failed to update", variant: "destructive" });
    },
  });
  
  const { data: thirdPartiesData } = useQuery<{ contacts: any[] }>({
    queryKey: ['/api/admin/deals', dealId, 'third-parties'],
    enabled: !!dealId,
  });

  const addThirdPartyMutation = useMutation({
    mutationFn: async (data: { name: string; email: string; phone: string; role: string; company: string }) => {
      return apiRequest("POST", `/api/admin/deals/${dealId}/third-parties`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/deals', dealId, 'third-parties'] });
      setShowAddThirdParty(false);
      setThirdPartyForm({ name: "", email: "", phone: "", role: "", company: "", customRole: "" });
      setEditingThirdPartyId(null);
      toast({ title: "Third party contact added" });
    },
    onError: () => {
      toast({ title: "Failed to add contact", variant: "destructive" });
    },
  });

  const updateThirdPartyMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      return apiRequest("PATCH", `/api/admin/deals/${dealId}/third-parties/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/deals', dealId, 'third-parties'] });
      setShowAddThirdParty(false);
      setThirdPartyForm({ name: "", email: "", phone: "", role: "", company: "", customRole: "" });
      setEditingThirdPartyId(null);
      toast({ title: "Contact updated" });
    },
    onError: () => {
      toast({ title: "Failed to update contact", variant: "destructive" });
    },
  });

  const deleteThirdPartyMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/admin/deals/${dealId}/third-parties/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/deals', dealId, 'third-parties'] });
      toast({ title: "Contact removed" });
    },
    onError: () => {
      toast({ title: "Failed to remove contact", variant: "destructive" });
    },
  });

  const addPropertyMutation = useMutation({
    mutationFn: async (propertyData: { address: string; city?: string; state?: string; zip?: string; propertyType?: string; estimatedValue?: number | null; isPrimary?: boolean }) => {
      return apiRequest("POST", `/api/admin/deals/${dealId}/properties`, propertyData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/deals/${dealId}`] });
      setPropertyDialogOpen(false);
      setPropertyForm({ address: "", city: "", state: "", zip: "", propertyType: "", estimatedValue: "", units: "", monthlyRent: "", annualTaxes: "", annualInsurance: "", isPrimary: false });
      toast({ title: "Property added" });
    },
    onError: () => {
      toast({ title: "Failed to add property", variant: "destructive" });
    },
  });

  const updatePropertyMutation = useMutation({
    mutationFn: async ({ propertyId, ...propertyData }: { propertyId: number; address: string; city?: string; state?: string; zip?: string; propertyType?: string; estimatedValue?: number | null; isPrimary?: boolean }) => {
      return apiRequest("PATCH", `/api/admin/deals/${dealId}/properties/${propertyId}`, propertyData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/deals/${dealId}`] });
      setPropertyDialogOpen(false);
      setEditingProperty(null);
      setPropertyForm({ address: "", city: "", state: "", zip: "", propertyType: "", estimatedValue: "", units: "", monthlyRent: "", annualTaxes: "", annualInsurance: "", isPrimary: false });
      toast({ title: "Property updated" });
    },
    onError: () => {
      toast({ title: "Failed to update property", variant: "destructive" });
    },
  });

  const deletePropertyMutation = useMutation({
    mutationFn: async (propertyId: number) => {
      return apiRequest("DELETE", `/api/admin/deals/${dealId}/properties/${propertyId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/deals/${dealId}`] });
      toast({ title: "Property deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete property", variant: "destructive" });
    },
  });

  const stages = stagesData?.stages || [];
  const projectStages = projectDetailData?.stages || [];
  const projectActivity = (projectDetailData?.activity || []).filter(
    (a: any) => a.activityType !== 'task_updated' && a.activityType !== 'task_added'
  );
  const project = projectDetailData?.project;

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewFile, setPreviewFile] = useState<{ url: string; fileName: string | null; mimeType?: string | null; downloadUrl: string } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewReady, setPreviewReady] = useState(false);
  const [activeFilter, setActiveFilter] = useState<'all' | 'completed' | 'todo' | 'digests' | 'ai_insights'>('all');
  const [subFilter, setSubFilter] = useState<'all' | 'documents' | 'tasks'>('all');
  const [showMemoryPanel, setShowMemoryPanel] = useState(true);
  const [expandedStages, setExpandedStages] = useState<Set<number>>(new Set());
  const [stageExpandInitialized, setStageExpandInitialized] = useState(false);

  useEffect(() => {
    if (projectStages.length > 0 && !stageExpandInitialized) {
      const activeStage = projectStages.find(s => s.status === 'in_progress');
      if (activeStage) {
        setExpandedStages(new Set([activeStage.id]));
      } else if (projectStages.length > 0) {
        setExpandedStages(new Set([projectStages[0].id]));
      }
      setStageExpandInitialized(true);
    }
  }, [projectStages, stageExpandInitialized]);

  useEffect(() => {
    if (!previewOpen || !previewFile) {
      setPreviewError(null);
      setPreviewLoading(false);
      setPreviewReady(false);
      return;
    }
    const pType = getPreviewType(previewFile.fileName, previewFile.mimeType);
    if (pType === 'unsupported') {
      setPreviewReady(true);
      return;
    }

    let cancelled = false;
    setPreviewLoading(true);
    setPreviewError(null);
    setPreviewReady(false);

    fetch(previewFile.url, { credentials: 'include' })
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          setPreviewError('This file is no longer available. It may have been moved or deleted.');
          setPreviewLoading(false);
        } else {
          res.body?.cancel().catch(() => {});
          setPreviewReady(true);
          setPreviewLoading(false);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setPreviewError('This file is no longer available. It may have been moved or deleted.');
        setPreviewLoading(false);
      });

    return () => { cancelled = true; };
  }, [previewOpen, previewFile]);

  const toggleStageExpanded = (stageId: number) => {
    setExpandedStages(prev => {
      const next = new Set(prev);
      if (next.has(stageId)) {
        next.delete(stageId);
      } else {
        next.add(stageId);
      }
      return next;
    });
  };

  const getStageDocuments = (stage: ProjectStage): DealDocument[] => {
    return documents.filter(d => d.stageId === stage.id);
  };

  const getUnassignedDocuments = (): DealDocument[] => {
    return documents.filter(d => !d.stageId);
  };

  const computeStageProgress = (stage: ProjectStage) => {
    const tasks = stage.tasks || [];
    const completedTasks = tasks.filter(t => t.status === 'completed').length;
    const totalTasks = tasks.length;
    const stageDocs = getStageDocuments(stage);
    const completedDocs = stageDocs.filter(d => d.status === 'approved' || d.status === 'ai_reviewed' || d.status === 'uploaded').length;
    const totalItems = totalTasks + stageDocs.length;
    const completedItems = completedTasks + completedDocs;
    const percent = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;
    return { completedItems, totalItems, percent };
  };

  const computeOverallProgress = () => {
    let totalItems = 0;
    let completedItems = 0;
    projectStages.forEach((stage) => {
      const progress = computeStageProgress(stage);
      totalItems += progress.totalItems;
      completedItems += progress.completedItems;
    });
    const unassigned = getUnassignedDocuments();
    const unassignedCompleted = unassigned.filter(d => d.status === 'approved' || d.status === 'ai_reviewed' || d.status === 'uploaded').length;
    totalItems += unassigned.length;
    completedItems += unassignedCompleted;
    return {
      totalItems,
      completedItems,
      percent: totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0,
    };
  };

  const deriveStageStatus = (stage: ProjectStage): string => {
    const progress = computeStageProgress(stage);
    if (progress.totalItems > 0 && progress.completedItems >= progress.totalItems) {
      return 'completed';
    }
    return stage.status;
  };

  const updateDocumentStatus = useMutation({
    mutationFn: async ({ docId, status, reviewNotes }: { docId: number; status: string; reviewNotes?: string }) => {
      return apiRequest("PATCH", `/api/admin/deals/${dealId}/documents/${docId}`, { status, reviewNotes });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/deals/${dealId}`] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/projects', linkedProjectId] });
      toast({
        title: "Document updated",
        description: "The document status has been updated.",
      });
    },
  });

  const approveAllDocsMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/admin/deals/${dealId}/documents/approve-all`);
    },
    onSuccess: async (response: any) => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/deals/${dealId}`] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/projects', linkedProjectId] });
      const data = await response.json();
      toast({
        title: "Documents approved",
        description: data.message || "All AI-reviewed documents have been approved.",
      });
    },
    onError: () => {
      toast({ title: "Failed to approve documents", variant: "destructive" });
    },
  });

  const updateDealMutation = useMutation({
    mutationFn: async (formData: typeof editForm) => {
      return apiRequest("PUT", `/api/admin/deals/${dealId}`, formData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/deals/${dealId}`] });
      setEditDialogOpen(false);
      toast({
        title: "Deal updated",
        description: "The loan details have been saved.",
      });
    },
    onError: () => {
      toast({
        title: "Update failed",
        variant: "destructive",
      });
    },
  });

  const updateAppDataMutation = useMutation({
    mutationFn: async (appData: Record<string, string>) => {
      return apiRequest("PUT", `/api/admin/deals/${dealId}`, { applicationData: appData });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/deals/${dealId}`] });
      setAppEditDialogOpen(false);
      toast({ title: "Application details updated" });
    },
    onError: () => {
      toast({ title: "Update failed", variant: "destructive" });
    },
  });

  const updateStageMutation = useMutation({
    mutationFn: async (stage: string) => {
      return apiRequest("PATCH", `/api/admin/deals/${dealId}`, { stage });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/deals/${dealId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/deals/${dealId}/tasks`] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/deals'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/projects', linkedProjectId] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/pipeline'] });
      toast({
        title: "Stage updated",
        description: "The deal stage has been updated.",
      });
    },
    onError: () => {
      toast({
        title: "Failed to update stage",
        variant: "destructive",
      });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async (status: string) => {
      return apiRequest("PATCH", `/api/admin/deals/${dealId}/status`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/deals/${dealId}`] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/deals'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/pipeline'] });
      toast({
        title: "Status updated",
        description: "The deal status has been updated.",
      });
    },
    onError: () => {
      toast({
        title: "Failed to update status",
        variant: "destructive",
      });
    },
  });


  const openEditDialog = () => {
    if (deal) {
      setEditForm({
        customerFirstName: deal.customerFirstName || "",
        customerLastName: deal.customerLastName || "",
        customerEmail: deal.customerEmail || "",
        customerPhone: deal.customerPhone || "",
        propertyAddress: deal.propertyAddress || "",
        loanAmount: deal.loanData?.loanAmount?.toString() || "",
        propertyValue: deal.loanData?.propertyValue?.toString() || "",
        interestRate: deal.interestRate || "",
        loanType: deal.loanData?.loanType || "",
        loanPurpose: deal.loanData?.loanPurpose || "",
        propertyType: deal.loanData?.propertyType || "",
        loanTerm: deal.loanData?.loanTerm?.toString() || "",
      });
      setEditDialogOpen(true);
    }
  };

  const createTaskMutation = useMutation({
    mutationFn: async (formData: typeof taskForm) => {
      return apiRequest("POST", `/api/admin/deals/${dealId}/tasks`, formData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/deals/${dealId}/tasks`] });
      setTaskDialogOpen(false);
      setTaskForm({ taskName: "", taskDescription: "", priority: "medium", assignedTo: "", dueDate: "" });
      toast({ title: "Task created" });
    },
    onError: () => {
      toast({ title: "Failed to create task", variant: "destructive" });
    },
  });

  const updateTaskMutation = useMutation({
    mutationFn: async ({ taskId, status }: { taskId: number; status: string }) => {
      return apiRequest("PATCH", `/api/admin/deals/${dealId}/tasks/${taskId}`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/deals/${dealId}/tasks`] });
      toast({ title: "Task updated" });
    },
  });

  const updateProjectTaskMutation = useMutation({
    mutationFn: async ({ projectId, taskId, status, assignedTo }: { projectId: number; taskId: number; status?: string; assignedTo?: string | null }) => {
      const body: Record<string, unknown> = {};
      if (status !== undefined) body.status = status;
      if (assignedTo !== undefined) body.assignedTo = assignedTo;
      return apiRequest('PATCH', `/api/admin/projects/${projectId}/tasks/${taskId}`, body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/projects', linkedProjectId] });
      toast({ title: "Task updated" });
    },
  });

  const [addTaskStageId, setAddTaskStageId] = useState<number | null>(null);
  const [addDocStageId, setAddDocStageId] = useState<number | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDescription, setNewTaskDescription] = useState("");
  const [newTaskPriority, setNewTaskPriority] = useState("medium");
  const [newTaskAssignedTo, setNewTaskAssignedTo] = useState("");
  const [newDocName, setNewDocName] = useState("");
  const [newDocCategory, setNewDocCategory] = useState("other");
  const [newDocRequired, setNewDocRequired] = useState(true);

  const [pipelineRunning, setPipelineRunning] = useState(false);
  const triggerPipeline = useMutation({
    mutationFn: async () => {
      setPipelineRunning(true);
      const res = await apiRequest('POST', '/api/admin/agents/pipeline/start', { projectId: linkedProjectId });
      return res.json();
    },
    onSuccess: () => {
      setPipelineRunning(false);
      toast({ title: "AI Pipeline Started", description: "The AI agents are analyzing this deal. Switching to AI Insights view." });
      setActiveFilter('ai_insights');
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["/api/projects", linkedProjectId, "story"] });
        queryClient.invalidateQueries({ queryKey: ["/api/projects", linkedProjectId, "findings"] });
        queryClient.invalidateQueries({ queryKey: ["/api/projects", linkedProjectId, "agent-communications"] });
      }, 5000);
    },
    onError: (error: any) => {
      setPipelineRunning(false);
      const msg = error?.message?.includes("already running") ? "A pipeline is already running for this deal." : error?.message || "Failed to start pipeline";
      toast({ title: "Pipeline Error", description: msg, variant: "destructive" });
    },
  });

  const createStageTaskMutation = useMutation({
    mutationFn: async ({ stageId }: { stageId: number }) => {
      return apiRequest('POST', `/api/admin/projects/${linkedProjectId}/stages/${stageId}/tasks`, {
        taskTitle: newTaskTitle,
        taskDescription: newTaskDescription || undefined,
        priority: newTaskPriority,
        assignedTo: newTaskAssignedTo && newTaskAssignedTo !== 'unassigned' ? newTaskAssignedTo : undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/projects', linkedProjectId] });
      toast({ title: "Task added" });
      setAddTaskStageId(null);
      setNewTaskTitle("");
      setNewTaskDescription("");
      setNewTaskPriority("medium");
      setNewTaskAssignedTo("");
    },
    onError: (error: any) => {
      toast({ title: "Failed to add task", description: error.message, variant: "destructive" });
    },
  });

  const createStageDocMutation = useMutation({
    mutationFn: async ({ stageId }: { stageId: number }) => {
      return apiRequest('POST', `/api/admin/deals/${dealId}/documents`, {
        documentName: newDocName,
        documentCategory: newDocCategory,
        isRequired: newDocRequired,
        stageId: String(stageId),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/projects', linkedProjectId] });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/deals/${dealId}`] });
      toast({ title: "Document added" });
      setAddDocStageId(null);
      setNewDocName("");
      setNewDocCategory("other");
      setNewDocRequired(true);
    },
    onError: (error: any) => {
      toast({ title: "Failed to add document", description: error.message, variant: "destructive" });
    },
  });

  const [pushingDocId, setPushingDocId] = useState<number | null>(null);

  const [driveSyncing, setDriveSyncing] = useState(false);
  const syncAllDriveMutation = useMutation({
    mutationFn: async () => {
      setDriveSyncing(true);
      return apiRequest('POST', `/api/admin/deals/${dealId}/sync-all-drive`);
    },
    onSuccess: async (response) => {
      const result = await response.json();
      queryClient.invalidateQueries({ queryKey: ['/api/admin/projects', linkedProjectId] });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/deals/${dealId}`] });
      toast({ title: "Drive sync complete", description: `${result.synced} synced, ${result.skipped} already synced${result.errors ? `, ${result.errors} errors` : ''}` });
      setDriveSyncing(false);
    },
    onError: (error: any) => {
      toast({ title: "Drive sync failed", description: error.message || "Could not sync documents to Google Drive", variant: "destructive" });
      setDriveSyncing(false);
    },
  });

  const pushToDriveMutation = useMutation({
    mutationFn: async ({ docId }: { docId: number }) => {
      setPushingDocId(docId);
      return apiRequest('POST', `/api/admin/deals/${dealId}/documents/${docId}/drive/retry`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/projects', linkedProjectId] });
      toast({ title: "Pushed to Google Drive" });
      setPushingDocId(null);
    },
    onError: (error: any) => {
      toast({ title: "Drive push failed", description: error.message || "Could not upload to Google Drive", variant: "destructive" });
      setPushingDocId(null);
    },
  });

  const { data: loanProgramsData } = useQuery<any[]>({
    queryKey: ['/api/admin/programs'],
    staleTime: 5 * 60 * 1000, // Programs list rarely changes — cache 5 min
  });

  const rebuildPipelineMutation = useMutation({
    mutationFn: async (programId?: number) => {
      return apiRequest('POST', `/api/admin/projects/${linkedProjectId}/rebuild-pipeline`, programId ? { programId } : {});
    },
    onSuccess: async (response) => {
      const result = await response.json();
      queryClient.invalidateQueries({ queryKey: ['/api/admin/projects', linkedProjectId] });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/deals/${dealId}`] });
      toast({ 
        title: "Pipeline synced",
        description: `${result.stagesCreated} stages, ${result.tasksCreated} tasks, ${result.documentsCreated} documents created from ${result.programName || 'program'}.`,
      });
      setSyncDialogOpen(false);
    },
    onError: () => {
      toast({ title: "Failed to sync pipeline", variant: "destructive" });
    },
  });

  const convertProgramMutation = useMutation({
    mutationFn: async (programId: number) => {
      return apiRequest('POST', `/api/admin/projects/${linkedProjectId}/convert-program`, { programId });
    },
    onSuccess: async (response) => {
      const result = await response.json();
      queryClient.invalidateQueries({ queryKey: ['/api/admin/projects', linkedProjectId] });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/deals/${dealId}`] });
      toast({
        title: "Loan program changed",
        description: `Converted to ${result.programName}. ${result.documentsPreserved} uploaded documents preserved. ${result.stagesCreated} stages, ${result.tasksCreated} tasks created.`,
      });
      setConvertProgramDialogOpen(false);
      setPendingProgramId(null);
    },
    onError: () => {
      toast({ title: "Failed to change loan program", variant: "destructive" });
    },
  });

  const [syncDialogOpen, setSyncDialogOpen] = useState(false);
  const [selectedProgramId, setSelectedProgramId] = useState<string>("");
  const [convertProgramDialogOpen, setConvertProgramDialogOpen] = useState(false);
  const [pendingProgramId, setPendingProgramId] = useState<string | null>(null);
  const [editTargetCloseDateOpen, setEditTargetCloseDateOpen] = useState(false);
  const [targetCloseDateValue, setTargetCloseDateValue] = useState<string>("");

  // Portal link state
  const [borrowerPortalCopied, setBorrowerPortalCopied] = useState(false);
  const [brokerPortalCopied, setBrokerPortalCopied] = useState(false);

  const updateTargetCloseDateMutation = useMutation({
    mutationFn: async (targetCloseDate: string) => {
      return apiRequest("PATCH", `/api/admin/projects/${linkedProjectId}`, { targetCloseDate });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/deals/${dealId}`] });
      setEditTargetCloseDateOpen(false);
      toast({
        title: "Target close date updated",
      });
    },
    onError: () => {
      toast({
        title: "Failed to update target close date",
        variant: "destructive",
      });
    },
  });

  const copyBorrowerPortalLink = async () => {
    if (!linkedProjectId) {
      toast({ title: "No deal linked", description: "Create a loan deal first to generate a borrower portal link.", variant: "destructive" });
      return;
    }
    try {
      const res = await fetch(`/api/projects/${linkedProjectId}/borrower-link`, { credentials: 'include' });
      const { borrowerLink } = await res.json();
      await navigator.clipboard.writeText(borrowerLink);
      toast({ title: "Borrower portal link copied" });
    } catch (e) {
      toast({ title: "Failed to copy link", variant: "destructive" });
    }
  };

  const formatDateTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('en-US', { 
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' 
    });
  };

  const getStageIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle2 className="h-5 w-5 text-success" />;
      case 'in_progress': return <Clock className="h-5 w-5 text-info" />;
      default: return <Circle className="h-5 w-5 text-muted-foreground" />;
    }
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'critical': return <Badge variant="destructive" className="text-xs">Critical</Badge>;
      case 'high': return <Badge variant="secondary" className="bg-warning/10 text-warning text-xs">High</Badge>;
      case 'medium': return <Badge variant="secondary" className="text-xs">Medium</Badge>;
      default: return null;
    }
  };

  // Portal link mutations
  const generateBorrowerLinkMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/admin/projects/${linkedProjectId}/generate-borrower-link`);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/deals/${dealId}`] });
      toast({ title: "Borrower portal link generated" });
    },
    onError: () => {
      toast({ title: "Failed to generate borrower link", variant: "destructive" });
    },
  });

  const generateBrokerLinkMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/admin/projects/${linkedProjectId}/generate-broker-link`);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/deals/${dealId}`] });
      toast({ title: "Broker portal link generated" });
    },
    onError: () => {
      toast({ title: "Failed to generate broker link", variant: "destructive" });
    },
  });

  const updatePortalSettingsMutation = useMutation({
    mutationFn: async (settings: { borrowerPortalEnabled?: boolean; brokerPortalEnabled?: boolean }) => {
      return apiRequest("PUT", `/api/admin/projects/${linkedProjectId}/portal-settings`, settings);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/deals/${dealId}`] });
      toast({ title: "Portal settings updated" });
    },
    onError: () => {
      toast({ title: "Failed to update portal settings", variant: "destructive" });
    },
  });

  const copyToClipboard = async (text: string, label: string) => {
    await navigator.clipboard.writeText(text);
    toast({ title: `${label} copied to clipboard` });
    if (label.includes("Borrower")) setBorrowerPortalCopied(true);
    if (label.includes("Broker")) setBrokerPortalCopied(true);
    setTimeout(() => {
      setBorrowerPortalCopied(false);
      setBrokerPortalCopied(false);
    }, 2000);
  };

  const createDocumentMutation = useMutation({
    mutationFn: async (formData: typeof documentForm) => {
      return apiRequest("POST", `/api/admin/deals/${dealId}/documents`, formData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/deals/${dealId}`] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/projects', linkedProjectId] });
      setDocumentDialogOpen(false);
      setDocumentForm({ documentName: "", documentCategory: "other", documentDescription: "", isRequired: true });
      toast({ title: "Document requirement added" });
    },
    onError: () => {
      toast({ title: "Failed to add document", variant: "destructive" });
    },
  });

  const handleContactBorrower = async () => {
    if (deal?.customerEmail) {
      const subject = `Regarding Your Loan - ${deal.propertyAddress}`;
      const mailtoLink = `mailto:${deal.customerEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(`Dear ${deal.customerFirstName},\n\n`)}`;
      
      const link = document.createElement('a');
      link.href = mailtoLink;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      try {
        await navigator.clipboard.writeText(deal.customerEmail);
        toast({
          title: "Email address copied",
          description: `${deal.customerEmail} copied to clipboard. If your email app didn't open, paste this address manually.`,
        });
      } catch {
        toast({
          title: "Borrower Email",
          description: `${deal.customerEmail} - Copy this to email the borrower.`,
        });
      }
    } else {
      toast({
        title: "No email available",
        description: "Please add the borrower's email address first.",
        variant: "destructive",
      });
    }
  };

  const handleFileUpload = async (docId: number, file: File) => {
    setUploadingDocId(docId);
    setUploadProgress(10);

    try {
      const urlResponse = await apiRequest("POST", `/api/admin/deals/${dealId}/documents/${docId}/upload-url`, {
        name: file.name,
        size: file.size,
        contentType: file.type || "application/octet-stream",
      });
      const urlData = await urlResponse.json();
      setUploadProgress(30);

      let objectPath: string;

      if (urlData.useDirectUpload) {
        const formData = new FormData();
        formData.append('file', file);
        const directResponse = await fetch(urlData.uploadURL, {
          method: "POST",
          body: formData,
          credentials: 'include',
        });
        if (!directResponse.ok) {
          throw new Error('Direct upload failed');
        }
        const directResult = await directResponse.json();
        objectPath = directResult.objectPath;
      } else {
        await fetch(urlData.uploadURL, {
          method: "PUT",
          body: file,
          headers: {
            "Content-Type": file.type || "application/octet-stream",
          },
        });
        objectPath = urlData.objectPath;
      }
      setUploadProgress(70);

      await apiRequest("POST", `/api/admin/deals/${dealId}/documents/${docId}/upload-complete`, {
        objectPath,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type || "application/octet-stream",
      });
      setUploadProgress(100);

      queryClient.invalidateQueries({ queryKey: [`/api/admin/deals/${dealId}`] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/projects', linkedProjectId] });
      toast({
        title: "Document uploaded",
        description: `${file.name} has been uploaded successfully.`,
      });
    } catch (error) {
      console.error("Upload error:", error);
      toast({
        title: "Upload failed",
        description: "There was an error uploading the document. Please try again.",
        variant: "destructive",
      });
    } finally {
      setUploadingDocId(null);
      setUploadProgress(0);
    }
  };

  const handleFileInputChange = (docId: number) => async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      for (let i = 0; i < files.length; i++) {
        await handleFileUpload(docId, files[i]);
      }
    }
    e.target.value = "";
  };

  const handleViewDocument = (docId: number, fileName: string | null, mimeType?: string | null) => {
    const url = `/api/admin/deals/${dealId}/documents/${docId}/download`;
    const downloadUrl = `/api/admin/deals/${dealId}/documents/${docId}/download?download=true`;
    setPreviewFile({ url, fileName, mimeType, downloadUrl });
    setPreviewOpen(true);
  };

  const handleDownloadDocument = (docId: number, fileName: string | null) => {
    const link = document.createElement("a");
    link.href = `/api/admin/deals/${dealId}/documents/${docId}/download?download=true`;
    link.download = fileName || "document";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleViewFile = (fileId: number, fileName: string | null, mimeType?: string | null) => {
    const url = `/api/admin/document-files/${fileId}/download`;
    const downloadUrl = `/api/admin/document-files/${fileId}/download?download=true`;
    setPreviewFile({ url, fileName, mimeType, downloadUrl });
    setPreviewOpen(true);
  };

  const handleDownloadFile = (fileId: number, fileName: string | null) => {
    const link = document.createElement("a");
    link.href = `/api/admin/document-files/${fileId}/download?download=true`;
    link.download = fileName || "document";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const deleteFileMutation = useMutation({
    mutationFn: async (fileId: number) => {
      const res = await apiRequest('DELETE', `/api/admin/document-files/${fileId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/projects', linkedProjectId] });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/deals/${dealId}`] });
      toast({ title: "File removed" });
    },
    onError: () => {
      toast({ title: "Failed to remove file", variant: "destructive" });
    },
  });

  const deal = data?.deal;
  const documents = projectDetailData?.documents || data?.documents || [];

  // Initialize target close date value when dialog opens
  useEffect(() => {
    if (editTargetCloseDateOpen && deal?.targetCloseDate) {
      const date = new Date(deal.targetCloseDate);
      const isoString = date.toISOString().split('T')[0];
      setTargetCloseDateValue(isoString);
    }
  }, [editTargetCloseDateOpen, deal?.targetCloseDate]);

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-12 w-96" />
        <div className="grid gap-6 md:grid-cols-3">
          <Skeleton className="h-64 md:col-span-2" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  if (error || !deal) {
    return (
      <div className="p-6">
        <Link href="/admin/deals">
          <Button variant="ghost" size="sm" className="mb-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Dashboard
          </Button>
        </Link>
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">Deal not found</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const address = parseAddress(deal.propertyAddress);
  const borrowerName = `${deal.customerFirstName} ${deal.customerLastName}`;
  const borrowerEmail = deal.customerEmail || `${deal.customerFirstName.toLowerCase()}.${deal.customerLastName.toLowerCase()}@email.com`;
  const progressPercentage = project?.progressPercentage || 0;

  return (
    <div className="flex h-full">
      <div className={cn("flex-1 overflow-y-auto p-6 space-y-6 transition-all duration-200", showMemoryPanel ? "max-w-[calc(100%-380px)]" : "max-w-6xl mx-auto")}>
      {/* Header matching Loans page */}
      <div className="flex items-center gap-4">
        <Link href="/admin/deals">
          <Button variant="ghost" size="icon" data-testid="button-back">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-sm text-muted-foreground font-mono">{deal.loanNumber || `DEAL-${deal.id}`}</span>
          </div>
          <h1 className="text-xl font-semibold" data-testid="text-deal-address">
            {deal.propertyAddress || 'No Address'}
          </h1>
          <p className="text-sm text-muted-foreground" data-testid="text-borrower-name">{borrowerName}</p>
        </div>
      </div>

      {/* Enhanced Progress Bar */}
      {projectStages.length > 0 && (() => {
        const overall = computeOverallProgress();
        return (
          <Card data-testid="card-loan-progress">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-base font-semibold">Loan Progress</h3>
                <span className="text-2xl font-bold" data-testid="text-overall-progress">{overall.percent}% Complete</span>
              </div>
              <div className="flex items-start justify-between relative">
                {projectStages.map((stage, i) => {
                  const derivedStatus = deriveStageStatus(stage);
                  const isCompleted = derivedStatus === 'completed';
                  const isActive = derivedStatus === 'in_progress';
                  const progress = computeStageProgress(stage);
                  const programStage = stages.find(s => s.key === stage.stageKey);
                  const stageColor = programStage?.color || (isCompleted ? '#10b981' : isActive ? '#3b82f6' : undefined);
                  const rgb = stageColor ? hexToRgb(stageColor) : null;
                  return (
                    <div key={stage.id} className="flex flex-col items-center relative flex-1" data-testid={`progress-stage-${stage.id}`}>
                      <div
                        className={cn(
                          "h-12 w-12 rounded-full flex items-center justify-center text-sm font-semibold border-[3px] flex-shrink-0 transition-all z-10",
                          !isCompleted && !isActive && "bg-muted border-border text-muted-foreground",
                          isActive && !stageColor && "animate-pulse"
                        )}
                        style={
                          (isCompleted || isActive) && rgb
                            ? {
                                backgroundColor: `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`,
                                borderColor: `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`,
                                color: '#fff',
                              }
                            : undefined
                        }
                        data-testid={`stage-indicator-${stage.id}`}
                      >
                        {isCompleted ? <Check className="h-5 w-5" /> : i + 1}
                      </div>
                      <div className="mt-3 text-center max-w-[120px]">
                        <div
                          className={cn(
                            "text-[13px] font-medium leading-tight",
                            !isCompleted && !isActive && "text-muted-foreground",
                            isActive && "font-semibold"
                          )}
                          style={
                            (isCompleted || isActive) && rgb
                              ? { color: `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})` }
                              : undefined
                          }
                        >
                          {stage.stageName}
                        </div>
                        {progress.totalItems > 0 && (
                          <div className="text-xs text-muted-foreground mt-1">
                            {progress.completedItems}/{progress.totalItems}
                          </div>
                        )}
                      </div>
                      {i < projectStages.length - 1 && (
                        <div
                          className="absolute top-6 left-[calc(50%+24px)] h-[3px] z-0"
                          style={{
                            width: 'calc(100% - 48px)',
                            backgroundColor: isCompleted && rgb
                              ? `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.5)`
                              : 'var(--border)',
                          }}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
              
            </CardContent>
          </Card>
        );
      })()}

      {/* People + Metrics Row */}
      <div className="grid md:grid-cols-3 gap-6">
        <div className="md:col-span-2">
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Loan Details</p>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={openEditDialog} data-testid="button-edit-loan-details-inline">
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-success" />
                <span className="text-xs text-muted-foreground">Loan Amount</span>
                <span className="font-semibold text-sm" data-testid="text-loan-amount">{formatCurrency(deal.loanData?.loanAmount || 0)}</span>
              </div>
              <Separator orientation="vertical" className="h-5 hidden md:block" />
              <div className="flex items-center gap-2">
                <span className="text-info font-semibold text-xs">%</span>
                <span className="text-xs text-muted-foreground">Rate</span>
                <span className="font-semibold text-sm" data-testid="text-interest-rate">{deal.interestRate || '\u2014'}</span>
              </div>
              <Separator orientation="vertical" className="h-5 hidden md:block" />
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-primary" />
                <span className="text-xs text-muted-foreground">Term</span>
                <span className="font-semibold text-sm" data-testid="text-loan-term">{deal.loanData?.loanTerm || '12 months'}</span>
              </div>
              <Separator orientation="vertical" className="h-5 hidden md:block" />
              <div className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Target Close</span>
                <span className="font-semibold text-sm" data-testid="text-target-close-date">
                  {deal.targetCloseDate ? format(new Date(deal.targetCloseDate), 'MMM d, yyyy') : '\u2014'}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setEditTargetCloseDateOpen(true)}
                  data-testid="button-edit-target-close-date"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3 mt-3 pt-3 border-t">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Origination Points</span>
                <span className="font-semibold text-sm" data-testid="text-origination-points">{deal.pointsCharged ?? 0}</span>
              </div>
              <Separator orientation="vertical" className="h-5 hidden md:block" />
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Broker Points</span>
                <span className="font-semibold text-sm" data-testid="text-broker-points">{deal.commission ?? 0}</span>
              </div>
              <Separator orientation="vertical" className="h-5 hidden md:block" />
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">YSP</span>
                <span className="font-semibold text-sm" data-testid="text-ysp">{deal.tpoPremiumAmount ?? 0}</span>
              </div>
              <Separator orientation="vertical" className="h-5 hidden md:block" />
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Total Points</span>
                <span className="font-semibold text-sm" data-testid="text-total-points">{formatCurrency(deal.pointsAmount || 0)}</span>
              </div>
            </div>
          </Card>
          <Card className="mt-4">
            <CardHeader className="pb-3 flex flex-row items-center justify-between gap-2 flex-wrap">
              <CardTitle className="text-base flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                Property Details
              </CardTitle>
              <Button
                size="sm"
                onClick={() => {
                  setEditingProperty(null);
                  setPropertyForm({ address: "", city: "", state: "", zip: "", propertyType: "", estimatedValue: "", units: "", monthlyRent: "", annualTaxes: "", annualInsurance: "", isPrimary: false });
                  setPropertyDialogOpen(true);
                }}
                data-testid="button-add-property"
              >
                <Plus className="h-4 w-4 mr-1" />
                Add Property
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {(data?.properties || []).length > 0 ? (
                (data?.properties || []).map((property) => (
                  <div key={property.id} className="flex items-start justify-between gap-2 p-3 rounded-md border" data-testid={`property-row-${property.id}`}>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        {property.isPrimary && (
                          <Badge className="text-xs" data-testid={`badge-primary-${property.id}`}>Primary</Badge>
                        )}
                        <span className="font-medium text-sm" data-testid={`text-property-address-${property.id}`}>
                          {[property.address, property.city, property.state, property.zip].filter(Boolean).join(", ")}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        {property.propertyType && (
                          <Badge variant="outline" className="text-xs" data-testid={`badge-property-type-${property.id}`}>{property.propertyType}</Badge>
                        )}
                        {property.estimatedValue != null && (
                          <span className="text-xs text-muted-foreground" data-testid={`text-property-value-${property.id}`}>{formatCurrency(property.estimatedValue)}</span>
                        )}
                        {property.units != null && (
                          <span className="text-xs text-muted-foreground">{property.units} units</span>
                        )}
                      </div>
                      {(property.monthlyRent != null || property.annualTaxes != null || property.annualInsurance != null) && (
                        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                          {property.monthlyRent != null && <span>Rent: {formatCurrency(property.monthlyRent)}/mo</span>}
                          {property.annualTaxes != null && <span>Taxes: {formatCurrency(property.annualTaxes)}/yr</span>}
                          {property.annualInsurance != null && <span>Ins: {formatCurrency(property.annualInsurance)}/yr</span>}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          setEditingProperty(property);
                          setPropertyForm({
                            address: property.address,
                            city: property.city || "",
                            state: property.state || "",
                            zip: property.zip || "",
                            propertyType: property.propertyType || "",
                            estimatedValue: property.estimatedValue != null ? String(property.estimatedValue) : "",
                            units: property.units != null ? String(property.units) : "",
                            monthlyRent: property.monthlyRent != null ? String(property.monthlyRent) : "",
                            annualTaxes: property.annualTaxes != null ? String(property.annualTaxes) : "",
                            annualInsurance: property.annualInsurance != null ? String(property.annualInsurance) : "",
                            isPrimary: property.isPrimary,
                          });
                          setPropertyDialogOpen(true);
                        }}
                        data-testid={`button-edit-property-${property.id}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => deletePropertyMutation.mutate(property.id)}
                        data-testid={`button-delete-property-${property.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))
              ) : deal.propertyAddress ? (
                <div className="text-center py-4">
                  <p className="text-sm text-muted-foreground mb-2">No properties added</p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => addPropertyMutation.mutate({ address: deal.propertyAddress, isPrimary: true })}
                    disabled={addPropertyMutation.isPending}
                    data-testid="button-import-property"
                  >
                    {addPropertyMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}
                    Import from deal address
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">No properties added</p>
              )}
            </CardContent>
          </Card>

          {(() => {
            const FIELD_LABELS: Record<string, string> = {
              loanAmount: 'Loan Amount', propertyValue: 'Property Value', loanType: 'Loan Type',
              loanPurpose: 'Loan Purpose', propertyType: 'Property Type', interestOnly: 'Interest Only',
              ltv: 'LTV', dscr: 'Est. DSCR', ficoScore: 'Credit Score', creditScore: 'Credit Score',
              prepaymentPenalty: 'Prepayment Penalty', tpoPremium: 'TPO Premium', loanTerm: 'Loan Term',
              loanTermMonths: 'Loan Term (Months)', asIsValue: 'As-Is Value', arv: 'ARV',
              rehabBudget: 'Rehab Budget', exitStrategy: 'Exit Strategy', experience: 'Experience',
              constructionBudget: 'Construction Budget', entityType: 'Entity Type', entityName: 'Entity Name',
              occupancy: 'Occupancy', units: 'Units', annualTaxes: 'Annual Taxes',
              annualInsurance: 'Annual Insurance', monthlyRent: 'Monthly Rent', monthlyHOA: 'Monthly HOA',
              appraisalValue: 'Appraisal Value', cashOut: 'Cash Out Amount', citizenshipStatus: 'Citizenship',
              grossMonthlyRent: 'Gross Monthly Rent', calculatedDscr: 'Calculated DSCR',
              monthlyPITIA: 'Monthly PITIA', downPayment: 'Down Payment', reserveMonths: 'Reserve Months',
              squareFootage: 'Square Footage', yearBuilt: 'Year Built', occupancyStatus: 'Occupancy Status',
              borrowerExperience: 'Borrower Experience', numberOfUnits: 'Number of Units',
              estimatedPropertyValue: 'Estimated Property Value', purchasePrice: 'Purchase Price',
            };
            const SKIP_KEYS = ['additionalProperties', 'propertyAddress', 'firstName', 'lastName', 'email', 'phone', 'address'];
            const CURRENCY_KEYS = ['loanAmount', 'propertyValue', 'asIsValue', 'arv', 'rehabBudget', 'constructionBudget', 'cashOut', 'annualTaxes', 'annualInsurance', 'monthlyRent', 'monthlyHOA', 'appraisalValue', 'grossMonthlyRent', 'monthlyPITIA', 'downPayment', 'estimatedPropertyValue', 'purchasePrice', 'annualPropertyTax'];
            const formatValue = (key: string, val: any): string => {
              if (val === null || val === undefined || val === '') return '\u2014';
              if (typeof val === 'boolean') return val ? 'Yes' : 'No';
              if (CURRENCY_KEYS.includes(key)) {
                const n = typeof val === 'string' ? parseFloat(val) : val;
                if (!isNaN(n)) return formatCurrency(n);
              }
              return String(val);
            };

            let sourceData: Record<string, any> = {};
            if (deal.applicationData && Object.keys(deal.applicationData).length > 0) {
              sourceData = { ...deal.applicationData };
            } else {
              if (deal.loanData?.loanAmount) sourceData.loanAmount = deal.loanData.loanAmount;
              if (deal.loanData?.propertyValue) sourceData.propertyValue = deal.loanData.propertyValue;
              if (deal.loanData?.loanType && deal.loanData.loanType !== 'unknown') sourceData.loanType = deal.loanData.loanType;
              if (deal.loanData?.loanPurpose) sourceData.loanPurpose = deal.loanData.loanPurpose;
              if (deal.loanData?.propertyType && deal.loanData.propertyType !== 'unknown') sourceData.propertyType = deal.loanData.propertyType;
              if (deal.loanData?.loanTerm) sourceData.loanTerm = deal.loanData.loanTerm;
              if (deal.loanData?.ltv) sourceData.ltv = deal.loanData.ltv;
              if (deal.interestRate && deal.interestRate !== '—') sourceData.interestRate = deal.interestRate;
            }

            const entries = Object.entries(sourceData)
              .filter(([key]) => !SKIP_KEYS.includes(key))
              .map(([key, val]) => ({ label: FIELD_LABELS[key] || key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase()).trim(), value: formatValue(key, val) }));

            if (entries.length === 0) return null;

            return (
              <Card className="mt-4" data-testid="card-application-details">
                <CardHeader className="pb-3 flex flex-row items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Application Details
                  </CardTitle>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => {
                      const formData: Record<string, string> = {};
                      entries.forEach(({ label, value }) => {
                        const key = Object.entries(FIELD_LABELS).find(([, v]) => v === label)?.[0] || label;
                        const originalVal = sourceData[key];
                        formData[key] = originalVal !== null && originalVal !== undefined ? String(originalVal) : '';
                      });
                      setAppEditForm(formData);
                      setAppEditDialogOpen(true);
                    }}
                    data-testid="button-edit-application-details"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                    {entries.map(({ label, value }) => (
                      <div key={label} className="flex items-center justify-between gap-2 py-1 border-b border-border/50 last:border-0">
                        <span className="text-xs text-muted-foreground">{label}</span>
                        <span className="text-sm font-medium text-right" data-testid={`text-app-${label.toLowerCase().replace(/\s+/g, '-')}`}>{value}</span>
                      </div>
                    ))}
                    {(() => {
                      const properties = data?.properties || [];
                      const totalRent = properties.reduce((sum, p) => sum + (p.monthlyRent || 0), 0);
                      const totalTaxes = properties.reduce((sum, p) => sum + (p.annualTaxes || 0), 0);
                      const totalInsurance = properties.reduce((sum, p) => sum + (p.annualInsurance || 0), 0);
                      const totals: { label: string; value: string; testId: string }[] = [];
                      if (totalRent > 0) totals.push({ label: 'Total Rent (Monthly)', value: formatCurrency(totalRent), testId: 'text-total-rent' });
                      if (totalTaxes > 0) totals.push({ label: 'Total Taxes (Annual)', value: formatCurrency(totalTaxes), testId: 'text-total-taxes' });
                      if (totalInsurance > 0) totals.push({ label: 'Total Insurance (Annual)', value: formatCurrency(totalInsurance), testId: 'text-total-insurance' });
                      return totals.map(({ label, value, testId }) => (
                        <div key={label} className="flex items-center justify-between gap-2 py-1 border-b border-border/50 last:border-0">
                          <span className="text-xs text-muted-foreground">{label}</span>
                          <span className="text-sm font-semibold text-right" data-testid={testId}>{value}</span>
                        </div>
                      ));
                    })()}
                  </div>
                </CardContent>
              </Card>
            );
          })()}

          <Card className="mt-4" data-testid="card-deal-status">
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div
                    className="h-3 w-3 rounded-full flex-shrink-0"
                    style={{
                      backgroundColor: {
                        active: '#16a34a',
                        closed: '#2563eb',
                        on_hold: '#d97706',
                        archived: '#6b7280',
                      }[deal.projectStatus || 'active'] || '#6b7280',
                    }}
                  />
                  <span className="text-sm font-medium text-muted-foreground">Deal Status</span>
                </div>
                <Select
                  value={deal.projectStatus || 'active'}
                  onValueChange={(value) => updateStatusMutation.mutate(value)}
                  disabled={updateStatusMutation.isPending}
                >
                  <SelectTrigger
                    className="w-[140px] font-semibold"
                    style={{
                      backgroundColor: {
                        active: 'rgba(34, 197, 94, 0.1)',
                        closed: 'rgba(59, 130, 246, 0.1)',
                        on_hold: 'rgba(245, 158, 11, 0.1)',
                        archived: 'rgba(107, 114, 128, 0.1)',
                      }[deal.projectStatus || 'active'] || 'rgba(107, 114, 128, 0.1)',
                      borderColor: {
                        active: 'rgba(34, 197, 94, 0.3)',
                        closed: 'rgba(59, 130, 246, 0.3)',
                        on_hold: 'rgba(245, 158, 11, 0.3)',
                        archived: 'rgba(107, 114, 128, 0.3)',
                      }[deal.projectStatus || 'active'] || 'rgba(107, 114, 128, 0.3)',
                      color: {
                        active: '#16a34a',
                        closed: '#2563eb',
                        on_hold: '#d97706',
                        archived: '#6b7280',
                      }[deal.projectStatus || 'active'] || '#6b7280',
                    }}
                    data-testid="select-deal-status"
                  >
                    <SelectValue>
                      {{ active: 'Active', closed: 'Closed', on_hold: 'On Hold', archived: 'Archive' }[deal.projectStatus || 'active'] || deal.projectStatus}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {[
                      { value: 'active', label: 'Active', color: '#16a34a' },
                      { value: 'closed', label: 'Closed', color: '#2563eb' },
                      { value: 'on_hold', label: 'On Hold', color: '#d97706' },
                      { value: 'archived', label: 'Archive', color: '#6b7280' },
                    ].map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        <span className="flex items-center gap-2">
                          <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                          {s.label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between gap-4 mt-3 pt-3 border-t">
                <div className="flex items-center gap-3">
                  <div
                    className="h-3 w-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: stages.find(s => s.key === deal.stage)?.color || '#6b7280' }}
                  />
                  <span className="text-sm font-medium text-muted-foreground">Stage</span>
                </div>
                {stages.length > 0 ? (
                  <Select
                    value={deal.stage}
                    onValueChange={(value) => updateStageMutation.mutate(value)}
                    disabled={updateStageMutation.isPending}
                  >
                    <SelectTrigger
                      className="w-[180px] font-semibold"
                      style={getStageStyle(deal.stage, stages)}
                      data-testid="select-deal-stage"
                    >
                      <SelectValue>{getStageLabelFromStages(deal.stage, stages)}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {stages.filter(s => s.isActive !== false).map((stage) => (
                        <SelectItem key={stage.id} value={stage.key}>
                          <span className="flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: stage.color || '#6b7280' }} />
                            {stage.label}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Badge variant="secondary" className="text-xs">
                    {deal.stage || 'No Stage'}
                  </Badge>
                )}
              </div>

              <div className="flex items-center justify-between gap-4 mt-3 pt-3 border-t">
                <span className="text-sm font-medium text-muted-foreground">Loan Program</span>
                <Select
                  value={deal.programId ? String(deal.programId) : ""}
                  onValueChange={(val) => {
                    if (val && val !== String(deal.programId)) {
                      setPendingProgramId(val);
                      setConvertProgramDialogOpen(true);
                    }
                  }}
                >
                  <SelectTrigger className="w-[180px] h-8 text-sm" data-testid="select-loan-program">
                    <SelectValue placeholder="Select program" />
                  </SelectTrigger>
                  <SelectContent>
                    {(loanProgramsData || []).map((prog: any) => (
                      <SelectItem key={prog.id} value={String(prog.id)}>
                        {prog.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4" />
              People
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Borrower</div>
                <Button variant="ghost" size="sm" onClick={() => {
                  setBorrowerForm({
                    firstName: deal.customerFirstName || "",
                    lastName: deal.customerLastName || "",
                    email: deal.customerEmail || "",
                    phone: deal.customerPhone || "",
                  });
                  setShowEditBorrower(true);
                }} data-testid="button-edit-borrower">
                  <Pencil className="h-3.5 w-3.5 mr-1" />
                  Edit
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded-full bg-info/10 flex items-center justify-center flex-shrink-0">
                  <User className="h-3.5 w-3.5 text-info" />
                </div>
                <div className="min-w-0">
                  <div className="font-medium truncate">{borrowerName}</div>
                  <div className="text-xs text-muted-foreground truncate">{borrowerEmail}</div>
                </div>
              </div>
              {deal.customerPhone && (
                <div className="flex items-center gap-2 text-muted-foreground mt-1 ml-9">
                  <Phone className="h-3 w-3" />
                  <span className="text-xs">{deal.customerPhone}</span>
                </div>
              )}
            </div>
            <div className="border-t pt-3">
              <div className="flex items-center justify-between mb-1.5">
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Processor</div>
                <Button variant="ghost" size="sm" onClick={() => setShowAddProcessor(true)} data-testid="button-add-processor">
                  <UserPlus className="h-3.5 w-3.5 mr-1" />
                  {dealProcessorsData && dealProcessorsData.length > 0 ? "Edit" : "Assign"}
                </Button>
              </div>
              {dealProcessorsData && dealProcessorsData.length > 0 ? (
                <div className="space-y-1.5">
                  {dealProcessorsData.map((proc: any) => (
                    <div key={proc.id} className="flex items-center gap-2" data-testid={`processor-${proc.id}`}>
                      <div className="h-7 w-7 rounded-full bg-success/10 flex items-center justify-center flex-shrink-0">
                        <User className="h-3.5 w-3.5 text-success" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-medium truncate">{proc.user?.fullName || 'Unknown'}</div>
                        <div className="text-xs text-muted-foreground truncate">{proc.user?.email}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic ml-9">Not assigned</p>
              )}
            </div>
            <div className="border-t pt-3">
              <div className="flex items-center justify-between mb-1.5">
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Broker</div>
                <Button variant="ghost" size="sm" onClick={() => {
                  setSelectedBrokerId(deal.userId ? String(deal.userId) : "");
                  setShowEditBroker(true);
                }} data-testid="button-edit-broker">
                  <Pencil className="h-3.5 w-3.5 mr-1" />
                  {deal.userName ? "Edit" : "Assign"}
                </Button>
              </div>
              {deal.userName ? (
                <div className="flex items-center gap-2">
                  <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <User className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium truncate">{deal.userName}</div>
                    <div className="text-xs text-muted-foreground truncate">{deal.userEmail}</div>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic ml-9">No broker assigned</p>
              )}
            </div>
            <div className="border-t pt-3">
              <div className="flex items-center justify-between mb-1.5">
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Third Parties</div>
                <Button variant="ghost" size="sm" onClick={() => {
                  setEditingThirdPartyId(null);
                  setThirdPartyForm({ name: "", email: "", phone: "", role: "", company: "", customRole: "" });
                  setShowAddThirdParty(true);
                }} data-testid="button-add-third-party">
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Add
                </Button>
              </div>
              {thirdPartiesData?.contacts && thirdPartiesData.contacts.length > 0 ? (
                <div className="space-y-2">
                  {thirdPartiesData.contacts.map((contact: any) => (
                    <div key={contact.id} className="flex items-center gap-2 group" data-testid={`third-party-${contact.id}`}>
                      <div className="h-7 w-7 rounded-full bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                        <User className="h-3.5 w-3.5 text-amber-600" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-medium truncate text-xs">{contact.name}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {contact.role}{contact.company ? ` · ${contact.company}` : ''}
                        </div>
                        {contact.email && <div className="text-xs text-muted-foreground truncate">{contact.email}</div>}
                      </div>
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => {
                          const predefinedRoles = ['Title Contact', 'Attorney', 'Insurance Agent', 'Appraiser', 'Surveyor', 'Inspector', 'Accountant', 'Contractor'];
                          const isPredefined = predefinedRoles.includes(contact.role);
                          setEditingThirdPartyId(contact.id);
                          setThirdPartyForm({
                            name: contact.name || "",
                            email: contact.email || "",
                            phone: contact.phone || "",
                            role: isPredefined ? contact.role : "custom",
                            company: contact.company || "",
                            customRole: isPredefined ? "" : contact.role,
                          });
                          setShowAddThirdParty(true);
                        }} data-testid={`button-edit-third-party-${contact.id}`}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => deleteThirdPartyMutation.mutate(contact.id)} data-testid={`button-delete-third-party-${contact.id}`}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic ml-9">No third parties added</p>
              )}
            </div>

            {/* Share Deal Links - nested in People */}
            <div className="border-t pt-3">
              <div className="flex items-center gap-2 mb-3">
                <LinkIcon className="h-3.5 w-3.5 text-muted-foreground" />
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Share Deal Links</div>
              </div>

              <div className="space-y-3">
                {/* Borrower Portal Link */}
                <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Borrower Portal</div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => generateBorrowerLinkMutation.mutate()}
                      disabled={generateBorrowerLinkMutation.isPending}
                      data-testid="button-generate-borrower-link"
                    >
                      {generateBorrowerLinkMutation.isPending ? (
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      ) : deal?.borrowerPortalToken ? (
                        <RefreshCw className="h-3 w-3 mr-1" />
                      ) : (
                        <Plus className="h-3 w-3 mr-1" />
                      )}
                      {deal?.borrowerPortalToken ? 'Regenerate' : 'Generate'}
                    </Button>
                    {deal?.borrowerPortalToken && (
                      <>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 flex-shrink-0"
                          onClick={() => copyToClipboard(`${window.location.origin}/portal/${deal.borrowerPortalToken}`, "Borrower link")}
                          data-testid="button-copy-borrower-link"
                        >
                          {borrowerPortalCopied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => updatePortalSettingsMutation.mutate({ borrowerPortalEnabled: !deal?.borrowerPortalEnabled })}
                          disabled={updatePortalSettingsMutation.isPending}
                          data-testid="button-toggle-borrower-portal"
                        >
                          {deal?.borrowerPortalEnabled ? "Disable" : "Enable"}
                        </Button>
                      </>
                    )}
                  </div>
                  {deal?.borrowerPortalToken && (
                    <>
                      <div
                        className="w-full px-2 py-1.5 text-[11px] border rounded bg-background cursor-pointer font-mono text-muted-foreground truncate hover:text-foreground transition-colors"
                        onClick={() => copyToClipboard(`${window.location.origin}/portal/${deal.borrowerPortalToken}`, "Borrower link")}
                        title={`${window.location.origin}/portal/${deal.borrowerPortalToken}`}
                        data-testid="input-borrower-link"
                      >
                        {`${window.location.origin}/portal/${deal.borrowerPortalToken}`}
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="w-full justify-center text-xs h-7"
                        onClick={() => window.open(`/portal/${deal.borrowerPortalToken}`, '_blank')}
                        data-testid="button-view-borrower-portal"
                      >
                        <Eye className="h-3 w-3 mr-1" />
                        View Borrower Portal
                      </Button>
                    </>
                  )}
                </div>

                {/* Broker Portal Link */}
                <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Broker Portal</div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => generateBrokerLinkMutation.mutate()}
                      disabled={generateBrokerLinkMutation.isPending}
                      data-testid="button-generate-broker-link"
                    >
                      {generateBrokerLinkMutation.isPending ? (
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      ) : deal?.brokerPortalToken ? (
                        <RefreshCw className="h-3 w-3 mr-1" />
                      ) : (
                        <Plus className="h-3 w-3 mr-1" />
                      )}
                      {deal?.brokerPortalToken ? 'Regenerate' : 'Generate'}
                    </Button>
                    {deal?.brokerPortalToken && (
                      <>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 flex-shrink-0"
                          onClick={() => copyToClipboard(`${window.location.origin}/broker-portal/${deal.brokerPortalToken}`, "Broker link")}
                          data-testid="button-copy-broker-link"
                        >
                          {brokerPortalCopied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => updatePortalSettingsMutation.mutate({ brokerPortalEnabled: !deal?.brokerPortalEnabled })}
                          disabled={updatePortalSettingsMutation.isPending}
                          data-testid="button-toggle-broker-portal"
                        >
                          {deal?.brokerPortalEnabled ? "Disable" : "Enable"}
                        </Button>
                      </>
                    )}
                  </div>
                  {deal?.brokerPortalToken && (
                    <>
                      <div
                        className="w-full px-2 py-1.5 text-[11px] border rounded bg-background cursor-pointer font-mono text-muted-foreground truncate hover:text-foreground transition-colors"
                        onClick={() => copyToClipboard(`${window.location.origin}/broker-portal/${deal.brokerPortalToken}`, "Broker link")}
                        title={`${window.location.origin}/broker-portal/${deal.brokerPortalToken}`}
                        data-testid="input-broker-link"
                      >
                        {`${window.location.origin}/broker-portal/${deal.brokerPortalToken}`}
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="w-full justify-center text-xs h-7"
                        onClick={() => window.open(`/broker-portal/${deal.brokerPortalToken}`, '_blank')}
                        data-testid="button-view-broker-portal"
                      >
                        <Eye className="h-3 w-3 mr-1" />
                        View Broker Portal
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Add/Edit Third Party Dialog */}
      <Dialog open={showAddThirdParty} onOpenChange={setShowAddThirdParty}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingThirdPartyId ? 'Edit' : 'Add'} Third Party Contact</DialogTitle>
            <DialogDescription>Add someone involved in this deal like an attorney, title agent, or insurance provider.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={thirdPartyForm.role} onValueChange={(val) => setThirdPartyForm(prev => ({ ...prev, role: val, customRole: val === "custom" ? prev.customRole : "" }))}>
                <SelectTrigger data-testid="select-third-party-role">
                  <SelectValue placeholder="Select a role..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Title Contact">Title Contact</SelectItem>
                  <SelectItem value="Attorney">Attorney</SelectItem>
                  <SelectItem value="Insurance Agent">Insurance Agent</SelectItem>
                  <SelectItem value="Appraiser">Appraiser</SelectItem>
                  <SelectItem value="Surveyor">Surveyor</SelectItem>
                  <SelectItem value="Inspector">Inspector</SelectItem>
                  <SelectItem value="Accountant">Accountant</SelectItem>
                  <SelectItem value="Contractor">Contractor</SelectItem>
                  <SelectItem value="custom">Other (Custom Role)</SelectItem>
                </SelectContent>
              </Select>
              {thirdPartyForm.role === "custom" && (
                <Input
                  value={thirdPartyForm.customRole}
                  onChange={(e) => setThirdPartyForm(prev => ({ ...prev, customRole: e.target.value }))}
                  placeholder="Enter custom role..."
                  data-testid="input-third-party-custom-role"
                />
              )}
            </div>
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={thirdPartyForm.name}
                onChange={(e) => setThirdPartyForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Full name"
                data-testid="input-third-party-name"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  value={thirdPartyForm.email}
                  onChange={(e) => setThirdPartyForm(prev => ({ ...prev, email: e.target.value }))}
                  placeholder="email@example.com"
                  type="email"
                  data-testid="input-third-party-email"
                />
              </div>
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input
                  value={thirdPartyForm.phone}
                  onChange={(e) => setThirdPartyForm(prev => ({ ...prev, phone: e.target.value }))}
                  placeholder="(555) 123-4567"
                  data-testid="input-third-party-phone"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Company</Label>
              <Input
                value={thirdPartyForm.company}
                onChange={(e) => setThirdPartyForm(prev => ({ ...prev, company: e.target.value }))}
                placeholder="Company name (optional)"
                data-testid="input-third-party-company"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddThirdParty(false)}>Cancel</Button>
            <Button
              onClick={() => {
                const role = thirdPartyForm.role === "custom" ? thirdPartyForm.customRole : thirdPartyForm.role;
                const payload = { name: thirdPartyForm.name, email: thirdPartyForm.email, phone: thirdPartyForm.phone, role, company: thirdPartyForm.company };
                if (editingThirdPartyId) {
                  updateThirdPartyMutation.mutate({ id: editingThirdPartyId, data: payload });
                } else {
                  addThirdPartyMutation.mutate(payload as any);
                }
              }}
              disabled={!thirdPartyForm.name.trim() || (!thirdPartyForm.role || (thirdPartyForm.role === "custom" && !thirdPartyForm.customRole.trim())) || addThirdPartyMutation.isPending || updateThirdPartyMutation.isPending}
              data-testid="button-confirm-third-party"
            >
              {(addThirdPartyMutation.isPending || updateThirdPartyMutation.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingThirdPartyId ? 'Update Contact' : 'Add Contact'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manage Processor Dialog */}
      <Dialog open={showAddProcessor} onOpenChange={setShowAddProcessor}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Manage Processor</DialogTitle>
            <DialogDescription>Assign or change the processor on this deal.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {dealProcessorsData && dealProcessorsData.length > 0 && (
              <div className="space-y-2">
                <Label>Currently Assigned</Label>
                <div className="space-y-2">
                  {dealProcessorsData.map((proc: any) => (
                    <div key={proc.id} className="flex items-center justify-between p-2 rounded-md border" data-testid={`processor-manage-${proc.id}`}>
                      <div className="flex items-center gap-2">
                        <div className="h-7 w-7 rounded-full bg-success/10 flex items-center justify-center">
                          <User className="h-3.5 w-3.5 text-success" />
                        </div>
                        <div>
                          <div className="text-sm font-medium">{proc.user?.fullName || 'Unknown'}</div>
                          <div className="text-xs text-muted-foreground">{proc.user?.email}</div>
                        </div>
                      </div>
                      <Button variant="ghost" size="icon" className="text-destructive" onClick={() => removeProcessorMutation.mutate(proc.id)} data-testid={`button-remove-processor-${proc.id}`}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label>Add Processor</Label>
              <Select value={selectedProcessorId} onValueChange={setSelectedProcessorId}>
                <SelectTrigger data-testid="select-processor">
                  <SelectValue placeholder="Choose a team member..." />
                </SelectTrigger>
                <SelectContent>
                  {(availableProcessors || [])
                    .filter((p: any) => !dealProcessorsData?.some((dp: any) => dp.userId === p.id))
                    .map((p: any) => (
                      <SelectItem key={p.id} value={String(p.id)}>{p.fullName || p.email}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddProcessor(false)}>Cancel</Button>
            <Button onClick={() => selectedProcessorId && addProcessorMutation.mutate(parseInt(selectedProcessorId))} disabled={!selectedProcessorId || addProcessorMutation.isPending} data-testid="button-confirm-add-processor">
              {addProcessorMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Add Processor
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Borrower Dialog */}
      <Dialog open={showEditBorrower} onOpenChange={setShowEditBorrower}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Borrower</DialogTitle>
            <DialogDescription>Update the borrower's contact information.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>First Name</Label>
                <Input
                  value={borrowerForm.firstName}
                  onChange={(e) => setBorrowerForm(f => ({ ...f, firstName: e.target.value }))}
                  data-testid="input-borrower-first-name"
                />
              </div>
              <div className="space-y-2">
                <Label>Last Name</Label>
                <Input
                  value={borrowerForm.lastName}
                  onChange={(e) => setBorrowerForm(f => ({ ...f, lastName: e.target.value }))}
                  data-testid="input-borrower-last-name"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                value={borrowerForm.email}
                onChange={(e) => setBorrowerForm(f => ({ ...f, email: e.target.value }))}
                data-testid="input-borrower-email"
              />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input
                type="tel"
                value={borrowerForm.phone}
                onChange={(e) => setBorrowerForm(f => ({ ...f, phone: e.target.value }))}
                data-testid="input-borrower-phone"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditBorrower(false)}>Cancel</Button>
            <Button
              onClick={() => {
                const fullName = `${borrowerForm.firstName} ${borrowerForm.lastName}`.trim();
                updatePeopleMutation.mutate({
                  borrowerName: fullName,
                  borrowerEmail: borrowerForm.email,
                  borrowerPhone: borrowerForm.phone,
                });
              }}
              disabled={!borrowerForm.firstName.trim() || updatePeopleMutation.isPending}
              data-testid="button-save-borrower"
            >
              {updatePeopleMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Broker Dialog */}
      <Dialog open={showEditBroker} onOpenChange={setShowEditBroker}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Broker</DialogTitle>
            <DialogDescription>Select a broker for this deal.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Broker</Label>
              <Select value={selectedBrokerId} onValueChange={setSelectedBrokerId}>
                <SelectTrigger data-testid="select-broker">
                  <SelectValue placeholder="Choose a broker..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No broker (unassign)</SelectItem>
                  {(availableProcessors || []).map((p: any) => (
                    <SelectItem key={p.id} value={String(p.id)}>{p.fullName || p.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditBroker(false)}>Cancel</Button>
            <Button
              onClick={() => {
                const brokerId = selectedBrokerId === "none" ? null : parseInt(selectedBrokerId);
                updatePeopleMutation.mutate({ brokerId });
              }}
              disabled={!selectedBrokerId || updatePeopleMutation.isPending}
              data-testid="button-save-broker"
            >
              {updatePeopleMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Filter Bar */}
      <Card data-testid="card-filter-bar">
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              {([
                { key: 'all' as const, label: 'All', icon: ListChecks },
                { key: 'completed' as const, label: 'Completed', icon: CheckCircle2 },
                { key: 'todo' as const, label: 'To-Do', icon: Circle },
                { key: 'digests' as const, label: 'Communications', icon: BarChart3 },
                { key: 'ai_insights' as const, label: 'AI Insights', icon: Zap },
              ]).map(filter => (
                <Button
                  key={filter.key}
                  variant={activeFilter === filter.key ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setActiveFilter(filter.key)}
                  data-testid={`filter-${filter.key}`}
                >
                  <filter.icon className="h-4 w-4 mr-1.5" />
                  {filter.label}
                </Button>
              ))}
            </div>
            <div className="flex items-center gap-3">
              {(() => {
                const overall = computeOverallProgress();
                return (
                  <span className="text-sm text-muted-foreground" data-testid="text-quick-stats">
                    <strong>{overall.completedItems}</strong> / {overall.totalItems} completed
                  </span>
                );
              })()}
              {(() => {
                const allDocs = projectStages.flatMap(s => getStageDocuments(s)).concat(getUnassignedDocuments());
                const aiReviewedCount = allDocs.filter(d => d.status === 'ai_reviewed').length;
                return aiReviewedCount > 0 ? (
                  <Button
                    size="sm"
                    variant="default"
                    onClick={(e) => { e.stopPropagation(); approveAllDocsMutation.mutate(); }}
                    disabled={approveAllDocsMutation.isPending}
                    data-testid="button-approve-all-docs"
                  >
                    {approveAllDocsMutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />}
                    Approve All & Push To Drive ({aiReviewedCount})
                  </Button>
                ) : null;
              })()}
            </div>
          </div>
          {(activeFilter === 'all' || activeFilter === 'completed' || activeFilter === 'todo') && (
            <div className="mt-3 pt-3 border-t flex items-center justify-between gap-4 flex-wrap">
              <Select value={subFilter} onValueChange={(v) => setSubFilter(v as 'all' | 'documents' | 'tasks')}>
                <SelectTrigger className="w-[200px]" data-testid="select-sub-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Documents & Tasks</SelectItem>
                  <SelectItem value="documents">Documents Only</SelectItem>
                  <SelectItem value="tasks">Tasks Only</SelectItem>
                </SelectContent>
              </Select>
              {linkedProjectId && (
                <div className="flex items-center gap-2">
                  <Button
                    onClick={(e) => { e.stopPropagation(); syncAllDriveMutation.mutate(); }}
                    disabled={driveSyncing}
                    variant="outline"
                    className="text-base px-5 py-3 h-auto font-semibold"
                    data-testid="button-sync-all-drive"
                  >
                    {driveSyncing ? <Loader2 className="h-5 w-5 mr-2 animate-spin" /> : <CloudUpload className="h-5 w-5 mr-2" />}
                    {driveSyncing ? 'Syncing...' : 'Sync all Approved Documents to Drive'}
                  </Button>
                  {projectDetailData?.project?.googleDriveFolderId && (
                    <Button
                      onClick={(e) => {
                        e.stopPropagation();
                        const folderUrl = projectDetailData.project.googleDriveFolderUrl || `https://drive.google.com/drive/folders/${projectDetailData.project.googleDriveFolderId}`;
                        window.open(folderUrl, '_blank');
                      }}
                      variant="outline"
                      className="text-base px-5 py-3 h-auto font-semibold border-green-300 text-green-700 hover:bg-green-50 dark:border-green-700 dark:text-green-400 dark:hover:bg-green-900/20"
                      data-testid="button-open-drive-folder"
                    >
                      <FolderOpen className="h-5 w-5 mr-2" />
                      Open Drive Folder
                    </Button>
                  )}
                  <Button
                    onClick={(e) => { e.stopPropagation(); triggerPipeline.mutate(); }}
                    disabled={pipelineRunning}
                    className="bg-success hover:bg-success/90 text-white text-base px-6 py-3 h-auto font-semibold"
                    data-testid="button-trigger-pipeline"
                  >
                    {pipelineRunning ? <Loader2 className="h-5 w-5 mr-2 animate-spin" /> : <Zap className="h-5 w-5 mr-2" />}
                    {pipelineRunning ? 'PROCESSING...' : 'AUTOMATIC PROCESSING'}
                  </Button>
                </div>
              )}
            </div>
          )}

          {dealId && <DealReviewModeControl dealId={parseInt(dealId)} />}
        </CardContent>
      </Card>

      {/* Stage-based workflow content */}
      {(activeFilter === 'all' || activeFilter === 'completed' || activeFilter === 'todo') && (
        <div className="space-y-4" data-testid="stages-workflow">
          {projectStages.length > 0 ? (
            projectStages.map((stage, stageIndex) => {
              const isExpanded = expandedStages.has(stage.id);
              const derivedStatus = deriveStageStatus(stage);
              const isCompleted = derivedStatus === 'completed';
              const isActive = derivedStatus === 'in_progress';
              const progress = computeStageProgress(stage);
              const allStageTasks = stage.tasks || [];
              const allStageDocs = getStageDocuments(stage);

              const showTasks = subFilter === 'all' || subFilter === 'tasks';
              const showDocs = subFilter === 'all' || subFilter === 'documents';

              const stageTasks = allStageTasks.filter(t => {
                if (activeFilter === 'completed') return t.status === 'completed';
                if (activeFilter === 'todo') return t.status !== 'completed';
                return true;
              });
              const stageDocs = allStageDocs.filter(d => {
                const isDocCompleted = d.status === 'approved' || d.status === 'ai_reviewed' || d.status === 'uploaded';
                if (activeFilter === 'completed') return isDocCompleted;
                if (activeFilter === 'todo') return !isDocCompleted;
                return true;
              });

              const visibleTaskCount = showTasks ? stageTasks.length : 0;
              const visibleDocCount = showDocs ? stageDocs.length : 0;
              if ((activeFilter === 'completed' || activeFilter === 'todo') && visibleTaskCount === 0 && visibleDocCount === 0) {
                return null;
              }

              return (
                <Card
                  key={stage.id}
                  className={cn(
                    "transition-all",
                    isActive && "border-info ring-2 ring-info/10",
                    isCompleted && "border-success opacity-90"
                  )}
                  data-testid={`stage-card-${stage.id}`}
                >
                  <div
                    className="flex items-center justify-between gap-4 p-5 cursor-pointer hover-elevate rounded-md"
                    onClick={() => toggleStageExpanded(stage.id)}
                    data-testid={`stage-header-${stage.id}`}
                  >
                    <div className="flex items-center gap-4">
                      <div className={cn(
                        "h-10 w-10 rounded-full flex items-center justify-center flex-shrink-0",
                        isCompleted && "bg-success/10 text-success",
                        isActive && "bg-info/10 text-info",
                        !isCompleted && !isActive && "bg-muted text-muted-foreground"
                      )}>
                        {isCompleted ? <CheckCircle2 className="h-5 w-5" /> : isActive ? <Clock className="h-5 w-5" /> : <Circle className="h-5 w-5" />}
                      </div>
                      <div>
                        <h3 className="text-base font-semibold">{stageIndex + 1}. {stage.stageName}</h3>
                        {stage.stageDescription && (
                          <p className="text-sm text-muted-foreground">{stage.stageDescription}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="relative h-12 w-12 flex-shrink-0" data-testid={`progress-ring-${stage.id}`}>
                        <svg viewBox="0 0 36 36" className="h-12 w-12 -rotate-90">
                          <path
                            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                            fill="none"
                            className="stroke-border"
                            strokeWidth="3"
                          />
                          <path
                            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                            fill="none"
                            className={cn(
                              isCompleted ? "stroke-emerald-500" : "stroke-blue-500"
                            )}
                            strokeWidth="3"
                            strokeLinecap="round"
                            strokeDasharray={`${progress.percent}, 100`}
                            style={{ transition: 'stroke-dasharray 0.5s ease' }}
                          />
                        </svg>
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="text-xs font-semibold">{progress.percent}%</span>
                        </div>
                      </div>
                      {isExpanded ? <ChevronDown className="h-5 w-5 text-muted-foreground" /> : <ChevronRight className="h-5 w-5 text-muted-foreground" />}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="border-t px-5 pb-5">
                      {showTasks && stageTasks.length > 0 && (
                        <div className="mt-5">
                          <h4 className="text-sm font-semibold flex items-center gap-2 mb-3">
                            <CheckSquare className="h-4 w-4 text-muted-foreground" />
                            Tasks ({stageTasks.filter(t => t.status === 'completed').length}/{stageTasks.length})
                          </h4>
                          <div className="space-y-2">
                            {stageTasks.map((task) => {
                              const assignedMember = teamData?.teamMembers?.find(m => String(m.id) === task.assignedTo);
                              return (
                              <div
                                key={task.id}
                                className={cn(
                                  "flex items-center gap-3 p-3 rounded-lg border",
                                  task.status === 'completed' && "bg-success/10 border-success/30 opacity-80"
                                )}
                                data-testid={`task-row-${task.id}`}
                              >
                                <Checkbox
                                  checked={task.status === 'completed'}
                                  onCheckedChange={(checked) => {
                                    if (linkedProjectId) {
                                      updateProjectTaskMutation.mutate({
                                        projectId: linkedProjectId,
                                        taskId: task.id,
                                        status: checked ? 'completed' : 'pending'
                                      });
                                    }
                                  }}
                                  data-testid={`checkbox-task-${task.id}`}
                                />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className={cn("text-sm font-medium", task.status === 'completed' && "line-through text-muted-foreground")}>
                                      {task.taskTitle}
                                    </span>
                                    {getPriorityBadge(task.priority)}
                                    {task.borrowerActionRequired && (
                                      <Badge variant="outline" className="text-xs">Borrower Action</Badge>
                                    )}
                                  </div>
                                  {task.completedAt && (
                                    <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                                      <Check className="h-3 w-3 text-success" />
                                      {formatDateTime(task.completedAt)}
                                      {task.completedBy && ` by ${task.completedBy}`}
                                    </div>
                                  )}
                                </div>
                                <Select
                                  value={task.assignedTo || "unassigned"}
                                  onValueChange={(value) => {
                                    if (linkedProjectId) {
                                      updateProjectTaskMutation.mutate({
                                        projectId: linkedProjectId,
                                        taskId: task.id,
                                        assignedTo: value === "unassigned" ? null : value,
                                      });
                                    }
                                  }}
                                >
                                  <SelectTrigger
                                    className="w-[140px] h-8 text-xs shrink-0"
                                    data-testid={`select-assign-task-${task.id}`}
                                  >
                                    <SelectValue placeholder="Assign to..." />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="unassigned">Unassigned</SelectItem>
                                    <SelectItem value="borrower">{borrowerName.trim() || 'Borrower'} (Borrower)</SelectItem>
                                    {deal.userName && (
                                      <SelectItem value="broker">{deal.userName} (Broker)</SelectItem>
                                    )}
                                    {teamData?.teamMembers?.filter(m => m.role === 'admin' || m.role === 'super_admin' || m.role === 'staff' || m.role === 'processor').map(member => (
                                      <SelectItem key={member.id} value={String(member.id)}>
                                        {member.fullName || member.email} ({member.role === 'super_admin' ? 'Super Admin' : member.role.charAt(0).toUpperCase() + member.role.slice(1)})
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {showDocs && stageDocs.length > 0 && (
                        <div className={cn("mt-5", showTasks && stageTasks.length > 0 && "pt-5 border-t")}>
                          <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                            <h4 className="text-sm font-semibold flex items-center gap-2">
                              <FileText className="h-4 w-4 text-muted-foreground" />
                              Documents ({stageDocs.filter(d => d.status === 'approved' || d.status === 'ai_reviewed' || d.status === 'uploaded').length}/{stageDocs.length})
                            </h4>
                            {linkedProjectId && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={(e) => { e.stopPropagation(); triggerPipeline.mutate(); }}
                                disabled={pipelineRunning}
                                className="bg-success/10 text-success border-success/30 hover:bg-success/20"
                                data-testid={`button-ai-agents-stage-${stage.id}`}
                              >
                                {pipelineRunning ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Zap className="h-3.5 w-3.5 mr-1.5" />}
                                {pipelineRunning ? 'Processing...' : 'Auto Process'}
                              </Button>
                            )}
                          </div>
                          <div className="space-y-2">
                            {stageDocs.map((doc) => {
                              return (
                              <div key={doc.id} className="space-y-0">
                              <div
                                className={cn(
                                  "flex items-center justify-between gap-3 p-3 rounded-lg border",
                                  doc.status === 'approved' && "bg-success/10 border-success/30 opacity-80",
                                  doc.status === 'ai_reviewed' && "bg-violet-50 border-violet-200 dark:bg-violet-900/10 dark:border-violet-800",
                                  doc.status === 'rejected' && "bg-destructive/10 border-destructive/30"
                                )}
                                data-testid={`doc-row-${doc.id}`}
                              >
                                <div className="flex items-center gap-3 flex-1 min-w-0">
                                  <Checkbox
                                    checked={doc.status === 'approved'}
                                    onCheckedChange={(checked) => {
                                      updateDocumentStatus.mutate({
                                        docId: doc.id,
                                        status: checked ? 'approved' : 'pending'
                                      });
                                    }}
                                    data-testid={`checkbox-doc-${doc.id}`}
                                  />
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className={cn("text-sm font-medium", doc.status === 'approved' && "line-through text-muted-foreground")}>
                                        {doc.documentName}
                                      </span>
                                      {doc.isRequired && (
                                        <Badge variant="secondary" className="text-[10px] bg-warning/10 text-warning">Required</Badge>
                                      )}
                                    </div>
                                    {(doc.files?.length > 0) && (
                                      <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                                        <Paperclip className="h-3 w-3" />
                                        {doc.files.length} file{doc.files.length !== 1 ? 's' : ''} uploaded
                                      </div>
                                    )}
                                    {(!doc.files || doc.files.length === 0) && doc.fileName && doc.uploadedAt && (
                                      <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                                        <Paperclip className="h-3 w-3" />
                                        {doc.fileName} <span className="mx-1">-</span> {new Date(doc.uploadedAt).toLocaleDateString()}
                                      </div>
                                    )}
                                    {doc.status === 'rejected' && doc.reviewNotes && (
                                      <div className="text-xs text-destructive mt-0.5 flex items-start gap-1">
                                        <AlertCircle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                                        <span>{doc.reviewNotes}</span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-1.5 flex-shrink-0">
                                  {doc.status === 'approved' && (doc.filePath || doc.files?.length > 0) && (
                                    <CheckCircle2 className="h-5 w-5 text-success" data-testid={`doc-approved-check-${doc.id}`} />
                                  )}
                                  {getDocumentStatusBadge(doc.status)}
                                  {uploadingDocId === doc.id && (
                                    <div className="flex items-center gap-1">
                                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                                      <span className="text-xs text-muted-foreground">{uploadProgress}%</span>
                                    </div>
                                  )}
                                  {doc.filePath && (!doc.files || doc.files.length === 0) && (
                                    <>
                                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); handleViewDocument(doc.id, doc.fileName, doc.mimeType); }} data-testid={`button-view-doc-${doc.id}`} title="View">
                                        <Eye className="h-3.5 w-3.5" />
                                      </Button>
                                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); handleDownloadDocument(doc.id, doc.fileName); }} data-testid={`button-download-doc-${doc.id}`} title="Download">
                                        <Download className="h-3.5 w-3.5" />
                                      </Button>
                                    </>
                                  )}
                                  {doc.filePath && (
                                    <>
                                      {doc.googleDriveFileUrl ? (
                                        <Button size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); window.open(doc.googleDriveFileUrl!, '_blank'); }} data-testid={`button-drive-open-${doc.id}`} title="Open in Google Drive">
                                          <ExternalLink className="h-3.5 w-3.5 text-info" />
                                        </Button>
                                      ) : (
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          onClick={(e) => { e.stopPropagation(); pushToDriveMutation.mutate({ docId: doc.id }); }}
                                          disabled={pushingDocId === doc.id}
                                          data-testid={`button-push-drive-${doc.id}`}
                                          title="Push to Google Drive"
                                        >
                                          {pushingDocId === doc.id ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <CloudUpload className="h-3 w-3 mr-1" />}
                                          Drive
                                        </Button>
                                      )}
                                    </>
                                  )}
                                  <input type="file" id={`file-input-${doc.id}`} className="hidden" accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg" onChange={handleFileInputChange(doc.id)} data-testid={`input-file-${doc.id}`} multiple />
                                  {doc.status !== 'not_applicable' && (
                                    <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); document.getElementById(`file-input-${doc.id}`)?.click(); }} disabled={uploadingDocId === doc.id} data-testid={`button-upload-${doc.id}`}>
                                      <Upload className="h-3 w-3 mr-1" />{doc.files?.length > 0 ? 'Add' : 'Upload'}
                                    </Button>
                                  )}
                                  {doc.status === 'pending' && (
                                    <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); updateDocumentStatus.mutate({ docId: doc.id, status: 'not_applicable' }); }} disabled={updateDocumentStatus.isPending || uploadingDocId === doc.id} data-testid={`button-na-${doc.id}`}>N/A</Button>
                                  )}
                                  {(doc.status === 'uploaded' || doc.status === 'ai_reviewed') && (
                                    <>
                                      <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); updateDocumentStatus.mutate({ docId: doc.id, status: 'rejected' }); }} disabled={updateDocumentStatus.isPending} data-testid={`button-reject-${doc.id}`}>
                                        <XCircle className="h-3 w-3 mr-1" />Reject
                                      </Button>
                                      <Button size="sm" onClick={(e) => { e.stopPropagation(); updateDocumentStatus.mutate({ docId: doc.id, status: 'approved' }); }} disabled={updateDocumentStatus.isPending} data-testid={`button-approve-${doc.id}`}>
                                        <Check className="h-3 w-3 mr-1" />Approve & Push To Drive
                                      </Button>
                                    </>
                                  )}
                                  {(doc.status === 'rejected' || doc.status === 'not_applicable' || doc.status === 'approved') && (
                                    <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); updateDocumentStatus.mutate({ docId: doc.id, status: 'pending' }); }} disabled={updateDocumentStatus.isPending} data-testid={`button-reset-${doc.id}`}>Reset</Button>
                                  )}
                                </div>
                              </div>
                              {doc.files && doc.files.length > 0 && (
                                <div className="ml-10 space-y-1 mt-1">
                                  {doc.files.map((file: any) => (
                                    <div key={file.id} className="flex items-center gap-2 text-xs text-muted-foreground py-1 px-2 rounded bg-muted/30" data-testid={`file-row-${file.id}`}>
                                      <Paperclip className="h-3 w-3 flex-shrink-0" />
                                      <span className="truncate flex-1 min-w-0">{file.fileName || 'Unnamed file'}</span>
                                      {file.fileSize && <span className="flex-shrink-0">{(file.fileSize / 1024).toFixed(0)} KB</span>}
                                      {file.uploadedAt && <span className="flex-shrink-0">{new Date(file.uploadedAt).toLocaleDateString()}</span>}
                                      <Button size="icon" variant="ghost" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); handleViewFile(file.id, file.fileName, file.mimeType); }} data-testid={`button-view-file-${file.id}`} title="View">
                                        <Eye className="h-3 w-3" />
                                      </Button>
                                      <Button size="icon" variant="ghost" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); handleDownloadFile(file.id, file.fileName); }} data-testid={`button-download-file-${file.id}`} title="Download">
                                        <Download className="h-3 w-3" />
                                      </Button>
                                      <Button size="icon" variant="ghost" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); deleteFileMutation.mutate(file.id); }} data-testid={`button-delete-file-${file.id}`} title="Remove file">
                                        <Trash2 className="h-3 w-3" />
                                      </Button>
                                    </div>
                                  ))}
                                </div>
                              )}
                              </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {showTasks && stageTasks.length === 0 && showDocs && stageDocs.length === 0 && (
                        <div className="py-6 text-center text-sm text-muted-foreground">
                          No items in this stage yet.
                        </div>
                      )}

                      {linkedProjectId && dealId && (
                        <div className={cn("flex items-center gap-2 mt-4", (stageTasks.length > 0 || stageDocs.length > 0) && "pt-3 border-t")}>
                          {showTasks && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={(e) => { e.stopPropagation(); setAddTaskStageId(stage.id); }}
                              data-testid={`button-add-task-stage-${stage.id}`}
                            >
                              <Plus className="h-3.5 w-3.5 mr-1" />
                              Add Task
                            </Button>
                          )}
                          {showDocs && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={(e) => { e.stopPropagation(); setAddDocStageId(stage.id); }}
                              data-testid={`button-add-doc-stage-${stage.id}`}
                            >
                              <Plus className="h-3.5 w-3.5 mr-1" />
                              Add Document
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </Card>
              );
            })
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <Activity className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium">No stages configured</h3>
                <p className="text-muted-foreground">
                  Create a loan project from this deal to track stages and tasks.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Show unassigned documents that aren't linked to any stage */}
          {(subFilter === 'all' || subFilter === 'documents') && (() => {
            const unassigned = getUnassignedDocuments().filter(d => {
              const isDocCompleted = d.status === 'approved' || d.status === 'ai_reviewed' || d.status === 'uploaded';
              if (activeFilter === 'completed') return isDocCompleted;
              if (activeFilter === 'todo') return !isDocCompleted;
              return true;
            });
            return unassigned.length > 0;
          })() && (
            <Card className="mt-4" data-testid="card-unassigned-docs">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  General Documents ({(() => {
                    const filtered = getUnassignedDocuments().filter(d => {
                      const isDocCompleted = d.status === 'approved' || d.status === 'ai_reviewed' || d.status === 'uploaded';
                      if (activeFilter === 'completed') return isDocCompleted;
                      if (activeFilter === 'todo') return !isDocCompleted;
                      return true;
                    });
                    const completed = filtered.filter(d => d.status === 'approved' || d.status === 'ai_reviewed' || d.status === 'uploaded').length;
                    return `${completed}/${filtered.length}`;
                  })()})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {getUnassignedDocuments().filter(d => {
                    const isDocCompleted = d.status === 'approved' || d.status === 'ai_reviewed' || d.status === 'uploaded';
                    if (activeFilter === 'completed') return isDocCompleted;
                    if (activeFilter === 'todo') return !isDocCompleted;
                    return true;
                  }).map((doc) => (
                    <div
                      key={doc.id}
                      className={cn(
                        "flex items-center justify-between gap-3 p-3 rounded-lg border",
                        doc.status === 'approved' && "bg-success/10 border-success/30 opacity-80",
                        doc.status === 'ai_reviewed' && "bg-violet-50 border-violet-200 dark:bg-violet-900/10 dark:border-violet-800",
                        doc.status === 'rejected' && "bg-destructive/10 border-destructive/30"
                      )}
                      data-testid={`doc-row-${doc.id}`}
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <Checkbox
                          checked={doc.status === 'approved'}
                          onCheckedChange={(checked) => {
                            updateDocumentStatus.mutate({
                              docId: doc.id,
                              status: checked ? 'approved' : 'pending'
                            });
                          }}
                          data-testid={`checkbox-doc-${doc.id}`}
                        />
                        <div className="min-w-0 flex-1">
                          <p className={cn(
                            "text-sm font-medium truncate",
                            doc.status === 'approved' && "line-through text-muted-foreground"
                          )}>
                            {doc.documentName}
                          </p>
                          {doc.documentDescription && (
                            <p className="text-xs text-muted-foreground truncate">{doc.documentDescription}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {doc.status === 'approved' && (doc.filePath || doc.files?.length > 0) && (
                          <CheckCircle2 className="h-5 w-5 text-success" data-testid={`doc-approved-check-${doc.id}`} />
                        )}
                        {getDocumentStatusBadge(doc.status)}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {(activeFilter === 'completed' || activeFilter === 'todo') && projectStages.length > 0 && (() => {
            const hasVisibleStages = projectStages.some(stage => {
              const allTasks = stage.tasks || [];
              const allDocs = getStageDocuments(stage);
              const filteredTasks = allTasks.filter(t => activeFilter === 'completed' ? t.status === 'completed' : t.status !== 'completed');
              const filteredDocs = allDocs.filter(d => {
                const done = d.status === 'approved' || d.status === 'ai_reviewed' || d.status === 'uploaded';
                return activeFilter === 'completed' ? done : !done;
              });
              const visT = (subFilter === 'all' || subFilter === 'tasks') ? filteredTasks.length : 0;
              const visD = (subFilter === 'all' || subFilter === 'documents') ? filteredDocs.length : 0;
              return visT + visD > 0;
            });
            const hasUnassigned = (subFilter === 'all' || subFilter === 'documents') && getUnassignedDocuments().some(d => {
              const done = d.status === 'approved' || d.status === 'ai_reviewed' || d.status === 'uploaded';
              return activeFilter === 'completed' ? done : !done;
            });
            return !hasVisibleStages && !hasUnassigned;
          })() && (
            <Card>
              <CardContent className="py-12 text-center">
                {activeFilter === 'completed' ? (
                  <>
                    <CheckCircle2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <h3 className="text-lg font-medium">No completed items yet</h3>
                    <p className="text-muted-foreground">
                      Completed {subFilter === 'tasks' ? 'tasks' : subFilter === 'documents' ? 'documents' : 'items'} will appear here.
                    </p>
                  </>
                ) : (
                  <>
                    <Circle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <h3 className="text-lg font-medium">All caught up</h3>
                    <p className="text-muted-foreground">
                      No outstanding {subFilter === 'tasks' ? 'tasks' : subFilter === 'documents' ? 'documents' : 'items'} remaining.
                    </p>
                  </>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Digests view */}
      {activeFilter === 'digests' && (
        <div data-testid="digest-config-container">
          <DigestConfigPanel dealId={deal.id} />
          <LinkedEmailsSection dealId={deal.id} />
        </div>
      )}

      {/* AI Insights unified view */}
      {activeFilter === 'ai_insights' && linkedProjectId && (
        <AIInsightsPanel
          projectId={linkedProjectId}
          onPipelineComplete={() => {
            queryClient.invalidateQueries({ queryKey: ["/api/projects", linkedProjectId, "story"] });
            queryClient.invalidateQueries({ queryKey: ["/api/projects", linkedProjectId, "findings"] });
            queryClient.invalidateQueries({ queryKey: ["/api/projects", linkedProjectId, "agent-communications"] });
          }}
        />
      )}

      <Dialog open={syncDialogOpen} onOpenChange={setSyncDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sync Pipeline from Program</DialogTitle>
            <DialogDescription>
              This will replace all current stages, tasks, and documents with the selected program's workflow configuration. Any existing progress will be reset.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Loan Program</Label>
              <Select
                value={selectedProgramId || (deal?.programId ? String(deal.programId) : "")}
                onValueChange={setSelectedProgramId}
              >
                <SelectTrigger data-testid="select-sync-program">
                  <SelectValue placeholder="Select a program" />
                </SelectTrigger>
                <SelectContent>
                  {(loanProgramsData || []).map((prog: any) => (
                    <SelectItem key={prog.id} value={String(prog.id)}>
                      {prog.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {deal?.programName && !selectedProgramId && (
              <p className="text-sm text-muted-foreground">
                Currently linked to: <span className="font-medium">{deal.programName}</span>
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSyncDialogOpen(false)} data-testid="button-cancel-sync">
              Cancel
            </Button>
            <Button
              onClick={() => {
                const pid = selectedProgramId ? parseInt(selectedProgramId) : (deal?.programId || undefined);
                if (pid) {
                  rebuildPipelineMutation.mutate(pid);
                } else {
                  toast({ title: "Please select a program", variant: "destructive" });
                }
              }}
              disabled={rebuildPipelineMutation.isPending}
              data-testid="button-confirm-sync"
            >
              {rebuildPipelineMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Sync Pipeline
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={convertProgramDialogOpen} onOpenChange={(open) => {
        setConvertProgramDialogOpen(open);
        if (!open) setPendingProgramId(null);
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Loan Program</DialogTitle>
            <DialogDescription>
              Are you sure you want to convert this deal to a different loan program? All required documents and tasks will be changed to match the new program. However, documents already collected <span className="font-semibold text-foreground">will transfer over</span>.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {pendingProgramId && (
              <div className="rounded-lg border p-3 bg-muted/50">
                <div className="text-sm">
                  <span className="text-muted-foreground">Changing from: </span>
                  <span className="font-medium">{deal?.programName || 'None'}</span>
                </div>
                <div className="text-sm mt-1">
                  <span className="text-muted-foreground">Changing to: </span>
                  <span className="font-medium">
                    {(loanProgramsData || []).find((p: any) => String(p.id) === pendingProgramId)?.name || 'Unknown'}
                  </span>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setConvertProgramDialogOpen(false); setPendingProgramId(null); }} data-testid="button-cancel-convert">
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (pendingProgramId) {
                  convertProgramMutation.mutate(parseInt(pendingProgramId));
                }
              }}
              disabled={convertProgramMutation.isPending}
              data-testid="button-confirm-convert"
            >
              {convertProgramMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Yes, Change Program
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Loan Details</DialogTitle>
            <DialogDescription>
              Update the borrower and loan information for this deal.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="customerFirstName">First Name</Label>
                <Input
                  id="customerFirstName"
                  value={editForm.customerFirstName}
                  onChange={(e) => setEditForm({ ...editForm, customerFirstName: e.target.value })}
                  data-testid="input-customer-first-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="customerLastName">Last Name</Label>
                <Input
                  id="customerLastName"
                  value={editForm.customerLastName}
                  onChange={(e) => setEditForm({ ...editForm, customerLastName: e.target.value })}
                  data-testid="input-customer-last-name"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="customerEmail">Email</Label>
                <Input
                  id="customerEmail"
                  type="email"
                  value={editForm.customerEmail}
                  onChange={(e) => setEditForm({ ...editForm, customerEmail: e.target.value })}
                  placeholder="borrower@example.com"
                  data-testid="input-customer-email"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="customerPhone">Phone</Label>
                <Input
                  id="customerPhone"
                  type="tel"
                  value={editForm.customerPhone}
                  onChange={(e) => setEditForm({ ...editForm, customerPhone: e.target.value })}
                  placeholder="(555) 123-4567"
                  data-testid="input-customer-phone"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="propertyAddress">Property Address</Label>
              <AddressAutocomplete
                value={editForm.propertyAddress}
                onChange={(val) => setEditForm({ ...editForm, propertyAddress: val })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="loanAmount">Loan Amount</Label>
                <Input
                  id="loanAmount"
                  type="number"
                  value={editForm.loanAmount}
                  onChange={(e) => setEditForm({ ...editForm, loanAmount: e.target.value })}
                  data-testid="input-loan-amount"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="propertyValue">Property Value</Label>
                <Input
                  id="propertyValue"
                  type="number"
                  value={editForm.propertyValue}
                  onChange={(e) => setEditForm({ ...editForm, propertyValue: e.target.value })}
                  data-testid="input-property-value"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Loan Program</Label>
              <div className="flex items-center min-h-9 px-3 py-2 rounded-md border bg-muted/50 text-sm font-medium" data-testid="text-edit-program">
                {deal?.programName || 'No program assigned'}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="interestRate">Interest Rate</Label>
                <Input
                  id="interestRate"
                  value={editForm.interestRate}
                  onChange={(e) => setEditForm({ ...editForm, interestRate: e.target.value })}
                  placeholder="8.5%"
                  data-testid="input-interest-rate"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="loanType">Loan Type</Label>
                <Select
                  value={editForm.loanType}
                  onValueChange={(value) => setEditForm({ ...editForm, loanType: value })}
                >
                  <SelectTrigger data-testid="select-edit-loan-type">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dscr">DSCR</SelectItem>
                    <SelectItem value="fix-and-flip">Fix and Flip</SelectItem>
                    <SelectItem value="ground-up">Ground Up Construction</SelectItem>
                    <SelectItem value="bridge">Bridge</SelectItem>
                    <SelectItem value="commercial">Commercial</SelectItem>
                    <SelectItem value="conventional">Conventional</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="loanPurpose">Loan Purpose</Label>
                <Select
                  value={editForm.loanPurpose}
                  onValueChange={(value) => setEditForm({ ...editForm, loanPurpose: value })}
                >
                  <SelectTrigger data-testid="select-loan-purpose">
                    <SelectValue placeholder="Select purpose" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="purchase">Purchase</SelectItem>
                    <SelectItem value="refinance">Refinance</SelectItem>
                    <SelectItem value="cashout">Cash Out</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="propertyType">Property Type</Label>
              <Select
                value={editForm.propertyType}
                onValueChange={(value) => setEditForm({ ...editForm, propertyType: value })}
              >
                <SelectTrigger data-testid="select-property-type">
                  <SelectValue placeholder="Select property type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="single-family-residence">Single Family Residence</SelectItem>
                  <SelectItem value="2-4-unit">2-4 Unit</SelectItem>
                  <SelectItem value="multifamily-5-plus">Multifamily (5+ Units)</SelectItem>
                  <SelectItem value="rental-portfolio">Rental Portfolio</SelectItem>
                  <SelectItem value="mixed-use">Mixed-Use</SelectItem>
                  <SelectItem value="infill-lot">Infill Lot</SelectItem>
                  <SelectItem value="land">Land</SelectItem>
                  <SelectItem value="office">Office</SelectItem>
                  <SelectItem value="retail">Retail</SelectItem>
                  <SelectItem value="hospitality">Hospitality</SelectItem>
                  <SelectItem value="industrial">Industrial</SelectItem>
                  <SelectItem value="medical">Medical</SelectItem>
                  <SelectItem value="agricultural">Agricultural</SelectItem>
                  <SelectItem value="special-purpose">Special Purpose</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="loanTerm">Loan Term</Label>
              <Input
                id="loanTerm"
                value={editForm.loanTerm}
                onChange={(e) => setEditForm({ ...editForm, loanTerm: e.target.value })}
                placeholder="12 months"
                data-testid="input-loan-term"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)} data-testid="button-cancel-edit">
              Cancel
            </Button>
            <Button 
              onClick={() => updateDealMutation.mutate(editForm)}
              disabled={updateDealMutation.isPending}
              data-testid="button-save-edit"
            >
              {updateDealMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Target Close Date Dialog */}
      <Dialog open={editTargetCloseDateOpen} onOpenChange={setEditTargetCloseDateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Target Close Date</DialogTitle>
            <DialogDescription>
              Update the target close date for this deal.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="targetCloseDate">Target Close Date</Label>
              <Input
                id="targetCloseDate"
                type="date"
                value={targetCloseDateValue}
                onChange={(e) => setTargetCloseDateValue(e.target.value)}
                data-testid="input-target-close-date"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTargetCloseDateOpen(false)} data-testid="button-cancel-target-close-date">
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (targetCloseDateValue) {
                  updateTargetCloseDateMutation.mutate(targetCloseDateValue);
                }
              }}
              disabled={updateTargetCloseDateMutation.isPending || !targetCloseDateValue}
              data-testid="button-save-target-close-date"
            >
              {updateTargetCloseDateMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Task Dialog */}
      <Dialog open={taskDialogOpen} onOpenChange={setTaskDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add New Task</DialogTitle>
            <DialogDescription>
              Create a task and assign it to a team member.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="taskName">Task Name</Label>
              <Input
                id="taskName"
                value={taskForm.taskName}
                onChange={(e) => setTaskForm({ ...taskForm, taskName: e.target.value })}
                placeholder="e.g., Review appraisal report"
                data-testid="input-task-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="taskDescription">Description (optional)</Label>
              <Textarea
                id="taskDescription"
                value={taskForm.taskDescription}
                onChange={(e) => setTaskForm({ ...taskForm, taskDescription: e.target.value })}
                placeholder="Add details about this task..."
                data-testid="input-task-description"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="taskPriority">Priority</Label>
                <Select
                  value={taskForm.priority}
                  onValueChange={(value) => setTaskForm({ ...taskForm, priority: value })}
                >
                  <SelectTrigger data-testid="select-task-priority">
                    <SelectValue placeholder="Select priority" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="taskDueDate">Due Date (optional)</Label>
                <Input
                  id="taskDueDate"
                  type="date"
                  value={taskForm.dueDate}
                  onChange={(e) => setTaskForm({ ...taskForm, dueDate: e.target.value })}
                  data-testid="input-task-due-date"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="taskAssignee">Assign To</Label>
              <Select
                value={taskForm.assignedTo}
                onValueChange={(value) => setTaskForm({ ...taskForm, assignedTo: value })}
              >
                <SelectTrigger data-testid="select-task-assignee">
                  <SelectValue placeholder="Select team member" />
                </SelectTrigger>
                <SelectContent>
                  {teamData?.teamMembers?.map((member) => (
                    <SelectItem key={member.id} value={member.id.toString()}>
                      {member.fullName || member.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTaskDialogOpen(false)} data-testid="button-cancel-task">
              Cancel
            </Button>
            <Button
              onClick={() => createTaskMutation.mutate(taskForm)}
              disabled={!taskForm.taskName || createTaskMutation.isPending}
              data-testid="button-save-task"
            >
              {createTaskMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create Task"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Document Dialog */}
      <Dialog open={documentDialogOpen} onOpenChange={setDocumentDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Document Requirement</DialogTitle>
            <DialogDescription>
              Add a new document to the checklist for this deal.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="documentName">Document Name</Label>
              <Input
                id="documentName"
                value={documentForm.documentName}
                onChange={(e) => setDocumentForm({ ...documentForm, documentName: e.target.value })}
                placeholder="e.g., Property Insurance Declaration"
                data-testid="input-document-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="documentCategory">Category</Label>
              <Select
                value={documentForm.documentCategory}
                onValueChange={(value) => setDocumentForm({ ...documentForm, documentCategory: value })}
              >
                <SelectTrigger data-testid="select-document-category">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="borrower_docs">Borrower Documents</SelectItem>
                  <SelectItem value="entity_docs">Entity Documents</SelectItem>
                  <SelectItem value="property_docs">Property Documents</SelectItem>
                  <SelectItem value="financial_docs">Financial Documents</SelectItem>
                  <SelectItem value="closing_docs">Closing Documents</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="documentDescription">Description (optional)</Label>
              <Textarea
                id="documentDescription"
                value={documentForm.documentDescription}
                onChange={(e) => setDocumentForm({ ...documentForm, documentDescription: e.target.value })}
                placeholder="Additional details about this document..."
                data-testid="input-document-description"
              />
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="isRequired"
                checked={documentForm.isRequired}
                onCheckedChange={(checked) => setDocumentForm({ ...documentForm, isRequired: checked as boolean })}
                data-testid="checkbox-document-required"
              />
              <Label htmlFor="isRequired" className="font-normal">
                This document is required
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDocumentDialogOpen(false)} data-testid="button-cancel-document">
              Cancel
            </Button>
            <Button
              onClick={() => createDocumentMutation.mutate(documentForm)}
              disabled={!documentForm.documentName || createDocumentMutation.isPending}
              data-testid="button-save-document"
            >
              {createDocumentMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Adding...
                </>
              ) : (
                "Add Document"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Stage Task Dialog */}
      <Dialog open={addTaskStageId !== null} onOpenChange={(open) => { if (!open) { setAddTaskStageId(null); setNewTaskTitle(""); setNewTaskDescription(""); setNewTaskPriority("medium"); setNewTaskAssignedTo(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Task to Stage</DialogTitle>
            <DialogDescription>
              Add a one-off task to this stage.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="stage-task-title">Task Title</Label>
              <Input
                id="stage-task-title"
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                placeholder="e.g., Follow up with borrower"
                data-testid="input-stage-task-title"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="stage-task-description">Description (optional)</Label>
              <Textarea
                id="stage-task-description"
                value={newTaskDescription}
                onChange={(e) => setNewTaskDescription(e.target.value)}
                placeholder="Additional details..."
                data-testid="input-stage-task-description"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="stage-task-priority">Priority</Label>
              <Select value={newTaskPriority} onValueChange={setNewTaskPriority}>
                <SelectTrigger data-testid="select-stage-task-priority">
                  <SelectValue placeholder="Select priority" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="stage-task-assigned">Assign To</Label>
              <Select value={newTaskAssignedTo} onValueChange={setNewTaskAssignedTo}>
                <SelectTrigger data-testid="select-stage-task-assigned">
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  <SelectItem value="borrower">{borrowerName.trim() || 'Borrower'} (Borrower)</SelectItem>
                  {deal.userName && (
                    <SelectItem value="broker">{deal.userName} (Broker)</SelectItem>
                  )}
                  {teamData?.teamMembers?.filter((m: any) => m.role === 'admin' || m.role === 'super_admin' || m.role === 'staff' || m.role === 'processor').map((member: any) => (
                    <SelectItem key={member.id} value={String(member.id)}>
                      {member.fullName || member.email} ({member.role === 'super_admin' ? 'Super Admin' : member.role.charAt(0).toUpperCase() + member.role.slice(1)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAddTaskStageId(null); setNewTaskTitle(""); setNewTaskDescription(""); setNewTaskPriority("medium"); setNewTaskAssignedTo(""); }} data-testid="button-cancel-stage-task">
              Cancel
            </Button>
            <Button
              onClick={() => addTaskStageId && createStageTaskMutation.mutate({ stageId: addTaskStageId })}
              disabled={!newTaskTitle.trim() || createStageTaskMutation.isPending}
              data-testid="button-save-stage-task"
            >
              {createStageTaskMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Adding...
                </>
              ) : (
                "Add Task"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Stage Document Dialog */}
      <Dialog open={addDocStageId !== null} onOpenChange={(open) => { if (!open) { setAddDocStageId(null); setNewDocName(""); setNewDocCategory("other"); setNewDocRequired(true); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Document to Stage</DialogTitle>
            <DialogDescription>
              Add a document requirement to this stage.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="stage-doc-name">Document Name</Label>
              <Input
                id="stage-doc-name"
                value={newDocName}
                onChange={(e) => setNewDocName(e.target.value)}
                placeholder="e.g., Proof of Insurance"
                data-testid="input-stage-doc-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="stage-doc-category">Category</Label>
              <Select value={newDocCategory} onValueChange={setNewDocCategory}>
                <SelectTrigger data-testid="select-stage-doc-category">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="borrower_docs">Borrower Documents</SelectItem>
                  <SelectItem value="entity_docs">Entity Documents</SelectItem>
                  <SelectItem value="property_docs">Property Documents</SelectItem>
                  <SelectItem value="financial_docs">Financial Documents</SelectItem>
                  <SelectItem value="closing_docs">Closing Documents</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="stage-doc-required"
                checked={newDocRequired}
                onCheckedChange={(checked) => setNewDocRequired(checked as boolean)}
                data-testid="checkbox-stage-doc-required"
              />
              <Label htmlFor="stage-doc-required" className="font-normal">
                This document is required
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAddDocStageId(null); setNewDocName(""); setNewDocCategory("other"); setNewDocRequired(true); }} data-testid="button-cancel-stage-doc">
              Cancel
            </Button>
            <Button
              onClick={() => addDocStageId && createStageDocMutation.mutate({ stageId: addDocStageId })}
              disabled={!newDocName.trim() || createStageDocMutation.isPending}
              data-testid="button-save-stage-doc"
            >
              {createStageDocMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Adding...
                </>
              ) : (
                "Add Document"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={propertyDialogOpen} onOpenChange={(open) => { if (!open) { setPropertyDialogOpen(false); setEditingProperty(null); setPropertyForm({ address: "", city: "", state: "", zip: "", propertyType: "", estimatedValue: "", units: "", monthlyRent: "", annualTaxes: "", annualInsurance: "", isPrimary: false }); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingProperty ? "Edit Property" : "Add Property"}</DialogTitle>
            <DialogDescription>
              {editingProperty ? "Update property details." : "Add a new property to this deal."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="property-address">Address</Label>
              <AddressAutocomplete
                value={propertyForm.address}
                onChange={(val) => setPropertyForm(prev => ({ ...prev, address: val }))}
                placeholder="123 Main St"
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-2">
                <Label htmlFor="property-city">City</Label>
                <Input
                  id="property-city"
                  value={propertyForm.city}
                  onChange={(e) => setPropertyForm(prev => ({ ...prev, city: e.target.value }))}
                  placeholder="City"
                  data-testid="input-property-city"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="property-state">State</Label>
                <Input
                  id="property-state"
                  value={propertyForm.state}
                  onChange={(e) => setPropertyForm(prev => ({ ...prev, state: e.target.value }))}
                  placeholder="ST"
                  data-testid="input-property-state"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="property-zip">Zip</Label>
                <Input
                  id="property-zip"
                  value={propertyForm.zip}
                  onChange={(e) => setPropertyForm(prev => ({ ...prev, zip: e.target.value }))}
                  placeholder="12345"
                  data-testid="input-property-zip"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="property-type">Property Type</Label>
              <Select value={propertyForm.propertyType} onValueChange={(val) => setPropertyForm(prev => ({ ...prev, propertyType: val }))}>
                <SelectTrigger data-testid="select-property-type">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="single-family-residence">Single Family Residence</SelectItem>
                  <SelectItem value="2-4-unit">2-4 Unit</SelectItem>
                  <SelectItem value="multifamily-5-plus">Multifamily (5+ Units)</SelectItem>
                  <SelectItem value="rental-portfolio">Rental Portfolio</SelectItem>
                  <SelectItem value="mixed-use">Mixed-Use</SelectItem>
                  <SelectItem value="infill-lot">Infill Lot</SelectItem>
                  <SelectItem value="land">Land</SelectItem>
                  <SelectItem value="office">Office</SelectItem>
                  <SelectItem value="retail">Retail</SelectItem>
                  <SelectItem value="hospitality">Hospitality</SelectItem>
                  <SelectItem value="industrial">Industrial</SelectItem>
                  <SelectItem value="medical">Medical</SelectItem>
                  <SelectItem value="agricultural">Agricultural</SelectItem>
                  <SelectItem value="special-purpose">Special Purpose</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2">
                <Label htmlFor="property-estimated-value">Estimated Value</Label>
                <Input
                  id="property-estimated-value"
                  type="number"
                  value={propertyForm.estimatedValue}
                  onChange={(e) => setPropertyForm(prev => ({ ...prev, estimatedValue: e.target.value }))}
                  placeholder="0"
                  data-testid="input-property-estimated-value"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="property-units">Units</Label>
                <Input
                  id="property-units"
                  type="number"
                  value={propertyForm.units}
                  onChange={(e) => setPropertyForm(prev => ({ ...prev, units: e.target.value }))}
                  placeholder="1"
                  data-testid="input-property-units"
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-2">
                <Label htmlFor="property-monthly-rent">Monthly Rent</Label>
                <Input
                  id="property-monthly-rent"
                  type="number"
                  value={propertyForm.monthlyRent}
                  onChange={(e) => setPropertyForm(prev => ({ ...prev, monthlyRent: e.target.value }))}
                  placeholder="0"
                  data-testid="input-property-monthly-rent"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="property-annual-taxes">Annual Taxes</Label>
                <Input
                  id="property-annual-taxes"
                  type="number"
                  value={propertyForm.annualTaxes}
                  onChange={(e) => setPropertyForm(prev => ({ ...prev, annualTaxes: e.target.value }))}
                  placeholder="0"
                  data-testid="input-property-annual-taxes"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="property-annual-insurance">Annual Insurance</Label>
                <Input
                  id="property-annual-insurance"
                  type="number"
                  value={propertyForm.annualInsurance}
                  onChange={(e) => setPropertyForm(prev => ({ ...prev, annualInsurance: e.target.value }))}
                  placeholder="0"
                  data-testid="input-property-annual-insurance"
                />
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="property-is-primary"
                checked={propertyForm.isPrimary}
                onCheckedChange={(checked) => setPropertyForm(prev => ({ ...prev, isPrimary: checked as boolean }))}
                data-testid="checkbox-property-is-primary"
              />
              <Label htmlFor="property-is-primary" className="font-normal">
                Primary property
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setPropertyDialogOpen(false); setEditingProperty(null); setPropertyForm({ address: "", city: "", state: "", zip: "", propertyType: "", estimatedValue: "", units: "", monthlyRent: "", annualTaxes: "", annualInsurance: "", isPrimary: false }); }} data-testid="button-cancel-property">
              Cancel
            </Button>
            <Button
              onClick={() => {
                const payload = {
                  address: propertyForm.address,
                  city: propertyForm.city || undefined,
                  state: propertyForm.state || undefined,
                  zip: propertyForm.zip || undefined,
                  propertyType: propertyForm.propertyType || undefined,
                  estimatedValue: propertyForm.estimatedValue ? Number(propertyForm.estimatedValue) : null,
                  units: propertyForm.units ? Number(propertyForm.units) : null,
                  monthlyRent: propertyForm.monthlyRent ? Number(propertyForm.monthlyRent) : null,
                  annualTaxes: propertyForm.annualTaxes ? Number(propertyForm.annualTaxes) : null,
                  annualInsurance: propertyForm.annualInsurance ? Number(propertyForm.annualInsurance) : null,
                  isPrimary: propertyForm.isPrimary,
                };
                if (editingProperty) {
                  updatePropertyMutation.mutate({ propertyId: editingProperty.id, ...payload });
                } else {
                  addPropertyMutation.mutate(payload);
                }
              }}
              disabled={!propertyForm.address.trim() || addPropertyMutation.isPending || updatePropertyMutation.isPending}
              data-testid="button-save-property"
            >
              {(addPropertyMutation.isPending || updatePropertyMutation.isPending) ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={appEditDialogOpen} onOpenChange={setAppEditDialogOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Application Details</DialogTitle>
            <DialogDescription>Update the application data fields for this deal.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-4">
            {Object.entries(appEditForm).map(([key, value]) => {
              const FIELD_LABELS: Record<string, string> = {
                loanAmount: 'Loan Amount', propertyValue: 'Property Value', loanType: 'Loan Type',
                loanPurpose: 'Loan Purpose', propertyType: 'Property Type', interestOnly: 'Interest Only',
                ltv: 'LTV', dscr: 'Est. DSCR', ficoScore: 'Credit Score', creditScore: 'Credit Score',
                prepaymentPenalty: 'Prepayment Penalty', tpoPremium: 'TPO Premium', loanTerm: 'Loan Term',
                loanTermMonths: 'Loan Term (Months)', asIsValue: 'As-Is Value', arv: 'ARV',
                rehabBudget: 'Rehab Budget', exitStrategy: 'Exit Strategy', experience: 'Experience',
                constructionBudget: 'Construction Budget', entityType: 'Entity Type', entityName: 'Entity Name',
                occupancy: 'Occupancy', units: 'Units', annualTaxes: 'Annual Taxes',
                annualInsurance: 'Annual Insurance', monthlyRent: 'Monthly Rent', monthlyHOA: 'Monthly HOA',
                appraisalValue: 'Appraisal Value', cashOut: 'Cash Out Amount', citizenshipStatus: 'Citizenship',
                grossMonthlyRent: 'Gross Monthly Rent', calculatedDscr: 'Calculated DSCR',
                monthlyPITIA: 'Monthly PITIA', downPayment: 'Down Payment', reserveMonths: 'Reserve Months',
                squareFootage: 'Square Footage', yearBuilt: 'Year Built', occupancyStatus: 'Occupancy Status',
                borrowerExperience: 'Borrower Experience', numberOfUnits: 'Number of Units',
                estimatedPropertyValue: 'Estimated Property Value', purchasePrice: 'Purchase Price',
              };
              const label = FIELD_LABELS[key] || key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase()).trim();
              return (
                <div key={key} className="space-y-1">
                  <Label className="text-xs">{label}</Label>
                  <Input
                    value={value}
                    onChange={(e) => setAppEditForm(prev => ({ ...prev, [key]: e.target.value }))}
                    data-testid={`input-app-edit-${key}`}
                  />
                </div>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAppEditDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={() => updateAppDataMutation.mutate(appEditForm)}
              disabled={updateAppDataMutation.isPending}
              data-testid="button-save-app-details"
            >
              {updateAppDataMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</> : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-4xl w-[90vw] max-h-[90vh] flex flex-col p-0">
          <DialogHeader className="px-6 pt-6 pb-2">
            <DialogTitle className="flex items-center gap-2 text-sm font-medium truncate">
              <FileText className="h-4 w-4 flex-shrink-0" />
              <span className="truncate">{previewFile?.fileName || 'Document Preview'}</span>
            </DialogTitle>
            <DialogDescription className="sr-only">Preview uploaded document</DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-hidden px-6 pb-4 min-h-0">
            {previewLoading && (
              <div className="flex flex-col items-center justify-center h-[70vh] bg-muted/30 rounded border gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Loading preview...</p>
              </div>
            )}
            {previewError && (
              <div className="flex flex-col items-center justify-center h-[70vh] bg-muted/30 rounded border gap-4">
                <AlertCircle className="h-12 w-12 text-muted-foreground" />
                <div className="text-center space-y-1">
                  <p className="text-sm font-medium">Unable to Preview</p>
                  <p className="text-xs text-muted-foreground">{previewError}</p>
                </div>
              </div>
            )}
            {!previewLoading && !previewError && previewReady && previewFile && getPreviewType(previewFile.fileName, previewFile.mimeType) === 'pdf' && (
              <div className="flex flex-col items-center justify-center h-[70vh] bg-muted/30 rounded border gap-4">
                <FileCheck className="h-16 w-16 text-primary" />
                <div className="text-center space-y-1">
                  <p className="text-lg font-medium">{previewFile.fileName}</p>
                  <p className="text-xs text-muted-foreground">PDF files open in a new tab for the best viewing experience.</p>
                </div>
                <div className="flex gap-2">
                  <Button onClick={() => { window.open(previewFile.url, '_blank'); setPreviewOpen(false); }} data-testid="button-preview-open-pdf">
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Open PDF
                  </Button>
                  <Button variant="outline" onClick={() => { const link = document.createElement('a'); link.href = previewFile.downloadUrl; link.download = previewFile.fileName || 'document'; document.body.appendChild(link); link.click(); document.body.removeChild(link); }} data-testid="button-preview-download-pdf">
                    <Download className="h-4 w-4 mr-2" />
                    Download
                  </Button>
                </div>
              </div>
            )}
            {!previewLoading && !previewError && previewReady && previewFile && getPreviewType(previewFile.fileName, previewFile.mimeType) === 'image' && (
              <div className="flex items-center justify-center h-[70vh] bg-muted/30 rounded border">
                <img
                  src={previewFile.url}
                  alt={previewFile.fileName || 'Document'}
                  className="max-w-full max-h-full object-contain"
                  data-testid="preview-image"
                />
              </div>
            )}
            {!previewLoading && !previewError && previewReady && previewFile && getPreviewType(previewFile.fileName, previewFile.mimeType) === 'unsupported' && (
              <div className="flex flex-col items-center justify-center h-[70vh] bg-muted/30 rounded border gap-4">
                <FileText className="h-16 w-16 text-muted-foreground" />
                <div className="text-center space-y-1">
                  <p className="text-lg font-medium">{getFileExtensionLabel(previewFile.fileName)}</p>
                  <p className="text-sm text-muted-foreground">{previewFile.fileName}</p>
                  <p className="text-xs text-muted-foreground">This file type can't be previewed in the browser. Please download it to view.</p>
                </div>
                <Button onClick={() => { const link = document.createElement('a'); link.href = previewFile.downloadUrl; link.download = previewFile.fileName || 'document'; document.body.appendChild(link); link.click(); document.body.removeChild(link); }} data-testid="button-preview-download">
                  <Download className="h-4 w-4 mr-2" />
                  Download to View
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <div className={cn("flex-shrink-0 h-full transition-all duration-200", showMemoryPanel ? "w-[380px]" : "w-10")} data-testid="memory-sidebar">
        <DealMemoryPanel
          dealId={deal.id}
          projectId={linkedProjectId}
          collapsed={!showMemoryPanel}
          onToggle={() => setShowMemoryPanel(!showMemoryPanel)}
        />
      </div>
    </div>
  );
}
