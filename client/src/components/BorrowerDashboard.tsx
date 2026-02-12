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
  Video
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
        return <Badge variant="default" className="bg-blue-500">In Progress</Badge>;
      case 'completed':
        return <Badge variant="default" className="bg-green-500">Completed</Badge>;
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
        <h1 className="text-2xl font-bold mb-2">
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
          <h2 className="text-lg font-semibold">Your Loans</h2>
          
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
                    <div className="space-y-2 mb-4">
                      <p className="text-sm font-medium">Milestones</p>
                      <div className="flex flex-wrap gap-2">
                        {project.stages.slice().sort((a, b) => a.sortOrder - b.sortOrder).map((stage) => (
                          <Badge
                            key={stage.id}
                            variant={stage.status === 'completed' ? 'default' : 'outline'}
                            className={stage.status === 'completed' ? 'bg-green-500' : stage.status === 'in_progress' ? 'border-blue-500 text-blue-500' : ''}
                          >
                            {stage.status === 'completed' && <CheckCircle2 className="h-3 w-3 mr-1" />}
                            {stage.status === 'in_progress' && <Clock className="h-3 w-3 mr-1" />}
                            {stageLabels[stage.name] || stage.name}
                          </Badge>
                        ))}
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

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <Card className="hover-elevate cursor-pointer" onClick={() => setLocation('/messages')}>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
              <MessageSquare className="h-5 w-5" />
            </div>
            <div>
              <p className="font-medium">Messages</p>
              <p className="text-sm text-muted-foreground">Contact your loan team</p>
            </div>
            <ChevronRight className="h-4 w-4 ml-auto text-muted-foreground" />
          </CardContent>
        </Card>

        <Card className="hover-elevate cursor-pointer" onClick={() => setLocation('/resources')}>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <p className="font-medium">Resources</p>
              <p className="text-sm text-muted-foreground">Helpful documents and guides</p>
            </div>
            <ChevronRight className="h-4 w-4 ml-auto text-muted-foreground" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
