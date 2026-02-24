import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format, isToday, isTomorrow, isPast, isThisWeek, addDays, startOfDay } from "date-fns";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  CheckSquare,
  Calendar,
  Clock,
  AlertCircle,
  Plus,
  ChevronDown,
  ChevronRight,
  User,
  CalendarDays,
  Filter,
  ListChecks,
} from "lucide-react";

interface Task {
  id: number;
  taskTitle: string;
  taskName?: string;
  description?: string;
  status: string;
  priority: string;
  assignedTo?: string | null;
  dueDate?: string | null;
  stageId?: number | null;
  stageName?: string;
  borrowerActionRequired?: boolean;
  completedAt?: string | null;
  completedBy?: string | null;
  createdAt?: string;
}

interface Stage {
  id: number;
  stageName: string;
  tasks?: Task[];
}

interface TeamMember {
  id: number;
  fullName?: string;
  email: string;
  role: string;
}

interface TasksSidebarProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dealId: number;
  projectId: number | null;
  stages: Stage[];
  teamMembers?: TeamMember[];
  borrowerName?: string;
  brokerName?: string;
}

type FilterView = "all" | "today" | "overdue" | "upcoming" | "completed";

function getPriorityColor(priority: string) {
  switch (priority) {
    case "urgent": return "bg-red-100 text-red-700 border-red-200";
    case "high": return "bg-orange-100 text-orange-700 border-orange-200";
    case "medium": return "bg-yellow-100 text-yellow-700 border-yellow-200";
    case "low": return "bg-gray-100 text-gray-600 border-gray-200";
    default: return "bg-gray-100 text-gray-600 border-gray-200";
  }
}

function getDueDateLabel(dueDate: string | null | undefined): { label: string; className: string } | null {
  if (!dueDate) return null;
  const date = new Date(dueDate);
  if (isToday(date)) return { label: "Today", className: "text-blue-600" };
  if (isTomorrow(date)) return { label: "Tomorrow", className: "text-blue-500" };
  if (isPast(startOfDay(date))) return { label: `Overdue · ${format(date, "MMM d")}`, className: "text-red-600 font-medium" };
  if (isThisWeek(date, { weekStartsOn: 1 })) return { label: format(date, "EEEE"), className: "text-muted-foreground" };
  return { label: format(date, "MMM d"), className: "text-muted-foreground" };
}

export function TasksSidebar({
  open,
  onOpenChange,
  dealId,
  projectId,
  stages,
  teamMembers = [],
  borrowerName,
  brokerName,
}: TasksSidebarProps) {
  const { toast } = useToast();
  const [filterView, setFilterView] = useState<FilterView>("all");
  const [expandedStages, setExpandedStages] = useState<Set<number>>(new Set());
  const [addTaskStageId, setAddTaskStageId] = useState<number | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskPriority, setNewTaskPriority] = useState("medium");
  const [newTaskAssignedTo, setNewTaskAssignedTo] = useState("");

  // Gather all tasks from stages
  const allTasks = useMemo(() => {
    const tasks: (Task & { stageName: string })[] = [];
    stages.forEach((stage) => {
      (stage.tasks || []).forEach((task) => {
        tasks.push({ ...task, stageName: stage.stageName });
      });
    });
    return tasks;
  }, [stages]);

  // Filter tasks
  const filteredTasks = useMemo(() => {
    return allTasks.filter((task) => {
      switch (filterView) {
        case "today": {
          if (task.status === "completed") return false;
          return task.dueDate && isToday(new Date(task.dueDate));
        }
        case "overdue": {
          if (task.status === "completed") return false;
          return task.dueDate && isPast(startOfDay(new Date(task.dueDate))) && !isToday(new Date(task.dueDate));
        }
        case "upcoming": {
          if (task.status === "completed") return false;
          if (!task.dueDate) return true; // no due date = show in upcoming
          const d = new Date(task.dueDate);
          return !isPast(startOfDay(d)) || isToday(d);
        }
        case "completed":
          return task.status === "completed";
        default:
          return true;
      }
    });
  }, [allTasks, filterView]);

  // Stats
  const stats = useMemo(() => {
    const total = allTasks.length;
    const completed = allTasks.filter((t) => t.status === "completed").length;
    const overdue = allTasks.filter((t) => t.status !== "completed" && t.dueDate && isPast(startOfDay(new Date(t.dueDate))) && !isToday(new Date(t.dueDate))).length;
    const dueToday = allTasks.filter((t) => t.status !== "completed" && t.dueDate && isToday(new Date(t.dueDate))).length;
    return { total, completed, overdue, dueToday, pending: total - completed };
  }, [allTasks]);

  // Group tasks by stage for "all" view
  const tasksByStage = useMemo(() => {
    const groups: Record<number, { stageName: string; tasks: typeof filteredTasks }> = {};
    filteredTasks.forEach((task) => {
      const stageId = task.stageId || 0;
      if (!groups[stageId]) {
        groups[stageId] = { stageName: task.stageName || "Unassigned", tasks: [] };
      }
      groups[stageId].tasks.push(task);
    });
    return groups;
  }, [filteredTasks]);

  const updateTaskMutation = useMutation({
    mutationFn: async ({ taskId, status, assignedTo }: { taskId: number; status?: string; assignedTo?: string | null }) => {
      const body: Record<string, unknown> = {};
      if (status !== undefined) body.status = status;
      if (assignedTo !== undefined) body.assignedTo = assignedTo;
      return apiRequest("PATCH", `/api/admin/projects/${projectId}/tasks/${taskId}`, body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/projects", projectId] });
      toast({ title: "Task updated" });
    },
  });

  const createTaskMutation = useMutation({
    mutationFn: async ({ stageId, title, priority, assignedTo }: { stageId: number; title: string; priority: string; assignedTo?: string }) => {
      return apiRequest("POST", `/api/admin/deals/${dealId}/tasks`, {
        taskName: title,
        stageId,
        priority,
        assignedTo: assignedTo || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/projects", projectId] });
      toast({ title: "Task created" });
      setNewTaskTitle("");
      setNewTaskPriority("medium");
      setNewTaskAssignedTo("");
      setAddTaskStageId(null);
    },
  });

  const toggleStage = (stageId: number) => {
    setExpandedStages((prev) => {
      const next = new Set(prev);
      if (next.has(stageId)) next.delete(stageId);
      else next.add(stageId);
      return next;
    });
  };

  // Auto-expand all stages on open
  useMemo(() => {
    if (open && expandedStages.size === 0) {
      setExpandedStages(new Set(stages.map((s) => s.id)));
    }
  }, [open, stages]);

  const getAssigneeName = (assignedTo: string | null | undefined) => {
    if (!assignedTo) return null;
    if (assignedTo === "borrower") return borrowerName || "Borrower";
    if (assignedTo === "broker") return brokerName || "Broker";
    const member = teamMembers.find((m) => String(m.id) === assignedTo);
    return member?.fullName || member?.email || null;
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[460px] sm:w-[520px] p-0 flex flex-col" side="right">
        <SheetHeader className="px-5 pt-5 pb-3 border-b">
          <SheetTitle className="flex items-center gap-2">
            <ListChecks className="h-5 w-5" />
            Tasks
            <Badge variant="secondary" className="ml-1">{stats.pending} open</Badge>
          </SheetTitle>
        </SheetHeader>

        {/* Stats bar */}
        <div className="px-5 py-3 border-b bg-muted/30">
          <div className="grid grid-cols-4 gap-2 text-center">
            <button
              className={cn("rounded-lg p-2 transition-colors", filterView === "all" ? "bg-primary/10 ring-1 ring-primary/30" : "hover:bg-muted")}
              onClick={() => setFilterView("all")}
            >
              <div className="text-lg font-bold">{stats.total}</div>
              <div className="text-[10px] text-muted-foreground">Total</div>
            </button>
            <button
              className={cn("rounded-lg p-2 transition-colors", filterView === "today" ? "bg-blue-50 ring-1 ring-blue-200" : "hover:bg-muted")}
              onClick={() => setFilterView("today")}
            >
              <div className="text-lg font-bold text-blue-600">{stats.dueToday}</div>
              <div className="text-[10px] text-muted-foreground">Due Today</div>
            </button>
            <button
              className={cn("rounded-lg p-2 transition-colors", filterView === "overdue" ? "bg-red-50 ring-1 ring-red-200" : "hover:bg-muted")}
              onClick={() => setFilterView("overdue")}
            >
              <div className={cn("text-lg font-bold", stats.overdue > 0 ? "text-red-600" : "")}>{stats.overdue}</div>
              <div className="text-[10px] text-muted-foreground">Overdue</div>
            </button>
            <button
              className={cn("rounded-lg p-2 transition-colors", filterView === "completed" ? "bg-green-50 ring-1 ring-green-200" : "hover:bg-muted")}
              onClick={() => setFilterView("completed")}
            >
              <div className="text-lg font-bold text-green-600">{stats.completed}</div>
              <div className="text-[10px] text-muted-foreground">Done</div>
            </button>
          </div>
        </div>

        {/* Task list */}
        <ScrollArea className="flex-1">
          <div className="px-5 py-3 space-y-2">
            {filteredTasks.length === 0 && (
              <div className="py-12 text-center text-sm text-muted-foreground">
                <CheckSquare className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
                {filterView === "completed" ? "No completed tasks yet." :
                 filterView === "overdue" ? "No overdue tasks." :
                 filterView === "today" ? "No tasks due today." :
                 "No tasks found."}
              </div>
            )}

            {/* Group by stage */}
            {Object.entries(tasksByStage).map(([stageIdStr, group]) => {
              const stageId = parseInt(stageIdStr);
              const isExpanded = expandedStages.has(stageId);
              return (
                <div key={stageId} className="border rounded-lg overflow-hidden">
                  <button
                    className="flex items-center w-full px-3 py-2.5 text-left hover:bg-muted/50 transition-colors"
                    onClick={() => toggleStage(stageId)}
                  >
                    {isExpanded ? <ChevronDown className="h-4 w-4 mr-2 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 mr-2 text-muted-foreground" />}
                    <span className="text-sm font-medium flex-1">{group.stageName}</span>
                    <Badge variant="outline" className="text-xs ml-2">
                      {group.tasks.filter((t) => t.status !== "completed").length}/{group.tasks.length}
                    </Badge>
                  </button>

                  {isExpanded && (
                    <div className="border-t">
                      {group.tasks.map((task) => {
                        const dueInfo = getDueDateLabel(task.dueDate);
                        const assigneeName = getAssigneeName(task.assignedTo);
                        return (
                          <div
                            key={task.id}
                            className={cn(
                              "flex items-start gap-3 px-3 py-2.5 border-b last:border-b-0 transition-colors",
                              task.status === "completed" && "bg-muted/30 opacity-70"
                            )}
                          >
                            <Checkbox
                              checked={task.status === "completed"}
                              onCheckedChange={(checked) => {
                                if (projectId) {
                                  updateTaskMutation.mutate({
                                    taskId: task.id,
                                    status: checked ? "completed" : "pending",
                                  });
                                }
                              }}
                              className="mt-0.5"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className={cn("text-sm", task.status === "completed" && "line-through text-muted-foreground")}>
                                  {task.taskTitle || task.taskName}
                                </span>
                                <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", getPriorityColor(task.priority))}>
                                  {task.priority}
                                </Badge>
                                {task.borrowerActionRequired && (
                                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">Borrower</Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                                {assigneeName && (
                                  <span className="flex items-center gap-1">
                                    <User className="h-3 w-3" />
                                    {assigneeName}
                                  </span>
                                )}
                                {dueInfo && (
                                  <span className={cn("flex items-center gap-1", dueInfo.className)}>
                                    <Calendar className="h-3 w-3" />
                                    {dueInfo.label}
                                  </span>
                                )}
                                {task.completedAt && (
                                  <span className="flex items-center gap-1 text-green-600">
                                    <Clock className="h-3 w-3" />
                                    {format(new Date(task.completedAt), "MMM d 'at' h:mm a")}
                                    {task.completedBy && ` by ${task.completedBy}`}
                                  </span>
                                )}
                              </div>
                            </div>
                            {/* Quick reassign */}
                            <Select
                              value={task.assignedTo || "unassigned"}
                              onValueChange={(value) => {
                                if (projectId) {
                                  updateTaskMutation.mutate({
                                    taskId: task.id,
                                    assignedTo: value === "unassigned" ? null : value,
                                  });
                                }
                              }}
                            >
                              <SelectTrigger className="w-[110px] h-7 text-[11px] shrink-0">
                                <SelectValue placeholder="Assign..." />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="unassigned">Unassigned</SelectItem>
                                {borrowerName && <SelectItem value="borrower">{borrowerName} (Borrower)</SelectItem>}
                                {brokerName && <SelectItem value="broker">{brokerName} (Broker)</SelectItem>}
                                {teamMembers
                                  .filter((m) => m.role === "admin" || m.role === "super_admin" || m.role === "staff" || m.role === "processor")
                                  .map((member) => (
                                    <SelectItem key={member.id} value={String(member.id)}>
                                      {member.fullName || member.email}
                                    </SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                          </div>
                        );
                      })}

                      {/* Add task inline */}
                      {addTaskStageId === stageId ? (
                        <div className="p-3 border-t bg-muted/20 space-y-2">
                          <Input
                            placeholder="Task title..."
                            value={newTaskTitle}
                            onChange={(e) => setNewTaskTitle(e.target.value)}
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && newTaskTitle.trim()) {
                                createTaskMutation.mutate({
                                  stageId,
                                  title: newTaskTitle.trim(),
                                  priority: newTaskPriority,
                                  assignedTo: newTaskAssignedTo,
                                });
                              }
                              if (e.key === "Escape") {
                                setAddTaskStageId(null);
                                setNewTaskTitle("");
                              }
                            }}
                            className="h-8 text-sm"
                          />
                          <div className="flex items-center gap-2">
                            <Select value={newTaskPriority} onValueChange={setNewTaskPriority}>
                              <SelectTrigger className="w-[100px] h-7 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="low">Low</SelectItem>
                                <SelectItem value="medium">Medium</SelectItem>
                                <SelectItem value="high">High</SelectItem>
                                <SelectItem value="urgent">Urgent</SelectItem>
                              </SelectContent>
                            </Select>
                            <Select value={newTaskAssignedTo || "unassigned"} onValueChange={(v) => setNewTaskAssignedTo(v === "unassigned" ? "" : v)}>
                              <SelectTrigger className="w-[120px] h-7 text-xs">
                                <SelectValue placeholder="Assign..." />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="unassigned">Unassigned</SelectItem>
                                {teamMembers
                                  .filter((m) => m.role === "admin" || m.role === "super_admin" || m.role === "staff" || m.role === "processor")
                                  .map((member) => (
                                    <SelectItem key={member.id} value={String(member.id)}>
                                      {member.fullName || member.email}
                                    </SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                            <Button
                              size="sm"
                              className="h-7 text-xs"
                              disabled={!newTaskTitle.trim() || createTaskMutation.isPending}
                              onClick={() => {
                                createTaskMutation.mutate({
                                  stageId,
                                  title: newTaskTitle.trim(),
                                  priority: newTaskPriority,
                                  assignedTo: newTaskAssignedTo,
                                });
                              }}
                            >
                              Add
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setAddTaskStageId(null); setNewTaskTitle(""); }}>
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <button
                          className="flex items-center gap-1.5 px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 w-full border-t transition-colors"
                          onClick={() => setAddTaskStageId(stageId)}
                        >
                          <Plus className="h-3 w-3" />
                          Add task
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Show stages with no filtered tasks so user can still add */}
            {filterView === "all" && stages.filter((s) => !tasksByStage[s.id]).map((stage) => (
              <div key={stage.id} className="border rounded-lg overflow-hidden">
                <button
                  className="flex items-center w-full px-3 py-2.5 text-left hover:bg-muted/50 transition-colors"
                  onClick={() => toggleStage(stage.id)}
                >
                  {expandedStages.has(stage.id) ? <ChevronDown className="h-4 w-4 mr-2 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 mr-2 text-muted-foreground" />}
                  <span className="text-sm font-medium flex-1 text-muted-foreground">{stage.stageName}</span>
                  <Badge variant="outline" className="text-xs ml-2 text-muted-foreground">0</Badge>
                </button>
                {expandedStages.has(stage.id) && (
                  <div className="border-t">
                    {addTaskStageId === stage.id ? (
                      <div className="p-3 bg-muted/20 space-y-2">
                        <Input
                          placeholder="Task title..."
                          value={newTaskTitle}
                          onChange={(e) => setNewTaskTitle(e.target.value)}
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && newTaskTitle.trim()) {
                              createTaskMutation.mutate({
                                stageId: stage.id,
                                title: newTaskTitle.trim(),
                                priority: newTaskPriority,
                                assignedTo: newTaskAssignedTo,
                              });
                            }
                            if (e.key === "Escape") {
                              setAddTaskStageId(null);
                              setNewTaskTitle("");
                            }
                          }}
                          className="h-8 text-sm"
                        />
                        <div className="flex items-center gap-2">
                          <Select value={newTaskPriority} onValueChange={setNewTaskPriority}>
                            <SelectTrigger className="w-[100px] h-7 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="low">Low</SelectItem>
                              <SelectItem value="medium">Medium</SelectItem>
                              <SelectItem value="high">High</SelectItem>
                              <SelectItem value="urgent">Urgent</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button
                            size="sm"
                            className="h-7 text-xs"
                            disabled={!newTaskTitle.trim() || createTaskMutation.isPending}
                            onClick={() => {
                              createTaskMutation.mutate({
                                stageId: stage.id,
                                title: newTaskTitle.trim(),
                                priority: newTaskPriority,
                                assignedTo: newTaskAssignedTo,
                              });
                            }}
                          >
                            Add
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setAddTaskStageId(null); setNewTaskTitle(""); }}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <button
                        className="flex items-center gap-1.5 px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 w-full transition-colors"
                        onClick={() => setAddTaskStageId(stage.id)}
                      >
                        <Plus className="h-3 w-3" />
                        Add task
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
