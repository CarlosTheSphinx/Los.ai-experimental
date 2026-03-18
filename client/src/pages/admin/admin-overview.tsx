import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { formatTime } from '@/lib/utils';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  ArrowRight,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Calendar,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Briefcase,
  CheckSquare,
  Clock,
  AlertCircle,
  FileSearch,
  FileText,
} from 'lucide-react';

function formatCurrency(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toLocaleString()}`;
}

function formatAmount(value: number): string {
  return `$${value.toLocaleString()}`;
}

function getRelativeTime(date: string | Date): string {
  const now = new Date();
  const d = new Date(date);
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return d.toLocaleDateString();
}

function getWeekDates(offset: number): { dates: Date[]; label: string } {
  const today = new Date();
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay() + 1 + offset * 7);

  const dates: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(startOfWeek);
    d.setDate(startOfWeek.getDate() + i);
    dates.push(d);
  }

  return { dates, label: '' };
}

function formatDateShort(date: Date): string {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return `${days[date.getDay()]} ${date.getDate()}`;
}

function formatDateISO(date: Date): string {
  return date.toISOString().split('T')[0];
}

function isToday(date: Date): boolean {
  const today = new Date();
  return date.toDateString() === today.toDateString();
}

const STAGE_COLORS: Record<string, string> = {
  'Lead': '#3B82F6',
  'Application': '#8B5CF6',
  'Processing': '#F59E0B',
  'Underwriting': '#06B6D4',
  'Closing': '#10B981',
  'Funded': '#10B981',
  'Denied': '#EF4444',
};

function getStageColor(stage: string): string {
  for (const [key, color] of Object.entries(STAGE_COLORS)) {
    if (stage?.toLowerCase().includes(key.toLowerCase())) return color;
  }
  return '#6366F1';
}

export default function AdminOverview() {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedDate, setSelectedDate] = useState<string>(formatDateISO(new Date()));
  const [taskFilter, setTaskFilter] = useState<'date' | 'all'>('date');

  const { dates: weekDates } = getWeekDates(weekOffset);

  const { data: dashboardData, isLoading: statsLoading } = useQuery<any>({
    queryKey: ['/api/admin/dashboard'],
  });

  const taskBoardUrl = (() => {
    const params = new URLSearchParams();
    if (taskFilter === 'date') params.set('date', selectedDate);
    const startDate = formatDateISO(weekDates[0]);
    const endDate = formatDateISO(weekDates[6]);
    params.set('startDate', startDate);
    params.set('endDate', endDate);
    return `/api/admin/task-board?${params.toString()}`;
  })();

  const { data: taskBoardData, isLoading: tasksLoading } = useQuery<any>({
    queryKey: [taskBoardUrl],
  });

  const { data: dealsData, isLoading: dealsLoading } = useQuery<any>({
    queryKey: ['/api/deals'],
  });

  const { data: pendingReviewData } = useQuery<any>({
    queryKey: ['/api/documents/pending-review'],
  });

  const completeTaskMutation = useMutation({
    mutationFn: async (taskId: number) => {
      return apiRequest('PATCH', `/api/admin/task-board/${taskId}`, { status: 'completed' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [taskBoardUrl] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/dashboard'] });
    },
  });

  const stats = dashboardData?.stats;
  const tasks = taskBoardData?.tasks || [];
  const dateCounts = taskBoardData?.dateCounts || {};
  const allDeals = (dealsData?.projects || (Array.isArray(dealsData) ? dealsData : []))
    .slice()
    .sort((a: any, b: any) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime());
  const recentDeals = allDeals.slice(0, 5);

  const tasksDueToday = tasks.filter((t: any) => {
    if (!t.dueDate) return false;
    const d = new Date(t.dueDate);
    return isToday(d);
  });

  const overdueTasks = tasks.filter((t: any) => {
    if (!t.dueDate || t.status === 'completed') return false;
    return new Date(t.dueDate) < new Date(new Date().toDateString());
  });

  function getTaskStatus(task: any): { label: string; color: string } {
    if (task.status === 'completed') return { label: 'Done', color: 'text-emerald-600' };
    if (!task.dueDate) return { label: 'No date', color: 'text-muted-foreground' };
    const due = new Date(task.dueDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (due < today) return { label: 'Overdue', color: 'text-red-600' };
    if (due.toDateString() === today.toDateString()) return { label: 'Due Today', color: 'text-amber-600' };
    return { label: `Due ${due.toLocaleDateString()}`, color: 'text-muted-foreground' };
  }

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[30px] font-display font-bold" data-testid="text-dashboard-title">Dashboard</h1>
          <p className="text-[16px] text-muted-foreground mt-0.5">Overview of your lending operations</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" data-testid="stats-grid">
        <div className="bg-card border rounded-[10px] shadow-sm px-5 py-4" data-testid="stat-active-deals">
          <div className="flex items-center justify-between">
            <p className="text-[13px] uppercase tracking-wider text-muted-foreground font-medium">Active Deals</p>
            <Briefcase className="h-4 w-4 text-muted-foreground/60" />
          </div>
          <div className="flex items-end justify-between mt-2">
            <div>
              <p className="text-[32px] font-bold leading-none">
                {statsLoading ? '—' : stats?.activeProjects ?? 0}
              </p>
              {stats && stats.completedProjects > 0 && (
                <p className="text-[13px] text-emerald-600 mt-1 flex items-center gap-1">
                  <TrendingUp className="h-3 w-3" />
                  {stats.completedProjects} completed
                </p>
              )}
            </div>
            <BarChart3 className="h-8 w-14 text-primary/20" />
          </div>
        </div>

        <div className="bg-card border rounded-[10px] shadow-sm px-5 py-4" data-testid="stat-pipeline-value">
          <div className="flex items-center justify-between">
            <p className="text-[13px] uppercase tracking-wider text-muted-foreground font-medium">Pipeline Value</p>
            <DollarSign className="h-4 w-4 text-muted-foreground/60" />
          </div>
          <div className="flex items-end justify-between mt-2">
            <div>
              <p className="text-[32px] font-bold leading-none">
                {statsLoading ? '—' : formatCurrency(stats?.activePipelineValue ?? 0)}
              </p>
              {stats && stats.activePipelineValue > 0 && (
                <p className="text-[13px] text-emerald-600 mt-1 flex items-center gap-1">
                  <TrendingUp className="h-3 w-3" />
                  {stats.activeProjects} active deals
                </p>
              )}
            </div>
            <BarChart3 className="h-8 w-14 text-primary/20" />
          </div>
        </div>

        <div className="bg-card border rounded-[10px] shadow-sm px-5 py-4" data-testid="stat-funded-volume">
          <div className="flex items-center justify-between">
            <p className="text-[13px] uppercase tracking-wider text-muted-foreground font-medium">Funded Volume</p>
            <DollarSign className="h-4 w-4 text-muted-foreground/60" />
          </div>
          <div className="flex items-end justify-between mt-2">
            <div>
              <p className="text-[32px] font-bold leading-none">
                {statsLoading ? '—' : formatCurrency(stats?.fundedVolume ?? 0)}
              </p>
              {stats && stats.completedProjects > 0 && (
                <p className="text-[13px] text-muted-foreground mt-1">
                  {stats.completedProjects} deals closed
                </p>
              )}
            </div>
            <BarChart3 className="h-8 w-14 text-primary/20" />
          </div>
        </div>

        <div className="bg-card border rounded-[10px] shadow-sm px-5 py-4" data-testid="stat-tasks-due">
          <div className="flex items-center justify-between">
            <p className="text-[13px] uppercase tracking-wider text-muted-foreground font-medium">Tasks Due / Overdue</p>
            <CheckSquare className="h-4 w-4 text-muted-foreground/60" />
          </div>
          <div className="flex items-end justify-between mt-2">
            <div>
              <p className="text-[32px] font-bold leading-none">
                {tasksLoading ? '—' : stats?.pendingAdminTasks ?? 0}
              </p>
              {overdueTasks.length > 0 && (
                <p className="text-[13px] text-red-600 mt-1 flex items-center gap-1">
                  <TrendingDown className="h-3 w-3" />
                  {overdueTasks.length} overdue
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-card border rounded-[10px] shadow-sm overflow-hidden" data-testid="task-board">
        <div className="px-5 py-4 flex items-center justify-between border-b border-border/50">
          <h2 className="text-[20px] font-bold">Task Board</h2>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-3 rounded-full"
              onClick={() => setWeekOffset(prev => prev - 1)}
              data-testid="button-prev-week"
            >
              <ChevronLeft className="h-4 w-4" />
              <span className="text-[13px] ml-1">Prev</span>
            </Button>
            {weekDates.map((date) => {
              const dateStr = formatDateISO(date);
              const count = dateCounts[dateStr] || 0;
              const today = isToday(date);
              const selected = dateStr === selectedDate;
              return (
                <Button
                  key={dateStr}
                  variant={selected ? 'default' : 'outline'}
                  size="sm"
                  className={`h-8 px-3 rounded-full text-[13px] ${today && !selected ? 'border-primary text-primary' : ''}`}
                  onClick={() => { setSelectedDate(dateStr); setTaskFilter('date'); }}
                  data-testid={`button-date-${dateStr}`}
                >
                  {formatDateShort(date)}
                  {count > 0 && (
                    <span className="ml-1 text-[11px] opacity-70">({count})</span>
                  )}
                </Button>
              );
            })}
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-3 rounded-full"
              onClick={() => setWeekOffset(prev => prev + 1)}
              data-testid="button-next-week"
            >
              <span className="text-[13px] mr-1">Next</span>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="px-5 py-3 flex items-center gap-2 border-b border-border/50">
          <Button
            variant={taskFilter === 'date' ? 'default' : 'outline'}
            size="sm"
            className="h-7 text-[13px] px-3"
            onClick={() => setTaskFilter('date')}
            data-testid="button-filter-by-date"
          >
            By Date
          </Button>
          <Button
            variant={taskFilter === 'all' ? 'default' : 'outline'}
            size="sm"
            className="h-7 text-[13px] px-3"
            onClick={() => setTaskFilter('all')}
            data-testid="button-filter-all-tasks"
          >
            All Tasks
          </Button>
          <div className="flex-1" />
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-[13px] px-3 gap-1"
            data-testid="button-calendar-view"
          >
            <Calendar className="h-3.5 w-3.5" />
            Calendar
          </Button>
        </div>

        <div className="px-4 py-3 space-y-3" data-testid="task-list">
          {tasksLoading ? (
            <div className="px-5 py-8 text-center text-muted-foreground text-[14px]">
              Loading tasks...
            </div>
          ) : tasks.length === 0 ? (
            <div className="px-5 py-8 text-center text-muted-foreground text-[14px]">
              {taskFilter === 'date' ? 'No tasks due on this date' : 'No pending tasks'}
            </div>
          ) : (
            tasks.map((task: any) => {
              const status = getTaskStatus(task);
              const isCompleted = task.status === 'completed';
              const priority = (task.priority || '').toLowerCase();
              const borderColor = priority === 'high' || priority === 'critical'
                ? 'border-l-red-500'
                : priority === 'medium'
                  ? 'border-l-amber-400'
                  : 'border-l-emerald-500';
              return (
                <div
                  key={task.id}
                  className={`flex items-center gap-4 px-5 py-3.5 border rounded-[10px] border-l-4 ${borderColor} shadow-sm hover:shadow-md transition-shadow ${isCompleted ? 'opacity-60' : ''}`}
                  data-testid={`task-row-${task.id}`}
                >
                  <Checkbox
                    checked={isCompleted}
                    onCheckedChange={() => {
                      if (!isCompleted) completeTaskMutation.mutate(task.id);
                    }}
                    className={`h-5 w-5 rounded-full ${isCompleted ? 'bg-emerald-500 border-emerald-500' : priority === 'high' || priority === 'critical' ? 'border-red-400' : priority === 'medium' ? 'border-amber-400' : 'border-emerald-400'}`}
                    data-testid={`checkbox-task-${task.id}`}
                  />
                  <div className="flex-1 min-w-0">
                    <p className={`text-[16px] font-medium ${isCompleted ? 'line-through' : ''}`}>
                      {task.taskTitle}
                      {task.projectName && (
                        <span className="text-muted-foreground font-normal"> — {task.propertyAddress?.split(',')[0] || task.projectName}</span>
                      )}
                    </p>
                    <p className="text-[15px] text-muted-foreground">
                      {task.borrowerName && <>Borrower: {task.borrowerName}</>}
                      {task.programName && <> · {task.programName}</>}
                      {task.dueDate && <> · Due {formatTime(task.dueDate)}</>}
                      {isCompleted && task.completedAt && <> · Completed {formatTime(task.completedAt)}</>}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className={`text-[15px] font-medium flex items-center gap-1 ${status.color}`}>
                      {status.label === 'Overdue' && <AlertCircle className="h-3.5 w-3.5" />}
                      {status.label === 'Due Today' && <Clock className="h-3.5 w-3.5" />}
                      {status.label}
                    </span>
                    {task.projectId && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-[15px] px-2 text-muted-foreground hover:text-primary"
                        onClick={() => navigate(`/admin/deals/${task.projectId}`)}
                        data-testid={`button-open-deal-${task.id}`}
                      >
                        Open Deal →
                      </Button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {(() => {
        const pendingDocs = pendingReviewData?.documents || [];
        const groupedByDeal = pendingDocs.reduce((acc: Record<number, any>, doc: any) => {
          if (!acc[doc.dealId]) {
            acc[doc.dealId] = {
              dealId: doc.dealId,
              loanNumber: doc.loanNumber || doc.projectNumber || `#${doc.dealId}`,
              borrowerName: doc.borrowerName || doc.projectName,
              documents: [],
            };
          }
          acc[doc.dealId].documents.push(doc);
          return acc;
        }, {});
        const dealGroups = Object.values(groupedByDeal) as any[];
        return (
          <div className="bg-card border rounded-[10px] shadow-sm overflow-hidden" data-testid="pending-review-card">
            <div className="px-5 py-4 flex items-center justify-between border-b border-border/50">
              <div className="flex items-center gap-2">
                <h2 className="text-[20px] font-bold">Ready for Review</h2>
                {pendingDocs.length > 0 && (
                  <Badge className="bg-blue-500/15 text-blue-600 border-blue-200 text-[13px] font-semibold" data-testid="badge-pending-review-count">
                    {pendingDocs.length}
                  </Badge>
                )}
              </div>
              <FileSearch className="h-4 w-4 text-muted-foreground/60" />
            </div>
            <div className="px-4 py-3 space-y-2 max-h-[320px] overflow-y-auto" data-testid="pending-review-list">
              {dealGroups.length === 0 ? (
                <div className="px-5 py-8 text-center text-muted-foreground text-[14px]">
                  All documents have been reviewed
                </div>
              ) : (
                dealGroups.map((group: any) => (
                  <div key={group.dealId} className="border rounded-[10px] px-4 py-3" data-testid={`review-group-${group.dealId}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <span className="text-[14px] font-semibold text-primary">{group.loanNumber}</span>
                        <span className="text-[13px] text-muted-foreground ml-2">{group.borrowerName}</span>
                      </div>
                      <Badge variant="outline" className="text-[11px]">{group.documents.length} doc{group.documents.length !== 1 ? 's' : ''}</Badge>
                    </div>
                    {group.documents.map((doc: any) => (
                      <div
                        key={doc.id}
                        className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-muted/50 cursor-pointer transition-colors"
                        onClick={() => navigate(`/admin/deals/${doc.dealId}?tab=documents`)}
                        data-testid={`review-doc-${doc.id}`}
                      >
                        <FileText className="h-3.5 w-3.5 text-blue-500 flex-shrink-0" />
                        <span className="text-[13px] flex-1 truncate">{doc.documentName}</span>
                        {doc.uploadedAt && (
                          <span className="text-[11px] text-muted-foreground flex-shrink-0">{formatTime(doc.uploadedAt)}</span>
                        )}
                      </div>
                    ))}
                  </div>
                ))
              )}
            </div>
          </div>
        );
      })()}

      <div className="bg-card border rounded-[10px] shadow-sm overflow-hidden" data-testid="recent-deals">
        <div className="px-5 py-4 flex items-center justify-between border-b border-border/50">
          <h2 className="text-[20px] font-bold">Recent Deals</h2>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-[13px] px-3"
            onClick={() => navigate('/admin')}
            data-testid="button-view-all-pipeline"
          >
            View All Pipeline →
          </Button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full" data-testid="deals-table">
            <thead>
              <tr className="border-b border-border/50">
                <th className="text-left px-5 py-3 text-[13px] uppercase tracking-wider text-muted-foreground font-medium">Loan #</th>
                <th className="text-left px-5 py-3 text-[13px] uppercase tracking-wider text-muted-foreground font-medium">Borrower</th>
                <th className="text-left px-5 py-3 text-[13px] uppercase tracking-wider text-muted-foreground font-medium">Property</th>
                <th className="text-left px-5 py-3 text-[13px] uppercase tracking-wider text-muted-foreground font-medium">Program</th>
                <th className="text-right px-5 py-3 text-[13px] uppercase tracking-wider text-muted-foreground font-medium">Amount</th>
                <th className="text-left px-5 py-3 text-[13px] uppercase tracking-wider text-muted-foreground font-medium">Stage</th>
                <th className="text-right px-5 py-3 text-[13px] uppercase tracking-wider text-muted-foreground font-medium">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {dealsLoading ? (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-muted-foreground text-[14px]">
                    Loading deals...
                  </td>
                </tr>
              ) : recentDeals.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-muted-foreground text-[14px]">
                    No deals found
                  </td>
                </tr>
              ) : (
                recentDeals.map((deal: any) => {
                  const stageName = deal.currentStageName || deal.currentStage || '—';
                  const stageColor = getStageColor(stageName);
                  return (
                    <tr
                      key={deal.id}
                      className="hover:bg-muted/30 transition-colors cursor-pointer"
                      onClick={() => navigate(`/admin/deals/${deal.id}`)}
                      data-testid={`deal-row-${deal.id}`}
                    >
                      <td className="px-5 py-3">
                        <span className="text-[14px] font-medium text-primary">{deal.loanNumber || deal.projectNumber || `LN-${deal.id}`}</span>
                      </td>
                      <td className="px-5 py-3 text-[14px]">{deal.borrowerName || '—'}</td>
                      <td className="px-5 py-3 text-[14px] text-muted-foreground max-w-[200px] truncate">
                        {deal.propertyAddress?.split(',').slice(0, 2).join(',') || '—'}
                      </td>
                      <td className="px-5 py-3 text-[14px]">{deal.programName || '—'}</td>
                      <td className="px-5 py-3 text-[14px] font-semibold text-right">
                        {deal.loanAmount ? formatAmount(deal.loanAmount) : '—'}
                      </td>
                      <td className="px-5 py-3">
                        <span className="inline-flex items-center gap-1.5 text-[13px]">
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: stageColor }} />
                          {stageName}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-[13px] text-muted-foreground text-right">
                        {deal.updatedAt ? getRelativeTime(deal.updatedAt) : '—'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
