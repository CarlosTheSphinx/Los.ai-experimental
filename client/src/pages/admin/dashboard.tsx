import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Users, FolderKanban, FileCheck, ClipboardList, DollarSign, TrendingUp,
  ChevronLeft, ChevronRight, CalendarDays, Pencil, Circle, CheckCircle2,
  MapPin, Loader2, AlertCircle, ArrowUpRight, ArrowDownRight, Plus, Calculator, FolderUp
} from "lucide-react";
import { format, addDays, subDays, isToday, isBefore, startOfDay, parseISO, formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

interface DashboardStats {
  totalActiveUsers: number;
  regularUsers: number;
  activeProjects: number;
  completedProjects: number;
  completedAgreements: number;
  pendingAdminTasks: number;
  activePipelineValue: number;
  fundedVolume: number;
}
// Note: activeProjects and completedProjects internally refer to deals

interface AdminActivityItem {
  id: number;
  projectId: number | null;
  userId: number | null;
  actionType: string;
  actionDescription: string;
  createdAt: string;
}

interface TaskBoardItem {
  id: number;
  projectId: number;
  stageId: number | null;
  taskTitle: string;
  taskDescription: string | null;
  taskType: string | null;
  status: string;
  priority: string | null;
  assignedTo: string | null;
  dueDate: string | null;
  completedAt: string | null;
  completedBy: string | null;
  requiresDocument: boolean | null;
  createdAt: string;
  projectName: string;
  borrowerName: string;
  propertyAddress: string;
  projectNumber: string;
}

interface TaskBoardResponse {
  tasks: TaskBoardItem[];
  dateCounts: Record<string, number>;
  pendingCount: number;
}

// Sparkline mini-chart component
function SparklineChart({ data, color }: { data: number[]; color: string }) {
  const chartData = data.map((value, index) => ({ index, value }));
  return (
    <ResponsiveContainer width="100%" height={30}>
      <AreaChart data={chartData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={`sparklineGrad-${color}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.3} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey="value"
          stroke={color}
          fill={`url(#sparklineGrad-${color})`}
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function TaskBoard() {
  const { toast } = useToast();
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [showAllTasks, setShowAllTasks] = useState(true);
  const [editingTask, setEditingTask] = useState<TaskBoardItem | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editPriority, setEditPriority] = useState("");
  const [editDueDate, setEditDueDate] = useState<Date | undefined>(undefined);
  const [showCalendarPicker, setShowCalendarPicker] = useState(false);
  const [completingIds, setCompletingIds] = useState<Set<number>>(new Set());

  const dateStr = format(selectedDate, "yyyy-MM-dd");
  const weekStart = format(subDays(selectedDate, 3), "yyyy-MM-dd");
  const weekEnd = format(addDays(selectedDate, 3), "yyyy-MM-dd");

  const taskBoardUrl = showAllTasks 
    ? `/api/admin/task-board?startDate=${weekStart}&endDate=${weekEnd}`
    : `/api/admin/task-board?date=${dateStr}&startDate=${weekStart}&endDate=${weekEnd}`;

  const { data: taskBoard, isLoading: tasksLoading } = useQuery<TaskBoardResponse>({
    queryKey: [taskBoardUrl],
  });

  const completeMutation = useMutation({
    mutationFn: async (taskId: number) => {
      return apiRequest("PATCH", `/api/admin/task-board/${taskId}`, { status: "completed" });
    },
    onMutate: (taskId) => {
      setCompletingIds(prev => new Set(prev).add(taskId));
    },
    onSuccess: () => {
      setTimeout(() => {
        queryClient.invalidateQueries({ predicate: (query) => {
          const key = query.queryKey[0];
          return typeof key === 'string' && (key.startsWith('/api/admin/task-board') || key === '/api/admin/dashboard');
        }});
      }, 400);
    },
    onError: (_err, taskId) => {
      setCompletingIds(prev => {
        const next = new Set(prev);
        next.delete(taskId);
        return next;
      });
      toast({ title: "Error", description: "Failed to complete task", variant: "destructive" });
    },
    onSettled: (_data, _err, taskId) => {
      setTimeout(() => {
        setCompletingIds(prev => {
          const next = new Set(prev);
          next.delete(taskId);
          return next;
        });
      }, 500);
    },
  });

  const editMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: number; updates: any }) => {
      return apiRequest("PATCH", `/api/admin/task-board/${id}`, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (query) => {
        const key = query.queryKey[0];
        return typeof key === 'string' && (key.startsWith('/api/admin/task-board') || key === '/api/admin/dashboard');
      }});
      setEditingTask(null);
      toast({ title: "Task updated" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update task", variant: "destructive" });
    },
  });

  const openEditDialog = (task: TaskBoardItem) => {
    setEditingTask(task);
    setEditTitle(task.taskTitle);
    setEditDescription(task.taskDescription || "");
    setEditPriority(task.priority || "medium");
    setEditDueDate(task.dueDate ? parseISO(task.dueDate) : undefined);
  };

  const handleSaveEdit = () => {
    if (!editingTask) return;
    editMutation.mutate({
      id: editingTask.id,
      updates: {
        taskTitle: editTitle,
        taskDescription: editDescription || null,
        priority: editPriority,
        dueDate: editDueDate ? editDueDate.toISOString() : null,
      },
    });
  };

  const tasks = taskBoard?.tasks || [];
  const dateCounts = taskBoard?.dateCounts || {};

  const daySlots = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(subDays(selectedDate, 3), i);
    return d;
  });

  const overdueTasks = showAllTasks ? [] : tasks.filter(t => {
    if (completingIds.has(t.id)) return false;
    if (!t.dueDate) return false;
    const due = startOfDay(parseISO(t.dueDate));
    const sel = startOfDay(selectedDate);
    return isBefore(due, sel);
  });

  const currentTasks = tasks.filter(t => {
    if (completingIds.has(t.id)) return false;
    if (showAllTasks) return true;
    if (!t.dueDate) return false;
    const due = format(parseISO(t.dueDate), "yyyy-MM-dd");
    return due === dateStr;
  });

  const unscheduledCount = showAllTasks ? 0 : tasks.filter(t => !t.dueDate && !completingIds.has(t.id)).length;

  const tasksByProject = currentTasks.reduce<Record<number, { project: { id: number; name: string; borrower: string; address: string; number: string }; tasks: TaskBoardItem[] }>>((acc, task) => {
    if (!acc[task.projectId]) {
      acc[task.projectId] = {
        project: { id: task.projectId, name: task.projectName, borrower: task.borrowerName, address: task.propertyAddress, number: task.projectNumber },
        tasks: [],
      };
    }
    acc[task.projectId].tasks.push(task);
    return acc;
  }, {});

  const priorityColor = (p: string | null) => {
    switch (p) {
      case "critical": return "text-destructive";
      case "high": return "text-warning";
      case "medium": return "text-warning";
      case "low": return "text-muted-foreground";
      default: return "text-muted-foreground";
    }
  };

  return (
    <Card data-testid="card-task-board" className="lg:col-span-2">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5" />
              Admin Tasks
              {taskBoard && (
                <Badge variant="secondary" className="ml-1" data-testid="badge-pending-count">
                  {taskBoard.pendingCount}
                </Badge>
              )}
            </CardTitle>
            <CardDescription>Pipeline deal tasks requiring attention</CardDescription>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant={showAllTasks ? "default" : "outline"}
              size="sm"
              onClick={() => setShowAllTasks(!showAllTasks)}
              data-testid="button-toggle-all-tasks"
            >
              {showAllTasks ? "By Date" : "All Tasks"}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!showAllTasks && (
          <div className="flex items-center gap-1 justify-center" data-testid="date-navigation">
            <Button 
              variant="ghost" 
              size="icon"
              onClick={() => setSelectedDate(d => subDays(d, 1))}
              data-testid="button-prev-day"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="flex gap-1 overflow-x-auto">
              {daySlots.map((d, i) => {
                const ds = format(d, "yyyy-MM-dd");
                const count = dateCounts[ds] || 0;
                const isSelected = ds === dateStr;
                const today = isToday(d);
                return (
                  <button
                    key={i}
                    onClick={() => setSelectedDate(d)}
                    className={cn(
                      "flex flex-col items-center px-2.5 py-1.5 rounded-md min-w-[52px] transition-colors",
                      isSelected ? "bg-primary text-primary-foreground" : "hover-elevate",
                      today && !isSelected && "ring-1 ring-primary/30"
                    )}
                    data-testid={`date-slot-${ds}`}
                  >
                    <span className="text-[10px] uppercase font-medium opacity-70">{format(d, "EEE")}</span>
                    <span className="text-sm font-semibold">{format(d, "d")}</span>
                    {count > 0 && (
                      <span className={cn(
                        "text-[10px] font-medium mt-0.5 rounded-full px-1.5",
                        isSelected ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-muted-foreground"
                      )}>
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <Button 
              variant="ghost" 
              size="icon"
              onClick={() => setSelectedDate(d => addDays(d, 1))}
              data-testid="button-next-day"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Popover open={showCalendarPicker} onOpenChange={setShowCalendarPicker}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="icon" data-testid="button-calendar-picker">
                  <CalendarDays className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(d) => { if (d) { setSelectedDate(d); setShowCalendarPicker(false); } }}
                />
              </PopoverContent>
            </Popover>
          </div>
        )}

        {!showAllTasks && (
          <div className="text-sm font-medium text-center text-muted-foreground" data-testid="text-selected-date">
            {isToday(selectedDate) ? "Today" : format(selectedDate, "EEEE, MMMM d, yyyy")}
          </div>
        )}

        <div className="max-h-[220px] overflow-y-auto">
          {tasksLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-5 w-5 rounded-full" />
                  <Skeleton className="h-4 flex-1" />
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              {!showAllTasks && overdueTasks.length > 0 && (
                <div className="space-y-2" data-testid="section-overdue">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-destructive uppercase tracking-wide">
                    <AlertCircle className="h-3.5 w-3.5" />
                    Overdue
                  </div>
                  {overdueTasks.map(task => (
                    <TaskRow 
                      key={task.id} 
                      task={task}
                      onComplete={() => completeMutation.mutate(task.id)}
                      onEdit={() => openEditDialog(task)}
                      priorityColor={priorityColor}
                      isCompleting={completingIds.has(task.id)}
                    />
                  ))}
                </div>
              )}

              {Object.keys(tasksByProject).length > 0 ? (
                Object.values(tasksByProject).map(group => (
                  <div key={group.project.id} className="space-y-1.5" data-testid={`task-group-${group.project.id}`}>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="font-mono font-medium text-primary">{group.project.number}</span>
                      <span className="truncate">{group.project.borrower}</span>
                      <span className="hidden sm:inline truncate">
                        <MapPin className="h-3 w-3 inline mr-0.5" />
                        {group.project.address}
                      </span>
                    </div>
                    {group.tasks.map(task => (
                      <TaskRow 
                        key={task.id} 
                        task={task}
                        onComplete={() => completeMutation.mutate(task.id)}
                        onEdit={() => openEditDialog(task)}
                        priorityColor={priorityColor}
                        isCompleting={completingIds.has(task.id)}
                      />
                    ))}
                  </div>
                ))
              ) : (
                <div className="text-center py-6 text-muted-foreground" data-testid="text-no-tasks">
                  <CheckCircle2 className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">
                    {showAllTasks ? "No pending tasks" : "No tasks due on this date"}
                  </p>
                  <p className="text-xs mt-1">
                    {!showAllTasks && "Try selecting a different date or viewing all tasks"}
                  </p>
                </div>
              )}

              {!showAllTasks && unscheduledCount > 0 && (
                <div className="text-center pt-2 border-t">
                  <p className="text-xs text-muted-foreground">
                    {unscheduledCount} unscheduled {unscheduledCount === 1 ? "task" : "tasks"} not shown
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </CardContent>

      <Dialog open={!!editingTask} onOpenChange={(open) => { if (!open) setEditingTask(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Task</DialogTitle>
            <DialogDescription>
              Update task details or reschedule to a different date.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="edit-title">Task Title</Label>
              <Input
                id="edit-title"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                data-testid="input-edit-title"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-description">Description</Label>
              <Input
                id="edit-description"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="Optional description"
                data-testid="input-edit-description"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Priority</Label>
                <Select value={editPriority} onValueChange={setEditPriority}>
                  <SelectTrigger data-testid="select-edit-priority">
                    <SelectValue />
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
                <Label>Due Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn("w-full justify-start text-left font-normal", !editDueDate && "text-muted-foreground")}
                      data-testid="button-edit-due-date"
                    >
                      <CalendarDays className="mr-2 h-4 w-4" />
                      {editDueDate ? format(editDueDate, "MMM d, yyyy") : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={editDueDate}
                      onSelect={setEditDueDate}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            {editingTask && (
              <div className="text-xs text-muted-foreground rounded-md bg-muted p-2">
                <span className="font-medium">{editingTask.projectNumber}</span> - {editingTask.borrowerName}
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            {editDueDate && (
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setEditDueDate(undefined)}
                className="mr-auto"
                data-testid="button-clear-due-date"
              >
                Clear date
              </Button>
            )}
            <Button variant="outline" onClick={() => setEditingTask(null)} data-testid="button-cancel-edit">Cancel</Button>
            <Button
              onClick={handleSaveEdit}
              disabled={!editTitle.trim() || editMutation.isPending}
              data-testid="button-save-edit"
            >
              {editMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function TaskRow({ task, onComplete, onEdit, priorityColor, isCompleting }: {
  task: TaskBoardItem;
  onComplete: () => void;
  onEdit: () => void;
  priorityColor: (p: string | null) => string;
  isCompleting: boolean;
}) {
  return (
    <div 
      className={cn(
        "group flex items-center gap-2.5 py-1.5 px-2 rounded-md transition-all duration-300",
        isCompleting && "opacity-0 scale-95 translate-x-4"
      )}
      data-testid={`task-row-${task.id}`}
    >
      <button
        onClick={onComplete}
        className="flex-shrink-0 transition-colors"
        disabled={isCompleting}
        data-testid={`button-complete-task-${task.id}`}
      >
        {isCompleting ? (
          <CheckCircle2 className="h-5 w-5 text-success" />
        ) : (
          <Circle className="h-5 w-5 text-muted-foreground/50 hover:text-primary transition-colors" />
        )}
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm truncate">{task.taskTitle}</span>
          {task.priority && task.priority !== "medium" && (
            <span className={cn("text-[10px] uppercase font-semibold", priorityColor(task.priority))}>
              {task.priority}
            </span>
          )}
        </div>
        {task.dueDate && (
          <span className="text-[11px] text-muted-foreground">
            Due {format(parseISO(task.dueDate), "MMM d")}
          </span>
        )}
      </div>
      <Button
        variant="ghost"
        size="icon"
        onClick={onEdit}
        className="invisible group-hover:visible flex-shrink-0"
        data-testid={`button-edit-task-${task.id}`}
      >
        <Pencil className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

export default function AdminDashboard() {
  const { data, isLoading } = useQuery<{ stats: DashboardStats; recentActivity: AdminActivityItem[] }>({
    queryKey: ["/api/admin/dashboard"],
  });

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(value);
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <h1 className="text-2xl font-semibold">Admin Dashboard</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const stats = data?.stats;
  const activity = data?.recentActivity || [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight" data-testid="text-admin-dashboard-title">Admin Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">Overview of your lending operations</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Active Users Card */}
        <Card data-testid="card-stat-users" className="stat-card-blue hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200">
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Users</CardTitle>
            <div className="rounded-full bg-info/10 p-2">
              <Users className="h-4 w-4 text-info" />
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <div className="text-5xl font-bold tracking-tight">{stats?.totalActiveUsers || 0}</div>
              <p className="text-xs text-muted-foreground mt-1">{stats?.regularUsers || 0} regular users</p>
            </div>
            <div className="flex items-center gap-1.5">
              <ArrowUpRight className="h-3.5 w-3.5 text-success" />
              <span className="text-xs font-medium text-success">+8% vs last month</span>
            </div>
            {/* TODO: Replace with real trend data from API */}
            <SparklineChart data={[12, 15, 14, 18, 20, 19, 22]} color="hsl(160 84% 39%)" />
          </CardContent>
        </Card>

        {/* Active Deals Card */}
        <Card data-testid="card-stat-deals" className="stat-card-navy hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200">
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Deals</CardTitle>
            <div className="rounded-full bg-foreground/10 p-2">
              <FolderKanban className="h-4 w-4 text-foreground/70" />
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <div className="text-5xl font-bold tracking-tight">{stats?.activeProjects || 0}</div>
              <p className="text-xs text-muted-foreground mt-1">{stats?.completedProjects || 0} completed</p>
            </div>
            <div className="flex items-center gap-1.5">
              <ArrowUpRight className="h-3.5 w-3.5 text-success" />
              <span className="text-xs font-medium text-success">+5% vs last month</span>
            </div>
            {/* TODO: Replace with real trend data from API */}
            <SparklineChart data={[8, 10, 9, 12, 11, 13, 14]} color="hsl(212 67% 51%)" />
          </CardContent>
        </Card>

        {/* Pipeline Value Card — HERO CARD (spans 2 columns for visual hierarchy) */}
        <Card data-testid="card-stat-pipeline" className="stat-card-emerald hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pipeline Value</CardTitle>
            <div className="rounded-full bg-accent/10 p-2">
              <DollarSign className="h-4 w-4 text-accent" />
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <div className="text-5xl font-bold tracking-tight">{formatCurrency(stats?.activePipelineValue || 0)}</div>
              <p className="text-xs text-muted-foreground mt-2">Active loans in pipeline</p>
            </div>
            <div className="flex items-center gap-1.5">
              <ArrowUpRight className="h-3.5 w-3.5 text-success" />
              <span className="text-xs font-medium text-success">+12% vs last month</span>
            </div>
            {/* TODO: Replace with real trend data from API */}
            <SparklineChart data={[45, 52, 48, 61, 58, 65, 72]} color="hsl(160 84% 39%)" />
          </CardContent>
        </Card>

        {/* Funded Volume Card */}
        <Card data-testid="card-stat-funded" className="stat-card-amber hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200">
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Funded Volume</CardTitle>
            <div className="rounded-full bg-warning/10 p-2">
              <TrendingUp className="h-4 w-4 text-warning" />
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <div className="text-5xl font-bold tracking-tight">{formatCurrency(stats?.fundedVolume || 0)}</div>
              <p className="text-xs text-muted-foreground mt-1">Total funded</p>
            </div>
            <div className="flex items-center gap-1.5">
              <ArrowDownRight className="h-3.5 w-3.5 text-destructive" />
              <span className="text-xs font-medium text-destructive">-3% vs last month</span>
            </div>
            {/* TODO: Replace with real trend data from API */}
            <SparklineChart data={[88, 85, 92, 88, 95, 92, 89]} color="hsl(38 92% 50%)" />
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions Row */}
      <div className="space-y-3">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Lane Suggests:</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="border border-border/50 bg-card hover:border-primary/30 hover:bg-primary/5 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 cursor-pointer">
            <CardContent className="flex flex-col items-center justify-center p-6 gap-3">
              <div className="rounded-lg bg-primary/10 p-3">
                <Plus className="h-5 w-5 text-primary" />
              </div>
              <p className="font-semibold text-sm text-foreground">New Deal</p>
              <p className="text-xs text-muted-foreground text-center">Create a new lending opportunity</p>
            </CardContent>
          </Card>
          <Card className="border border-border/50 bg-card hover:border-primary/30 hover:bg-primary/5 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 cursor-pointer">
            <CardContent className="flex flex-col items-center justify-center p-6 gap-3">
              <div className="rounded-lg bg-info/10 p-3">
                <FolderUp className="h-5 w-5 text-info" />
              </div>
              <p className="font-semibold text-sm text-foreground">Upload Document</p>
              <p className="text-xs text-muted-foreground text-center">Add borrower documentation</p>
            </CardContent>
          </Card>
          <Card className="border border-border/50 bg-card hover:border-primary/30 hover:bg-primary/5 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 cursor-pointer">
            <CardContent className="flex flex-col items-center justify-center p-6 gap-3">
              <div className="rounded-lg bg-accent/10 p-3">
                <Calculator className="h-5 w-5 text-accent" />
              </div>
              <p className="font-semibold text-sm text-foreground">Run Pricing</p>
              <p className="text-xs text-muted-foreground text-center">Generate loan quote</p>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <TaskBoard />

        <Card data-testid="card-agreements">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <div className="rounded-full bg-success/10 p-1.5">
                <FileCheck className="h-5 w-5 text-success" />
              </div>
              Completed Agreements
            </CardTitle>
            <CardDescription>Signed documents across all users</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center py-8">
              <div className="text-center">
                <div className="text-5xl font-bold text-success tracking-tight">{stats?.completedAgreements || 0}</div>
                <p className="text-sm text-muted-foreground mt-2">agreements signed</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card data-testid="card-recent-activity">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Recent Admin Activity</CardTitle>
              <CardDescription>Latest actions taken by staff</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" className="text-xs h-7">All</Button>
              <Button variant="outline" size="sm" className="text-xs h-7">My Activity</Button>
              <Button variant="outline" size="sm" className="text-xs h-7">Lane Activity</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {activity.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">No recent activity</p>
          ) : (
            <div className="space-y-0">
              {activity.map((item, index) => {
                const actionTypeColor = item.actionType.includes('approved') ? 'success' :
                  item.actionType.includes('rejected') ? 'destructive' :
                  item.actionType.includes('created') ? 'primary' :
                  'info';
                const borderColorClass = actionTypeColor === 'success' ? 'border-l-success' :
                  actionTypeColor === 'destructive' ? 'border-l-destructive' :
                  actionTypeColor === 'primary' ? 'border-l-primary' : 'border-l-info';

                return (
                  <div
                    key={item.id}
                    className={`flex items-start gap-3 py-3 px-3 border-l-3 ${borderColorClass} ${
                      index !== activity.length - 1 ? 'border-b border-border' : ''
                    } hover:bg-muted/50 transition-colors`}
                  >
                    <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center text-white text-xs font-semibold shrink-0">
                      {item.userId ? 'A' : 'S'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.actionDescription}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
                      </p>
                    </div>
                    <Badge variant="outline" className="text-xs shrink-0 ml-auto">
                      {item.actionType.replace(/_/g, " ")}
                    </Badge>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
