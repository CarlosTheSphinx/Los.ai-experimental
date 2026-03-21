import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Settings, GripVertical, Save, RotateCcw, Eye, EyeOff,
  CheckCircle2, AlertCircle, ChevronDown, ChevronRight,
} from "lucide-react";

interface FormField {
  id: number;
  fieldKey: string;
  fieldLabel: string;
  section: string;
  fieldType: string;
  isVisible: boolean;
  isRequired: boolean;
  sortOrder: number;
  options: any;
}

export default function CommercialFormConfigPage() {
  const { toast } = useToast();
  const [editedFields, setEditedFields] = useState<Record<number, Partial<FormField>>>({});
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    "Deal Basics": true,
    "Borrower Information": true,
    "Property Metrics": true,
  });

  const { data: fields = [], isLoading } = useQuery<FormField[]>({
    queryKey: ["/api/commercial/form-config"],
  });

  const saveMut = useMutation({
    mutationFn: async (updatedFields: Partial<FormField>[]) => {
      const res = await apiRequest("PUT", "/api/commercial/form-config", { fields: updatedFields });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/commercial/form-config"] });
      setEditedFields({});
      toast({ title: "Form configuration saved" });
    },
    onError: (err: any) => {
      toast({ title: "Error saving", description: err.message, variant: "destructive" });
    },
  });

  const getField = (field: FormField): FormField => {
    const edits = editedFields[field.id];
    return edits ? { ...field, ...edits } : field;
  };

  const updateField = (id: number, updates: Partial<FormField>) => {
    setEditedFields(prev => ({
      ...prev,
      [id]: { ...prev[id], id, ...updates },
    }));
  };

  const handleSave = () => {
    const changedFields = Object.values(editedFields).map(edits => {
      const original = fields.find(f => f.id === edits.id);
      return { ...original, ...edits };
    });
    if (changedFields.length === 0) return;
    saveMut.mutate(changedFields);
  };

  const handleReset = () => setEditedFields({});

  const hasChanges = Object.keys(editedFields).length > 0;

  const sections = fields.reduce((acc, field) => {
    const f = getField(field);
    if (!acc[f.section]) acc[f.section] = [];
    acc[f.section].push(f);
    return acc;
  }, {} as Record<string, FormField[]>);

  Object.values(sections).forEach(arr => arr.sort((a, b) => a.sortOrder - b.sortOrder));

  const totalFields = fields.length;
  const visibleCount = fields.map(getField).filter(f => f.isVisible).length;
  const requiredCount = fields.map(getField).filter(f => f.isRequired).length;

  return (
    <div className="p-6 space-y-6 max-w-4xl" data-testid="form-config-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white flex items-center gap-2" data-testid="page-title">
            <Settings size={20} className="text-blue-400" />
            Commercial Intake Form Builder
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Configure which fields brokers see when submitting commercial deals
          </p>
        </div>
        <div className="flex items-center gap-2">
          {hasChanges && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleReset}
              className="text-slate-400"
              data-testid="reset-button"
            >
              <RotateCcw size={14} className="mr-1" /> Reset
            </Button>
          )}
          <Button
            size="sm"
            onClick={handleSave}
            disabled={!hasChanges || saveMut.isPending}
            className="bg-blue-600 hover:bg-blue-700"
            data-testid="save-button"
          >
            <Save size={14} className="mr-1" />
            {saveMut.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Card className="bg-[#1a2038] border-slate-700/50">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
              <Settings size={16} className="text-blue-400" />
            </div>
            <div>
              <p className="text-lg font-semibold text-white" data-testid="total-fields">{totalFields}</p>
              <p className="text-xs text-slate-400">Total Fields</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-[#1a2038] border-slate-700/50">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center">
              <Eye size={16} className="text-emerald-400" />
            </div>
            <div>
              <p className="text-lg font-semibold text-white" data-testid="visible-fields">{visibleCount}</p>
              <p className="text-xs text-slate-400">Visible Fields</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-[#1a2038] border-slate-700/50">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center">
              <AlertCircle size={16} className="text-amber-400" />
            </div>
            <div>
              <p className="text-lg font-semibold text-white" data-testid="required-fields">{requiredCount}</p>
              <p className="text-xs text-slate-400">Required Fields</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin h-6 w-6 border-2 border-blue-500 border-t-transparent rounded-full" />
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(sections).map(([sectionName, sectionFields]) => {
            const isExpanded = expandedSections[sectionName] !== false;
            const sectionVisibleCount = sectionFields.filter(f => f.isVisible).length;

            return (
              <Card key={sectionName} className="bg-[#1a2038] border-slate-700/50">
                <CardHeader className="pb-2">
                  <button
                    onClick={() => setExpandedSections(prev => ({ ...prev, [sectionName]: !isExpanded }))}
                    className="flex items-center justify-between w-full text-left"
                    data-testid={`section-toggle-${sectionName.toLowerCase().replace(/\s/g, "-")}`}
                  >
                    <div className="flex items-center gap-2">
                      {isExpanded ? <ChevronDown size={16} className="text-slate-400" /> : <ChevronRight size={16} className="text-slate-400" />}
                      <CardTitle className="text-sm text-slate-300">{sectionName}</CardTitle>
                      <Badge className="text-[10px] bg-slate-700/50 text-slate-400">
                        {sectionVisibleCount}/{sectionFields.length} visible
                      </Badge>
                    </div>
                  </button>
                </CardHeader>
                {isExpanded && (
                  <CardContent className="space-y-2 pt-0">
                    <div className="grid grid-cols-[auto_1fr_80px_80px_60px] gap-x-3 gap-y-0 items-center px-2 text-[10px] text-slate-500 uppercase tracking-wider font-medium pb-1 border-b border-slate-700/30">
                      <span></span>
                      <span>Label</span>
                      <span className="text-center">Visible</span>
                      <span className="text-center">Required</span>
                      <span className="text-center">Type</span>
                    </div>
                    {sectionFields.map(field => {
                      const f = getField(field);
                      const hasEdits = !!editedFields[field.id];
                      return (
                        <div
                          key={field.id}
                          className={`grid grid-cols-[auto_1fr_80px_80px_60px] gap-x-3 items-center px-2 py-2 rounded ${
                            hasEdits ? "bg-blue-500/10 border border-blue-500/20" : "bg-[#0f1629] border border-slate-700/30"
                          } ${!f.isVisible ? "opacity-50" : ""}`}
                          data-testid={`field-row-${field.fieldKey}`}
                        >
                          <GripVertical size={14} className="text-slate-600 cursor-grab" />
                          <div className="flex items-center gap-2">
                            <Input
                              value={f.fieldLabel}
                              onChange={e => updateField(field.id, { fieldLabel: e.target.value })}
                              className="bg-transparent border-none text-sm text-white p-0 h-auto focus-visible:ring-0"
                              data-testid={`field-label-${field.fieldKey}`}
                            />
                            <span className="text-[10px] text-slate-600 font-mono">{field.fieldKey}</span>
                          </div>
                          <div className="flex justify-center">
                            <Switch
                              checked={f.isVisible}
                              onCheckedChange={v => updateField(field.id, { isVisible: v })}
                              data-testid={`field-visible-${field.fieldKey}`}
                            />
                          </div>
                          <div className="flex justify-center">
                            <Switch
                              checked={f.isRequired}
                              onCheckedChange={v => updateField(field.id, { isRequired: v })}
                              disabled={!f.isVisible}
                              data-testid={`field-required-${field.fieldKey}`}
                            />
                          </div>
                          <div className="flex justify-center">
                            <Badge className="text-[9px] bg-slate-700/50 text-slate-400">{f.fieldType}</Badge>
                          </div>
                        </div>
                      );
                    })}
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {hasChanges && (
        <div className="sticky bottom-4 flex justify-end">
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saveMut.isPending}
            className="bg-blue-600 hover:bg-blue-700 shadow-lg"
            data-testid="save-button-sticky"
          >
            <CheckCircle2 size={14} className="mr-1" />
            {saveMut.isPending ? "Saving..." : `Save ${Object.keys(editedFields).length} Change${Object.keys(editedFields).length > 1 ? "s" : ""}`}
          </Button>
        </div>
      )}
    </div>
  );
}
