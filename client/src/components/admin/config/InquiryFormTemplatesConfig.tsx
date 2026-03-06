import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
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
  FileText, Plus, Trash2, GripVertical, Pencil, Copy, Users, Database, Settings2,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { InquiryFormTemplate } from "@shared/schema";

interface FieldDefinition {
  fieldKey: string;
  label: string;
  fieldType: "text" | "email" | "phone" | "select" | "textarea";
  required: boolean;
  placeholder?: string;
  options?: string[];
}

const FIELD_TYPE_OPTIONS = [
  { value: "text", label: "Text" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "select", label: "Dropdown" },
  { value: "textarea", label: "Text Area" },
];

const TARGET_TYPE_OPTIONS = [
  { value: "third_party", label: "Third Party Contact" },
  { value: "deal_field", label: "Deal Field" },
  { value: "custom", label: "Custom" },
];

const TARGET_ROLE_SUGGESTIONS = [
  "Title Contact",
  "Insurance Agent",
  "Attorney",
  "Appraiser",
  "Inspector",
  "Surveyor",
  "Accountant",
  "Contractor",
];

function emptyField(): FieldDefinition {
  return {
    fieldKey: "",
    label: "",
    fieldType: "text",
    required: false,
    placeholder: "",
  };
}

function TemplateFormDialog({
  open,
  onOpenChange,
  template,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template?: InquiryFormTemplate | null;
}) {
  const { toast } = useToast();
  const isEditing = !!template;

  const [name, setName] = useState(template?.name || "");
  const [description, setDescription] = useState(template?.description || "");
  const [targetType, setTargetType] = useState(template?.targetType || "third_party");
  const [targetRole, setTargetRole] = useState(template?.targetRole || "");
  const [fields, setFields] = useState<FieldDefinition[]>(
    (template?.fields as FieldDefinition[]) || [emptyField()]
  );

  const createMutation = useMutation({
    mutationFn: async (body: any) => {
      if (isEditing) {
        return await apiRequest("PUT", `/api/admin/inquiry-form-templates/${template!.id}`, body);
      }
      return await apiRequest("POST", "/api/admin/inquiry-form-templates", body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/inquiry-form-templates"] });
      toast({ title: isEditing ? "Template updated" : "Template created" });
      onOpenChange(false);
    },
    onError: () => {
      toast({ title: "Failed to save template", variant: "destructive" });
    },
  });

  const addField = () => setFields([...fields, emptyField()]);

  const removeField = (index: number) => {
    if (fields.length <= 1) return;
    setFields(fields.filter((_, i) => i !== index));
  };

  const updateField = (index: number, updates: Partial<FieldDefinition>) => {
    setFields(fields.map((f, i) => {
      if (i !== index) return f;
      const updated = { ...f, ...updates };
      if (updates.label && !f.fieldKey) {
        updated.fieldKey = updates.label.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
      }
      return updated;
    }));
  };

  const moveField = (index: number, direction: "up" | "down") => {
    const newIndex = direction === "up" ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= fields.length) return;
    const newFields = [...fields];
    [newFields[index], newFields[newIndex]] = [newFields[newIndex], newFields[index]];
    setFields(newFields);
  };

  const handleSubmit = () => {
    if (!name.trim()) {
      toast({ title: "Template name is required", variant: "destructive" });
      return;
    }
    const validFields = fields.filter(f => f.label.trim());
    if (validFields.length === 0) {
      toast({ title: "At least one field with a label is required", variant: "destructive" });
      return;
    }
    const finalFields = validFields.map(f => ({
      ...f,
      fieldKey: f.fieldKey || f.label.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, ""),
    }));

    createMutation.mutate({
      name: name.trim(),
      description: description.trim() || null,
      targetType,
      targetRole: targetType === "third_party" ? targetRole || null : null,
      fields: finalFields,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle data-testid="text-template-dialog-title">
            {isEditing ? "Edit Form Template" : "Create Form Template"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update the form template fields and settings."
              : "Build a reusable inquiry form that can be attached to tasks."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="template-name">Template Name</Label>
            <Input
              id="template-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Title Contact Info"
              data-testid="input-template-name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="template-description">Description</Label>
            <Textarea
              id="template-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What information does this form collect?"
              data-testid="input-template-description"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Target Type</Label>
              <Select value={targetType} onValueChange={setTargetType}>
                <SelectTrigger data-testid="select-target-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TARGET_TYPE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {targetType === "third_party" && (
              <div className="space-y-2">
                <Label>Target Role</Label>
                <Select value={targetRole} onValueChange={setTargetRole}>
                  <SelectTrigger data-testid="select-target-role">
                    <SelectValue placeholder="Select role..." />
                  </SelectTrigger>
                  <SelectContent>
                    {TARGET_ROLE_SUGGESTIONS.map((role) => (
                      <SelectItem key={role} value={role}>
                        {role}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-base font-medium">Form Fields</Label>
              <Button variant="outline" size="sm" onClick={addField} data-testid="button-add-field">
                <Plus className="h-4 w-4 mr-1" />
                Add Field
              </Button>
            </div>

            {fields.map((field, index) => (
              <div
                key={index}
                className="border rounded-md p-3 space-y-3"
                data-testid={`field-row-${index}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-muted-foreground">
                    Field {index + 1}
                  </span>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => moveField(index, "up")}
                      disabled={index === 0}
                      data-testid={`button-move-field-up-${index}`}
                    >
                      <GripVertical className="h-4 w-4 rotate-90" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeField(index)}
                      disabled={fields.length <= 1}
                      data-testid={`button-remove-field-${index}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Label</Label>
                    <Input
                      value={field.label}
                      onChange={(e) => updateField(index, { label: e.target.value })}
                      placeholder="Field label"
                      data-testid={`input-field-label-${index}`}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Type</Label>
                    <Select
                      value={field.fieldType}
                      onValueChange={(val) => updateField(index, { fieldType: val as FieldDefinition["fieldType"] })}
                    >
                      <SelectTrigger data-testid={`select-field-type-${index}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FIELD_TYPE_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Placeholder</Label>
                    <Input
                      value={field.placeholder || ""}
                      onChange={(e) => updateField(index, { placeholder: e.target.value })}
                      placeholder="Placeholder text"
                      data-testid={`input-field-placeholder-${index}`}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Key</Label>
                    <Input
                      value={field.fieldKey}
                      onChange={(e) => updateField(index, { fieldKey: e.target.value })}
                      placeholder="Auto-generated"
                      data-testid={`input-field-key-${index}`}
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Switch
                    checked={field.required}
                    onCheckedChange={(checked) => updateField(index, { required: checked })}
                    data-testid={`switch-field-required-${index}`}
                  />
                  <Label className="text-xs">Required</Label>
                </div>

                {field.fieldType === "select" && (
                  <div className="space-y-1">
                    <Label className="text-xs">Options (comma-separated)</Label>
                    <Input
                      value={(field.options || []).join(", ")}
                      onChange={(e) => updateField(index, {
                        options: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                      })}
                      placeholder="Option 1, Option 2, Option 3"
                      data-testid={`input-field-options-${index}`}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-template">
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={createMutation.isPending} data-testid="button-save-template">
            {createMutation.isPending ? "Saving..." : isEditing ? "Update Template" : "Create Template"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function targetTypeIcon(type: string) {
  switch (type) {
    case "third_party": return <Users className="h-4 w-4" />;
    case "deal_field": return <Database className="h-4 w-4" />;
    default: return <Settings2 className="h-4 w-4" />;
  }
}

export default function InquiryFormTemplatesConfig() {
  const { toast } = useToast();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<InquiryFormTemplate | null>(null);

  const { data, isLoading } = useQuery<{ templates: InquiryFormTemplate[] }>({
    queryKey: ["/api/admin/inquiry-form-templates"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest("DELETE", `/api/admin/inquiry-form-templates/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/inquiry-form-templates"] });
      toast({ title: "Template deleted" });
    },
    onError: (error: any) => {
      const message = error?.message || "Failed to delete template";
      toast({ title: message, variant: "destructive" });
    },
  });

  const handleDelete = (template: InquiryFormTemplate) => {
    if (template.isSystem) {
      toast({ title: "System templates cannot be deleted", variant: "destructive" });
      return;
    }
    if (window.confirm(`Delete "${template.name}"? This cannot be undone.`)) {
      deleteMutation.mutate(template.id);
    }
  };

  const templates = data?.templates || [];

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Inquiry Form Templates
              </CardTitle>
              <CardDescription>
                Create reusable forms that can be attached to tasks. When a borrower completes a form, the data auto-populates deal contacts.
              </CardDescription>
            </div>
            <Button onClick={() => setShowCreateDialog(true)} data-testid="button-create-template">
              <Plus className="h-4 w-4 mr-2" />
              Create Template
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : templates.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground" data-testid="text-no-templates">
              <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p>No form templates yet. Create one to get started.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {templates.map((template) => {
                const fieldCount = Array.isArray(template.fields) ? template.fields.length : 0;
                return (
                  <div
                    key={template.id}
                    className="flex items-center justify-between gap-4 p-3 border rounded-md"
                    data-testid={`template-row-${template.id}`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="p-2 rounded-md bg-muted">
                        {targetTypeIcon(template.targetType)}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm" data-testid={`text-template-name-${template.id}`}>
                            {template.name}
                          </span>
                          {template.isSystem && (
                            <Badge variant="secondary" className="text-xs">System</Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5 flex-wrap">
                          <span>{fieldCount} field{fieldCount !== 1 ? "s" : ""}</span>
                          <span>
                            {TARGET_TYPE_OPTIONS.find((o) => o.value === template.targetType)?.label || template.targetType}
                          </span>
                          {template.targetRole && (
                            <span>{template.targetRole}</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setEditingTemplate(template)}
                        data-testid={`button-edit-template-${template.id}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(template)}
                        disabled={template.isSystem || deleteMutation.isPending}
                        data-testid={`button-delete-template-${template.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {showCreateDialog && (
        <TemplateFormDialog
          open={showCreateDialog}
          onOpenChange={setShowCreateDialog}
        />
      )}

      {editingTemplate && (
        <TemplateFormDialog
          open={!!editingTemplate}
          onOpenChange={(open) => { if (!open) setEditingTemplate(null); }}
          template={editingTemplate}
        />
      )}
    </>
  );
}
