import { useQuery } from '@tanstack/react-query';
import { useLocation, Link } from 'wouter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Home,
  FileText,
  MessageSquare,
  CheckCircle2,
  Clock,
  Loader2,
  Building2,
  DollarSign,
  ChevronRight,
  Video,
  Shield,
  Phone,
  ArrowRight
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';

interface Project {
  id: number;
  name: string;
  propertyAddress: string;
  status: string;
  createdAt: string;
  loanAmount: number;
  quoteId: number;
  stages?: Stage[];
}

interface Stage {
  id: number;
  name: string;
  status: string;
  sortOrder: number;
  completedAt: string | null;
}

const stageLabels: Record<string, string> = {
  'application': 'Application',
  'underwriting': 'Underwriting',
  'approval': 'Approval',
  'conditions': 'Conditions',
  'title': 'Title & Escrow',
  'appraisal': 'Appraisal',
  'final-review': 'Final Review',
  'closing': 'Closing',
  'funded': 'Funded'
};

export function BorrowerDashboard() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  const { data: projectsData, isLoading } = useQuery<{ projects: Project[] }>({
    queryKey: ['/api/deals'],
  });

  const { data: onboardingStatus } = useQuery({
    queryKey: ['/api/onboarding/status'],
  });

  const projects = projectsData?.projects || [];

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge variant="default" className="bg-primary">In Progress</Badge>;
      case 'completed':
        return <Badge variant="default" className="bg-success">Completed</Badge>;
      case 'on_hold':
        return <Badge variant="secondary">On Hold</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const calculateProgress = (stages?: Stage[]) => {
    if (!stages || stages.length === 0) return 0;
    const completedStages = stages.filter(s => s.status === 'completed').length;
    return Math.round((completedStages / stages.length) * 100);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Get training video for borrowers if available
  const borrowerTrainingVideo = (onboardingStatus as any)?.documents?.find(
    (d: any) => d.type === 'training_video' && (d.targetUserType === 'borrower' || d.targetUserType === 'all')
  );

  return (
    <div className="container max-w-4xl mx-auto py-6 px-4">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight mb-2">
          Welcome{user?.firstName ? `, ${user.firstName}` : ''}!
        </h1>
        <p className="text-muted-foreground">
          Track the progress of your loan and stay updated on important milestones.
        </p>
      </div>

      {borrowerTrainingVideo && (
        <Card className="mb-6 border-primary/20 bg-primary/5">
          <CardContent className="flex items-center gap-4 p-4">
            <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
              <Video className="h-6 w-6 text-primary" />
            </div>
            <div className="flex-1">
              <p className="font-medium">New to the loan process?</p>
              <p className="text-sm text-muted-foreground">
                Watch our quick video guide to understand how your loan will progress.
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => {
                const url = borrowerTrainingVideo.externalUrl || borrowerTrainingVideo.fileUrl;
                if (url) window.open(url, '_blank');
              }}
              data-testid="button-watch-training"
            >
              Watch Video
            </Button>
          </CardContent>
        </Card>
      )}

      {projects.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Home className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No Active Loans</h3>
            <p className="text-muted-foreground text-center max-w-md">
              You don't have any active loans yet. Once your loan application is submitted, 
              you'll be able to track its progress here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          <h2 className="text-lg font-semibold tracking-tight">Your Loans</h2>
          
          {projects.map((project) => {
            const progress = calculateProgress(project.stages);
            const currentStage = project.stages?.find(s => s.status === 'in_progress');
            
            return (
              <Card key={project.id} className="overflow-hidden">
                <CardHeader className="pb-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Building2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <CardTitle className="text-lg truncate">{project.propertyAddress}</CardTitle>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <DollarSign className="h-3 w-3" />
                          {project.loanAmount?.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 })}
                        </div>
                        {currentStage && (
                          <div className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            Currently: {stageLabels[currentStage.name] || currentStage.name}
                          </div>
                        )}
                      </div>
                    </div>
                    {getStatusBadge(project.status)}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="mb-4">
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-muted-foreground">Loan Progress</span>
                      <span className="font-medium">{progress}%</span>
                    </div>
                    <Progress value={progress} className="h-2" />
                  </div>

                  {project.stages && project.stages.length > 0 && (
                    <div className="mb-4">
                      <p className="text-sm font-medium mb-3">Loan Progress</p>
                      <div className="relative">
                        {/* Connection line */}
                        <div className="absolute top-3 left-3 right-3 h-0.5 bg-border" />
                        <div
                          className="absolute top-3 left-3 h-0.5 bg-success transition-all duration-500"
                          style={{
                            width: `${Math.max(0, (project.stages.filter(s => s.status === 'completed').length / Math.max(project.stages.length - 1, 1)) * 100)}%`,
                            maxWidth: 'calc(100% - 1.5rem)'
                          }}
                        />
                        {/* Stage dots and labels */}
                        <div className="relative flex justify-between">
                          {project.stages.slice().sort((a, b) => a.sortOrder - b.sortOrder).map((stage) => (
                            <div key={stage.id} className="flex flex-col items-center" style={{ width: `${100 / project.stages!.length}%` }}>
                              <div className={`
                                h-6 w-6 rounded-full flex items-center justify-center text-xs font-medium z-10
                                ${stage.status === 'completed'
                                  ? 'bg-success text-success-foreground'
                                  : stage.status === 'in_progress'
                                    ? 'bg-primary text-primary-foreground ring-4 ring-primary/20'
                                    : 'bg-muted text-muted-foreground border-2 border-border'
                                }
                              `}>
                                {stage.status === 'completed' ? (
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                ) : stage.status === 'in_progress' ? (
                                  <ArrowRight className="h-3 w-3" />
                                ) : (
                                  <span className="h-2 w-2 rounded-full bg-current opacity-40" />
                                )}
                              </div>
                              <span className={`text-[10px] mt-1.5 text-center leading-tight ${
                                stage.status === 'in_progress' ? 'font-semibold text-primary' :
                                stage.status === 'completed' ? 'text-success font-medium' :
                                'text-muted-foreground'
                              }`}>
                                {stageLabels[stage.name] || stage.name}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => setLocation(`/deals/${project.id}`)}
                      data-testid={`button-view-deal-${project.id}`}
                    >
                      View Details
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                    {project.quoteId && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setLocation(`/messages?dealId=${project.quoteId}&new=true`)}
                        title="Send a message"
                        data-testid={`button-message-deal-${project.id}`}
                      >
                        <MessageSquare className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <div className="mt-8 grid gap-4 md:grid-cols-3">
        <Card className="hover-elevate cursor-pointer transition-shadow hover:shadow-md" onClick={() => setLocation('/messages')}>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <MessageSquare className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium">Messages</p>
              <p className="text-sm text-muted-foreground">Contact your loan team</p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </CardContent>
        </Card>

        <Card className="hover-elevate cursor-pointer transition-shadow hover:shadow-md" onClick={() => setLocation('/resources')}>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="h-10 w-10 rounded-lg bg-info/10 flex items-center justify-center">
              <FileText className="h-5 w-5 text-info" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium">Resources</p>
              <p className="text-sm text-muted-foreground">Documents and guides</p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </CardContent>
        </Card>

        <Card className="hover-elevate cursor-pointer transition-shadow hover:shadow-md" onClick={() => setLocation('/borrower-quote')}>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="h-10 w-10 rounded-lg bg-success/10 flex items-center justify-center">
              <DollarSign className="h-5 w-5 text-success" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium">Get a Quote</p>
              <p className="text-sm text-muted-foreground">Instant loan pricing</p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </CardContent>
        </Card>
      </div>

      {/* Trust Signals */}
      <div className="mt-10 pt-6 border-t border-border">
        <div className="flex flex-wrap items-center justify-center gap-6 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <Shield className="h-3.5 w-3.5" />
            <span>256-bit encrypted</span>
          </div>
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span>FCRA & TILA compliant</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Phone className="h-3.5 w-3.5" />
            <span>Support available 8am–6pm EST</span>
          </div>
        </div>
      </div>
    </div>
  );
}
