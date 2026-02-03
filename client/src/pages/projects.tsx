import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { 
  FolderKanban, 
  Plus, 
  Search, 
  ArrowRight,
  Building2,
  Calendar,
  DollarSign,
  User,
  CheckCircle2,
  Clock,
  AlertCircle,
  MessageSquare
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { useState } from "react";

interface Project {
  id: number;
  projectNumber: string;
  projectName: string;
  status: string;
  currentStage: string;
  progressPercentage: number;
  borrowerName: string;
  borrowerEmail: string;
  loanAmount: number | null;
  propertyAddress: string | null;
  targetCloseDate: string | null;
  applicationDate: string | null;
  createdAt: string;
  completedTasks: number;
  totalTasks: number;
  quoteId?: number | null;
}

export default function Projects() {
  const [, setLocation] = useLocation();
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  const { data, isLoading } = useQuery<{ projects: Project[] }>({
    queryKey: ['/api/projects', statusFilter !== 'all' ? `?status=${statusFilter}` : ''],
    queryFn: async () => {
      const url = statusFilter !== 'all' 
        ? `/api/projects?status=${statusFilter}` 
        : '/api/projects';
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch projects');
      return res.json();
    }
  });

  const projects = data?.projects ?? [];
  const filteredProjects = projects.filter(p => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      p.projectNumber?.toLowerCase().includes(query) ||
      p.projectName?.toLowerCase().includes(query) ||
      p.borrowerName?.toLowerCase().includes(query) ||
      p.propertyAddress?.toLowerCase().includes(query)
    );
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'active': return <Clock className="h-4 w-4 text-blue-500" />;
      case 'on_hold': return <AlertCircle className="h-4 w-4 text-yellow-500" />;
      default: return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge variant="secondary" className="bg-green-100 text-green-700">Completed</Badge>;
      case 'active':
        return <Badge variant="secondary" className="bg-blue-100 text-blue-700">Active</Badge>;
      case 'on_hold':
        return <Badge variant="secondary" className="bg-yellow-100 text-yellow-700">On Hold</Badge>;
      case 'cancelled':
        return <Badge variant="secondary" className="bg-red-100 text-red-700">Cancelled</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const formatStage = (stage: string | null) => {
    if (!stage) return 'Documentation';
    return stage.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  };

  const formatCurrency = (amount: number | null) => {
    if (!amount) return '—';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount);
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-page-title">
            <FolderKanban className="h-6 w-6 text-primary" />
            Projects
          </h1>
          <p className="text-muted-foreground mt-1">
            Track loan closings and borrower progress
          </p>
        </div>
        <Link href="/projects/new">
          <Button data-testid="button-new-project">
            <Plus className="h-4 w-4 mr-2" />
            New Project
          </Button>
        </Link>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search projects..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
            data-testid="input-search"
          />
        </div>
        <Tabs value={statusFilter} onValueChange={setStatusFilter} className="w-full sm:w-auto">
          <TabsList>
            <TabsTrigger value="all" data-testid="tab-all">All</TabsTrigger>
            <TabsTrigger value="active" data-testid="tab-active">Active</TabsTrigger>
            <TabsTrigger value="on_hold" data-testid="tab-on-hold">On Hold</TabsTrigger>
            <TabsTrigger value="completed" data-testid="tab-completed">Completed</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map(i => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="space-y-2">
                <div className="h-4 bg-muted rounded w-1/3"></div>
                <div className="h-5 bg-muted rounded w-2/3"></div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="h-3 bg-muted rounded"></div>
                <div className="h-8 bg-muted rounded"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filteredProjects.length === 0 ? (
        <Card className="p-12 text-center">
          <div className="flex flex-col items-center gap-4">
            <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
              <FolderKanban className="h-8 w-8 text-muted-foreground" />
            </div>
            <div>
              <h3 className="font-semibold text-lg">No projects found</h3>
              <p className="text-muted-foreground mt-1">
                {searchQuery ? 'Try a different search term' : 'Projects are auto-created when agreements are signed'}
              </p>
            </div>
            <Link href="/projects/new">
              <Button variant="outline" data-testid="button-create-first">
                <Plus className="h-4 w-4 mr-2" />
                Create Project Manually
              </Button>
            </Link>
          </div>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredProjects.map((project) => (
            <Link key={project.id} href={`/projects/${project.id}`}>
              <Card className="hover-elevate cursor-pointer h-full" data-testid={`card-project-${project.id}`}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1 flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground font-mono">
                          {project.projectNumber}
                        </span>
                        {getStatusBadge(project.status)}
                      </div>
                      <CardTitle className="text-base truncate" data-testid={`text-project-name-${project.id}`}>
                        {project.projectName}
                      </CardTitle>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {project.quoteId && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setLocation(`/messages?dealId=${project.quoteId}&new=true`);
                          }}
                          title="Message about this deal"
                          data-testid={`button-message-project-${project.id}`}
                        >
                          <MessageSquare className="h-4 w-4" />
                        </Button>
                      )}
                      <ArrowRight className="h-4 w-4 text-muted-foreground mt-1" />
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Progress</span>
                      <span className="font-medium">{project.progressPercentage}%</span>
                    </div>
                    <Progress value={project.progressPercentage} className="h-2" />
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{formatStage(project.currentStage)}</span>
                      <span>{project.completedTasks}/{project.totalTasks} tasks</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <User className="h-3.5 w-3.5 flex-shrink-0" />
                      <span className="truncate">{project.borrowerName}</span>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <DollarSign className="h-3.5 w-3.5 flex-shrink-0" />
                      <span className="truncate">{formatCurrency(project.loanAmount)}</span>
                    </div>
                    {project.propertyAddress && (
                      <div className="flex items-center gap-2 text-muted-foreground col-span-2">
                        <Building2 className="h-3.5 w-3.5 flex-shrink-0" />
                        <span className="truncate">{project.propertyAddress}</span>
                      </div>
                    )}
                    {project.targetCloseDate && (
                      <div className="flex items-center gap-2 text-muted-foreground col-span-2">
                        <Calendar className="h-3.5 w-3.5 flex-shrink-0" />
                        <span>Target: {formatDate(project.targetCloseDate)}</span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
