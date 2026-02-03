import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { 
  FileText, 
  Video, 
  ExternalLink, 
  CheckCircle2, 
  Clock, 
  Loader2, 
  ChevronRight, 
  Pen,
  BookOpen,
  Shield
} from 'lucide-react';

interface OnboardingDocument {
  id: number;
  type: string;
  title: string;
  description: string | null;
  fileUrl: string | null;
  externalUrl: string | null;
  thumbnailUrl: string | null;
  sortOrder: number;
  isRequired: boolean;
  progress: {
    id: number;
    status: string;
    signedAt: string | null;
    completedAt: string | null;
  } | null;
}

interface OnboardingStatus {
  user: {
    id: number;
    userType: string;
    onboardingCompleted: boolean;
    partnershipAgreementSignedAt: string | null;
    trainingCompletedAt: string | null;
  };
  documents: OnboardingDocument[];
  agreementSigned: boolean;
  trainingCompleted: boolean;
  canProceed: boolean;
}

export default function OnboardingPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('agreement');
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  const { data: status, isLoading } = useQuery<OnboardingStatus>({
    queryKey: ['/api/onboarding/status'],
  });

  const updateProgressMutation = useMutation({
    mutationFn: async (data: { documentId: number; status: string; signatureData?: string }) => {
      const res = await apiRequest('POST', '/api/onboarding/progress', data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/onboarding/status'] });
    },
  });

  const completeOnboardingMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/onboarding/complete', {});
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: 'Welcome to Sphinx Capital!',
        description: 'Your onboarding is complete. You can now access all features.',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] });
      setLocation('/');
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error?.message || 'Failed to complete onboarding',
        variant: 'destructive',
      });
    },
  });

  // Redirect if onboarding is already complete
  useEffect(() => {
    if (status?.user?.onboardingCompleted) {
      setLocation('/');
    }
  }, [status, setLocation]);

  // Auto-advance to training tab when agreement is signed
  useEffect(() => {
    if (status?.agreementSigned && activeTab === 'agreement') {
      const hasTrainingDocs = status.documents.some(d => d.type !== 'partnership_agreement');
      if (hasTrainingDocs) {
        setActiveTab('training');
      }
    }
  }, [status?.agreementSigned, activeTab, status?.documents]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!status) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Failed to load onboarding status</p>
      </div>
    );
  }

  const partnershipAgreement = status.documents.find(d => d.type === 'partnership_agreement');
  const trainingDocs = status.documents.filter(d => d.type !== 'partnership_agreement');
  const completedTrainingCount = trainingDocs.filter(d => 
    d.progress && (d.progress.status === 'completed' || d.progress.status === 'viewed')
  ).length;
  const trainingProgress = trainingDocs.length > 0 ? (completedTrainingCount / trainingDocs.length) * 100 : 100;

  const handleSignAgreement = async () => {
    if (!partnershipAgreement || !agreedToTerms) return;
    
    await updateProgressMutation.mutateAsync({
      documentId: partnershipAgreement.id,
      status: 'signed',
      signatureData: `${user?.firstName} ${user?.lastName} - ${new Date().toISOString()}`
    });
    
    toast({
      title: 'Agreement Signed',
      description: 'Thank you for signing the partnership agreement.',
    });
  };

  const handleViewDocument = async (doc: OnboardingDocument) => {
    if (!doc.progress || doc.progress.status === 'viewed') {
      // Mark as viewed if not already
      if (!doc.progress) {
        await updateProgressMutation.mutateAsync({
          documentId: doc.id,
          status: 'viewed'
        });
      }
    }
    
    // Open the document
    if (doc.externalUrl) {
      window.open(doc.externalUrl, '_blank');
    } else if (doc.fileUrl) {
      window.open(doc.fileUrl, '_blank');
    }
  };

  const handleCompleteTraining = async (doc: OnboardingDocument) => {
    await updateProgressMutation.mutateAsync({
      documentId: doc.id,
      status: 'completed'
    });
  };

  const getDocumentIcon = (type: string) => {
    switch (type) {
      case 'training_video':
        return <Video className="h-5 w-5" />;
      case 'training_link':
        return <ExternalLink className="h-5 w-5" />;
      case 'partnership_agreement':
        return <Shield className="h-5 w-5" />;
      default:
        return <FileText className="h-5 w-5" />;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-4xl mx-auto py-8 px-4">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">Welcome to Sphinx Capital</h1>
          <p className="text-muted-foreground">
            Complete the following steps to get started as a broker partner
          </p>
        </div>

        <div className="flex items-center justify-center gap-4 mb-8">
          <div className="flex items-center gap-2">
            <div className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-medium ${
              status.agreementSigned ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
            }`}>
              {status.agreementSigned ? <CheckCircle2 className="h-5 w-5" /> : '1'}
            </div>
            <span className={status.agreementSigned ? 'font-medium' : 'text-muted-foreground'}>
              Partnership Agreement
            </span>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
          <div className="flex items-center gap-2">
            <div className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-medium ${
              status.trainingCompleted ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
            }`}>
              {status.trainingCompleted ? <CheckCircle2 className="h-5 w-5" /> : '2'}
            </div>
            <span className={status.trainingCompleted ? 'font-medium' : 'text-muted-foreground'}>
              Training Materials
            </span>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
          <div className="flex items-center gap-2">
            <div className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-medium ${
              status.canProceed ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
            }`}>
              {status.canProceed ? <CheckCircle2 className="h-5 w-5" /> : '3'}
            </div>
            <span className={status.canProceed ? 'font-medium' : 'text-muted-foreground'}>
              Get Started
            </span>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2 mb-6">
            <TabsTrigger value="agreement" className="flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Partnership Agreement
              {status.agreementSigned && <CheckCircle2 className="h-4 w-4 text-green-500" />}
            </TabsTrigger>
            <TabsTrigger value="training" className="flex items-center gap-2" disabled={!status.agreementSigned && !!partnershipAgreement}>
              <BookOpen className="h-4 w-4" />
              Training Materials
              {status.trainingCompleted && <CheckCircle2 className="h-4 w-4 text-green-500" />}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="agreement">
            {partnershipAgreement ? (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="h-5 w-5" />
                    {partnershipAgreement.title}
                  </CardTitle>
                  {partnershipAgreement.description && (
                    <CardDescription>{partnershipAgreement.description}</CardDescription>
                  )}
                </CardHeader>
                <CardContent>
                  {status.agreementSigned ? (
                    <div className="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-950 rounded-lg">
                      <CheckCircle2 className="h-6 w-6 text-green-500" />
                      <div>
                        <p className="font-medium text-green-700 dark:text-green-300">Agreement Signed</p>
                        <p className="text-sm text-green-600 dark:text-green-400">
                          Signed on {new Date(status.user.partnershipAgreementSignedAt!).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {(partnershipAgreement.fileUrl || partnershipAgreement.externalUrl) && (
                        <Button
                          variant="outline"
                          className="w-full justify-start gap-2"
                          onClick={() => handleViewDocument(partnershipAgreement)}
                        >
                          <FileText className="h-4 w-4" />
                          View Partnership Agreement
                          <ExternalLink className="h-4 w-4 ml-auto" />
                        </Button>
                      )}
                      
                      <div className="border rounded-lg p-4 bg-muted/50">
                        <h4 className="font-medium mb-4">Agreement Summary</h4>
                        <ul className="space-y-2 text-sm text-muted-foreground">
                          <li>By signing, you agree to refer loans to Sphinx Capital in accordance with our guidelines</li>
                          <li>Commission rates and payment terms are outlined in the agreement</li>
                          <li>You represent that all information provided is accurate and complete</li>
                          <li>This agreement can be terminated by either party with written notice</li>
                        </ul>
                      </div>

                      <div className="flex items-start gap-3">
                        <Checkbox
                          id="agree-terms"
                          checked={agreedToTerms}
                          onCheckedChange={(checked) => setAgreedToTerms(checked as boolean)}
                          data-testid="checkbox-agree-terms"
                        />
                        <label htmlFor="agree-terms" className="text-sm cursor-pointer">
                          I have read and agree to the Partnership Agreement terms and conditions. I understand that by clicking "Sign Agreement" below, I am electronically signing this agreement.
                        </label>
                      </div>

                      <Button
                        className="w-full"
                        disabled={!agreedToTerms || updateProgressMutation.isPending}
                        onClick={handleSignAgreement}
                        data-testid="button-sign-agreement"
                      >
                        {updateProgressMutation.isPending ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Signing...
                          </>
                        ) : (
                          <>
                            <Pen className="mr-2 h-4 w-4" />
                            Sign Agreement
                          </>
                        )}
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <CheckCircle2 className="h-12 w-12 text-green-500 mb-4" />
                  <p className="text-lg font-medium">No Partnership Agreement Required</p>
                  <p className="text-muted-foreground">Please proceed to the training materials.</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="training">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <BookOpen className="h-5 w-5" />
                      Training Materials
                    </CardTitle>
                    <CardDescription>
                      Review these materials to learn about our loan programs and processes
                    </CardDescription>
                  </div>
                  <Badge variant={status.trainingCompleted ? 'default' : 'secondary'}>
                    {completedTrainingCount}/{trainingDocs.length} Completed
                  </Badge>
                </div>
                {trainingDocs.length > 0 && (
                  <Progress value={trainingProgress} className="mt-4" />
                )}
              </CardHeader>
              <CardContent>
                {trainingDocs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8">
                    <CheckCircle2 className="h-12 w-12 text-green-500 mb-4" />
                    <p className="text-lg font-medium">No Training Required</p>
                    <p className="text-muted-foreground">You can proceed to use the platform.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {trainingDocs.map((doc) => (
                      <div
                        key={doc.id}
                        className="flex items-center gap-4 p-4 border rounded-lg"
                      >
                        <div className="flex-shrink-0">
                          {doc.progress?.status === 'completed' || doc.progress?.status === 'viewed' ? (
                            <div className="h-10 w-10 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center">
                              <CheckCircle2 className="h-5 w-5 text-green-500" />
                            </div>
                          ) : (
                            <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                              {getDocumentIcon(doc.type)}
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-medium truncate">{doc.title}</p>
                            {doc.isRequired && (
                              <Badge variant="outline" className="text-xs">Required</Badge>
                            )}
                          </div>
                          {doc.description && (
                            <p className="text-sm text-muted-foreground truncate">{doc.description}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {doc.progress?.status === 'completed' ? (
                            <Badge variant="default" className="bg-green-500">
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              Completed
                            </Badge>
                          ) : doc.progress?.status === 'viewed' ? (
                            <>
                              <Badge variant="secondary">
                                <Clock className="h-3 w-3 mr-1" />
                                Viewed
                              </Badge>
                              <Button
                                size="sm"
                                onClick={() => handleCompleteTraining(doc)}
                                disabled={updateProgressMutation.isPending}
                                data-testid={`button-complete-${doc.id}`}
                              >
                                Mark Complete
                              </Button>
                            </>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleViewDocument(doc)}
                              data-testid={`button-view-${doc.id}`}
                            >
                              {doc.type === 'training_video' ? 'Watch' : 'View'}
                              <ExternalLink className="h-3 w-3 ml-1" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {status.canProceed && (
          <div className="mt-8 text-center">
            <Button
              size="lg"
              onClick={() => completeOnboardingMutation.mutate()}
              disabled={completeOnboardingMutation.isPending}
              data-testid="button-complete-onboarding"
            >
              {completeOnboardingMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Completing...
                </>
              ) : (
                <>
                  Complete Onboarding & Enter Platform
                  <ChevronRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        )}

        <div className="mt-8 text-center text-sm text-muted-foreground">
          <p>Need help? Contact us at support@sphinxcap.com</p>
        </div>
      </div>
    </div>
  );
}
