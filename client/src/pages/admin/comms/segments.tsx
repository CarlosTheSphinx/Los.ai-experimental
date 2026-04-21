import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Pencil, Users, Beaker, X } from "lucide-react";

type Audience = "broker" | "borrower" | "lender_user";

interface SegmentFilter {
  type:
    | "has_loan_in_stage"
    | "has_loan_in_status"
    | "closing_within_days"
    | "stalled_days"
    | "created_within_days"
    | "has_phone"
    | "has_email_consent"
    | "has_sms_consent";
  values?: string[];
  value?: number | boolean;
}

interface FilterConfig {
  audience: Audience;
  filters: SegmentFilter[];
}

interface CommsSegment {
  id: number;
  name: string;
  filterConfig: FilterConfig | null;
  createdAt: string;
}

interface Recipient {
  id: number;
  fullName: string | null;
  email: string;
  role: string;
}

interface PreviewResult {
  count: number;
  sample: Recipient[];
}

const AUDIENCE_LABELS: Record<Audience, string> = {
  broker: "Brokers",
  borrower: "Borrowers",
  lender_user: "Internal team",
};

const FILTER_TYPE_OPTIONS: { value: SegmentFilter["type"]; label: string; valueKind: "values" | "number" | "boolean" }[] = [
  { value: "has_loan_in_stage", label: "Loan stage is one of", valueKind: "values" },
  { value: "has_loan_in_status", label: "Loan status is one of", valueKind: "values" },
  { value: "closing_within_days", label: "Closing within N days", valueKind: "number" },
  { value: "stalled_days", label: "Stalled for N days (no updates)", valueKind: "number" },
  { value: "created_within_days", label: "Account created within N days", valueKind: "number" },
  { value: "has_phone", label: "Has phone number on file", valueKind: "boolean" },
  { value: "has_email_consent", label: "Has email consent", valueKind: "boolean" },
  { value: "has_sms_consent", label: "Has SMS consent", valueKind: "boolean" },
];

const COMMON_STAGES = ["documentation", "underwriting", "approval", "closing", "funded", "lost"];
const COMMON_STATUSES = ["active", "on_hold", "completed", "cancelled", "funded"];

function FilterRow({
  filter,
  onChange,
  onRemove,
}: {
  filter: SegmentFilter;
  onChange: (f: SegmentFilter) => void;
  onRemove: () => void;
}) {
  const meta = FILTER_TYPE_OPTIONS.find(o => o.value === filter.type)!;
  const valuesText = (filter.values || []).join(", ");

  return (
    <div className="flex items-start gap-2 p-3 border rounded-md bg-muted/30">
      <div className="flex-1 space-y-2">
        <Select
          value={filter.type}
          onValueChange={v => {
            const newMeta = FILTER_TYPE_OPTIONS.find(o => o.value === v)!;
            onChange({
              type: v as SegmentFilter["type"],
              values: newMeta.valueKind === "values" ? [] : undefined,
              value: newMeta.valueKind === "number" ? 30 : newMeta.valueKind === "boolean" ? true : undefined,
            });
          }}
        >
          <SelectTrigger data-testid={`filter-type-${filter.type}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FILTER_TYPE_OPTIONS.map(o => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {meta.valueKind === "values" && (
          <div className="flex flex-wrap gap-1">
            {(filter.type === "has_loan_in_stage" ? COMMON_STAGES : COMMON_STATUSES).map(opt => {
              const checked = (filter.values || []).includes(opt);
              return (
                <Badge
                  key={opt}
                  variant={checked ? "default" : "outline"}
                  className="cursor-pointer"
                  onClick={() => {
                    const cur = filter.values || [];
                    onChange({
                      ...filter,
                      values: checked ? cur.filter(v => v !== opt) : [...cur, opt],
                    });
                  }}
                  data-testid={`filter-value-${filter.type}-${opt}`}
                >
                  {opt}
                </Badge>
              );
            })}
            <Input
              className="h-7 w-32 text-xs"
              placeholder="custom..."
              defaultValue={valuesText.startsWith("(") ? "" : ""}
              onBlur={e => {
                const extra = e.target.value.trim();
                if (!extra) return;
                onChange({ ...filter, values: [...(filter.values || []), extra] });
                e.currentTarget.value = "";
              }}
            />
          </div>
        )}
        {meta.valueKind === "number" && (
          <Input
            type="number"
            min={1}
            value={typeof filter.value === "number" ? filter.value : 30}
            onChange={e => onChange({ ...filter, value: parseInt(e.target.value) || 0 })}
            className="w-32"
            data-testid={`filter-number-${filter.type}`}
          />
        )}
        {meta.valueKind === "boolean" && (
          <p className="text-xs text-muted-foreground">Recipient must satisfy this condition.</p>
        )}
      </div>
      <Button variant="ghost" size="sm" onClick={onRemove} data-testid="button-remove-filter">
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}

function SegmentForm({
  initial,
  onSave,
  onCancel,
  isSaving,
}: {
  initial?: CommsSegment;
  onSave: (data: { name: string; filterConfig: FilterConfig }) => void;
  onCancel: () => void;
  isSaving: boolean;
}) {
  const [name, setName] = useState(initial?.name || "");
  const [audience, setAudience] = useState<Audience>(initial?.filterConfig?.audience || "broker");
  const [filters, setFilters] = useState<SegmentFilter[]>(initial?.filterConfig?.filters || []);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const { toast } = useToast();

  const runPreview = async () => {
    try {
      setPreviewing(true);
      const res = await apiRequest("POST", "/api/comms/segments/preview", {
        filterConfig: { audience, filters },
      });
      const data = await res.json();
      setPreview(data);
    } catch (err) {
      toast({ title: "Preview failed", description: err instanceof Error ? err.message : "", variant: "destructive" });
    } finally {
      setPreviewing(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="seg-name">Segment name</Label>
        <Input
          id="seg-name"
          data-testid="input-segment-name"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="e.g. Brokers with loans closing this week"
        />
      </div>
      <div className="space-y-2">
        <Label>Audience</Label>
        <Select value={audience} onValueChange={v => setAudience(v as Audience)}>
          <SelectTrigger data-testid="select-segment-audience">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="broker">Brokers</SelectItem>
            <SelectItem value="borrower">Borrowers</SelectItem>
            <SelectItem value="lender_user">Internal team</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Filters (all must match)</Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              setFilters([...filters, { type: "has_loan_in_status", values: ["active"] }])
            }
            data-testid="button-add-filter"
          >
            <Plus className="h-3 w-3 mr-1" />
            Add filter
          </Button>
        </div>
        {filters.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">
            No filters — segment will include every {AUDIENCE_LABELS[audience].toLowerCase()} in your tenant.
          </p>
        ) : (
          <div className="space-y-2">
            {filters.map((f, i) => (
              <FilterRow
                key={i}
                filter={f}
                onChange={nf => {
                  const next = [...filters];
                  next[i] = nf;
                  setFilters(next);
                }}
                onRemove={() => setFilters(filters.filter((_, idx) => idx !== i))}
              />
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between rounded-md border p-3 bg-background">
        <div className="text-sm">
          {preview ? (
            <span data-testid="text-preview-count">
              <strong>{preview.count}</strong> recipients match this segment
            </span>
          ) : (
            <span className="text-muted-foreground">Click Test to preview matching recipients.</span>
          )}
        </div>
        <Button type="button" variant="outline" size="sm" onClick={runPreview} disabled={previewing} data-testid="button-test-segment">
          <Beaker className="h-4 w-4 mr-1" />
          {previewing ? "Testing..." : "Test segment"}
        </Button>
      </div>

      {preview && preview.sample.length > 0 && (
        <div className="border rounded-md max-h-40 overflow-y-auto divide-y">
          {preview.sample.map(r => (
            <div key={r.id} className="px-3 py-2 text-sm flex justify-between" data-testid={`preview-recipient-${r.id}`}>
              <span>{r.fullName || r.email}</span>
              <span className="text-xs text-muted-foreground">{r.email}</span>
            </div>
          ))}
        </div>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel} data-testid="button-cancel-segment">
          Cancel
        </Button>
        <Button
          type="button"
          disabled={!name || isSaving}
          onClick={() => onSave({ name, filterConfig: { audience, filters } })}
          data-testid="button-save-segment"
        >
          {isSaving ? "Saving..." : "Save segment"}
        </Button>
      </DialogFooter>
    </div>
  );
}

export default function CommsSegmentsPage() {
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<CommsSegment | null>(null);
  const [deleting, setDeleting] = useState<CommsSegment | null>(null);

  const { data: segments = [], isLoading } = useQuery<CommsSegment[]>({
    queryKey: ["/api/comms/segments"],
  });

  const createMutation = useMutation({
    mutationFn: (data: { name: string; filterConfig: FilterConfig }) =>
      apiRequest("POST", "/api/comms/segments", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/comms/segments"] });
      setShowForm(false);
      toast({ title: "Segment created" });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: { name: string; filterConfig: FilterConfig } }) =>
      apiRequest("PUT", `/api/comms/segments/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/comms/segments"] });
      setEditing(null);
      toast({ title: "Segment updated" });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/comms/segments/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/comms/segments"] });
      setDeleting(null);
      toast({ title: "Segment removed" });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold" data-testid="text-segments-title">Audience Segments</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Reusable audience definitions for batch sends and (later) automation triggers.
          </p>
        </div>
        <Button onClick={() => setShowForm(true)} data-testid="button-new-segment">
          <Plus className="h-4 w-4 mr-2" />
          New segment
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading segments...</p>
      ) : segments.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Users className="h-10 w-10 mx-auto mb-3" />
            <p>No segments yet. Create your first audience definition.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {segments.map(s => (
            <Card key={s.id} data-testid={`card-segment-${s.id}`}>
              <CardContent className="pt-5 flex items-center justify-between">
                <div>
                  <p className="font-medium" data-testid={`text-segment-name-${s.id}`}>{s.name}</p>
                  <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                    <Badge variant="outline">{AUDIENCE_LABELS[s.filterConfig?.audience || "broker"]}</Badge>
                    <span>{s.filterConfig?.filters?.length || 0} filter(s)</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setEditing(s)} data-testid={`button-edit-segment-${s.id}`}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setDeleting(s)} data-testid={`button-delete-segment-${s.id}`}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>New segment</DialogTitle></DialogHeader>
          <SegmentForm
            onSave={data => createMutation.mutate(data)}
            onCancel={() => setShowForm(false)}
            isSaving={createMutation.isPending}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={v => !v && setEditing(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Edit segment</DialogTitle></DialogHeader>
          {editing && (
            <SegmentForm
              initial={editing}
              onSave={data => updateMutation.mutate({ id: editing.id, data })}
              onCancel={() => setEditing(null)}
              isSaving={updateMutation.isPending}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleting} onOpenChange={v => !v && setDeleting(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Remove segment</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Remove <strong>{deleting?.name}</strong>? Any future batch sends referencing it will fail.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => deleting && deleteMutation.mutate(deleting.id)}
              data-testid="button-confirm-delete-segment"
            >
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
