import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { CheckCircle2, Plus, CalendarIcon, ClipboardEdit } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { EmptyState } from "@/components/ui/phase1/empty-state";
import { CollapsibleSection } from "@/components/ui/phase1/collapsible-section";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { format } from "date-fns";

function getPriorityColor(priority: string): string {
  switch (priority?.toLowerCase()) {
    case "high":
    case "urgent":
      return "text-red-600 bg-red-50";
    case "medium":
      return "text-amber-600 bg-amber-50";
    default:
      return "text-muted-foreground bg-muted";
  }
}

export default function TabTasks({
  deal,
  tasks,
  dealId,
}: {
  deal: any;
  tasks: any[];
  dealId: string;
}) {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [taskName, setTaskName] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("medium");
  const [assignedTo, setAssignedTo] = useState("");
  const [dueDate, setDueDate] = useState<Date | undefined>(undefined);
  const [formTemplateId, setFormTemplateId] = useState<string>("");

  const { data: teamData } = useQuery<{ teamMembers: { id: number; fullName: string; email: string; role: string }[] }>({
    queryKey: ["/api/admin/team-members"],
  });
  const teamMembers = teamData?.teamMembers ?? [];

  const { data: formTemplatesData } = useQuery<any[]>({
    queryKey: ["/api/admin/inquiry-form-templates"],
  });
  const formTemplates = Array.isArray(formTemplatesData) ? formTemplatesData : [];

  const updateTaskMutation = useMutation({
    mutationFn: async ({ taskId, status }: { taskId: number; status: string }) => {
      return apiRequest("PATCH", `/api/admin/deals/${dealId}/tasks/${taskId}`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/deals/${dealId}/tasks`] });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/deals`, dealId, "tasks"] });
      queryClient.invalidateQueries({ queryKey: [`/api/deals/${dealId}`] });
      toast({ title: "Task updated" });
    },
  });

  const createTaskMutation = useMutation({
    mutationFn: async (data: { taskName: string; taskDescription?: string; priority: string; assignedTo?: string; dueDate?: string; formTemplateId?: number }) => {
      return apiRequest("POST", `/api/admin/deals/${dealId}/tasks`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/deals/${dealId}/tasks`] });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/deals`, dealId, "tasks"] });
      queryClient.invalidateQueries({ queryKey: [`/api/deals/${dealId}`] });
      toast({ title: "Task created" });
      resetForm();
      setDialogOpen(false);
    },
    onError: () => {
      toast({ title: "Failed to create task", variant: "destructive" });
    },
  });

  function resetForm() {
    setTaskName("");
    setDescription("");
    setPriority("medium");
    setAssignedTo("");
    setDueDate(undefined);
    setFormTemplateId("");
  }

  function handleSubmit() {
    if (!taskName.trim()) return;
    createTaskMutation.mutate({
      taskName: taskName.trim(),
      taskDescription: description.trim() || undefined,
      priority,
      assignedTo: assignedTo || undefined,
      dueDate: dueDate ? dueDate.toISOString() : undefined,
      formTemplateId: formTemplateId && formTemplateId !== "none" ? parseInt(formTemplateId) : undefined,
    });
  }

  const todo = tasks.filter((t) => t.status === "pending" || t.status === "to_do");
  const inProgress = tasks.filter((t) => t.status === "in_progress");
  const done = tasks.filter((t) => t.status === "completed" || t.status === "done");

  const getAssigneeName = (task: any) => {
    if (task._assignedToBorrower || task.assignedTo === "borrower") {
      return deal?.customerFirstName && deal?.customerLastName
        ? `${deal.customerFirstName} ${deal.customerLastName} (Borrower)`
        : deal?.customerEmail ? `${deal.customerEmail} (Borrower)` : "Borrower";
    }
    if (task.assigneeName) return task.assigneeName;
    if (task.assignedTo) {
      const assignedId = typeof task.assignedTo === "string" ? parseInt(task.assignedTo) : task.assignedTo;
      const member = teamMembers.find((m) => m.id === assignedId);
      if (member) return member.fullName || member.email;
      return `User #${task.assignedTo}`;
    }
    return null;
  };

  const renderTask = (task: any) => {
    const assignee = getAssigneeName(task);
    return (
      <div
        key={task.id}
        className="flex items-center gap-3 py-2 px-3 rounded-md hover:bg-muted/50"
        data-testid={`task-item-${task.id}`}
      >
        <Checkbox
          checked={task.status === "completed" || task.status === "done"}
          onCheckedChange={(checked) => {
            updateTaskMutation.mutate({
              taskId: task.id,
              status: checked ? "completed" : "pending",
            });
          }}
          data-testid={`checkbox-task-${task.id}`}
        />
        <div className="flex-1 min-w-0">
          <p className={`text-[16px] font-medium ${task.status === "completed" || task.status === "done" ? "line-through text-muted-foreground" : ""}`}>
            {task.taskTitle || task.taskName || task.title}
          </p>
          {assignee && (
            <p className="text-[13px] text-muted-foreground">Assigned to: {assignee}</p>
          )}
          {task.dueDate && !isNaN(new Date(task.dueDate).getTime()) && (
            <p className="text-[13px] text-muted-foreground">Due: {format(new Date(task.dueDate), "MMM d, yyyy")}</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {task.priority && (
            <Badge variant="secondary" className={`text-[12px] ${getPriorityColor(task.priority)}`}>
              {task.priority}
            </Badge>
          )}
          {task.borrowerActionRequired && (
            <Badge variant="outline" className="text-[12px] text-blue-600 border-blue-200">
              Borrower
            </Badge>
          )}
          {task.formTemplateId && (
            <Badge variant="secondary" className="text-[12px]">
              <ClipboardEdit className="h-3 w-3 mr-1" />
              Form
            </Badge>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-muted-foreground">Tasks ({tasks.length})</h3>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setDialogOpen(true)}
          data-testid="button-add-task"
        >
          <Plus className="h-4 w-4 mr-1" />
          Add Task
        </Button>
      </div>

      {tasks.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title="No tasks"
          description="Tasks will appear here once the deal workflow is configured."
        />
      ) : (
        <>
          {todo.length > 0 && (
            <CollapsibleSection title="To Do" badge={String(todo.length)} defaultOpen={true}>
              <div className="space-y-0.5">{todo.map(renderTask)}</div>
            </CollapsibleSection>
          )}
          {inProgress.length > 0 && (
            <CollapsibleSection title="In Progress" badge={String(inProgress.length)} defaultOpen={true}>
              <div className="space-y-0.5">{inProgress.map(renderTask)}</div>
            </CollapsibleSection>
          )}
          {done.length > 0 && (
            <CollapsibleSection title="Completed" badge={String(done.length)} defaultOpen={false}>
              <div className="space-y-0.5">{done.map(renderTask)}</div>
            </CollapsibleSection>
          )}
        </>
      )}

      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
        <DialogContent className="sm:max-w-[480px]" data-testid="dialog-add-task">
          <DialogHeader>
            <DialogTitle>Add Task</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="task-name">Task Name *</Label>
              <Input
                id="task-name"
                placeholder="Enter task name"
                value={taskName}
                onChange={(e) => setTaskName(e.target.value)}
                data-testid="input-task-name"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="task-description">Description</Label>
              <Textarea
                id="task-description"
                placeholder="Optional description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="resize-none"
                rows={3}
                data-testid="input-task-description"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Priority</Label>
                <Select value={priority} onValueChange={setPriority}>
                  <SelectTrigger data-testid="select-task-priority">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Assigned To</Label>
                <Select value={assignedTo} onValueChange={setAssignedTo}>
                  <SelectTrigger data-testid="select-task-assignee">
                    <SelectValue placeholder="Select member" />
                  </SelectTrigger>
                  <SelectContent>
                    {deal?.customerEmail && (
                      <SelectItem value="borrower">
                        {deal.customerFirstName && deal.customerLastName
                          ? `${deal.customerFirstName} ${deal.customerLastName} (Borrower)`
                          : `${deal.customerEmail} (Borrower)`}
                      </SelectItem>
                    )}
                    {teamMembers.map((member) => (
                      <SelectItem key={member.id} value={String(member.id)}>
                        {member.fullName || member.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Due Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={`w-full justify-start text-left font-normal ${!dueDate ? "text-muted-foreground" : ""}`}
                    data-testid="button-task-due-date"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dueDate ? format(dueDate, "PPP") : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dueDate}
                    onSelect={setDueDate}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
            {formTemplates.length > 0 && (
              <div className="space-y-1.5">
                <Label>Form Template</Label>
                <Select value={formTemplateId} onValueChange={setFormTemplateId}>
                  <SelectTrigger data-testid="select-task-form-template">
                    <SelectValue placeholder="No form attached" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No form attached</SelectItem>
                    {formTemplates.map((tpl: any) => (
                      <SelectItem key={tpl.id} value={String(tpl.id)}>
                        <span className="flex items-center gap-2">
                          <ClipboardEdit className="h-3 w-3" />
                          {tpl.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Attach a form for the borrower to fill out in their portal.</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }} data-testid="button-cancel-task">
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!taskName.trim() || createTaskMutation.isPending}
              data-testid="button-submit-task"
            >
              {createTaskMutation.isPending ? "Creating..." : "Create Task"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
