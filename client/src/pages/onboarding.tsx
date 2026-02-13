import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileText,
  Video,
  ExternalLink,
  CheckCircle2,
  Loader2,
  ChevronRight,
  ChevronLeft,
  Play,
  BookOpen,
  Shield,
  MessageSquare,
  BarChart3,
  Zap,
  Check,
  Volume2,
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

const STEPS = [
  { id: 1, label: 'Welcome', name: 'welcome' },
  { id: 2, label: 'Video', name: 'video' },
  { id: 3, label: 'Agreement', name: 'agreement' },
  { id: 4, label: 'Tour', name: 'tour' },
  { id: 5, label: 'Start', name: 'start' },
];

const ACCOUNT_TYPE_DESCRIPTIONS: { [key: string]: string } = {
  broker: "You'll be submitting deals and tracking your pipeline",
  lender: "You'll be managing your lending operations",
  borrower: "You'll be tracking your loan progress",
};

export default function OnboardingPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [currentStep, setCurrentStep] = useState(1);
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
        title: 'Welcome!',
        description: 'Your onboarding is complete. You can now access all features.',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] });
      const dashboardUrl = user?.userType === 'admin' ? '/admin' : '/';
      setLocation(dashboardUrl);
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

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!status) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Failed to load onboarding status</p>
      </div>
    );
  }

  const partnershipAgreement = status.documents.find(d => d.type === 'partnership_agreement');
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
    handleNext();
  };

  const handleNext = () => {
    if (currentStep < STEPS.length) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const isBroker = user?.userType === 'broker';
  const accountTypeDesc = ACCOUNT_TYPE_DESCRIPTIONS[user?.userType?.toLowerCase() || 'broker'];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Step Indicator */}
      <div className="border-b border-border bg-card/50 backdrop-blur-sm">
        <div className="container max-w-6xl mx-auto px-4 py-8">
          <div className="flex items-center justify-center gap-2">
            {STEPS.map((step, idx) => (
              <div key={step.id} className="flex items-center gap-2">
                <div className="flex flex-col items-center">
                  <div className={`h-10 w-10 rounded-full flex items-center justify-center font-medium transition-all ${
                    currentStep > step.id
                      ? 'bg-green-500 text-white'
                      : currentStep === step.id
                      ? 'bg-primary text-primary-foreground ring-2 ring-primary ring-offset-2'
                      : 'bg-muted text-muted-foreground'
                  }`}>
                    {currentStep > step.id ? (
                      <Check className="h-5 w-5" />
                    ) : (
                      step.id
                    )}
                  </div>
                  <span className="text-xs font-medium text-muted-foreground mt-2">{step.label}</span>
                </div>
                {idx < STEPS.length - 1 && (
                  <div className={`h-1 w-12 mx-2 rounded-full transition-colors ${
                    currentStep > step.id ? 'bg-green-500' : 'bg-muted'
                  }`} />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 flex items-center justify-center py-12 px-4">
        <div className="w-full max-w-2xl">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
              className="w-full"
            >
              {/* Step 1: Welcome */}
              {currentStep === 1 && (
                <div className="text-center space-y-8">
                  <div>
                    <h1 className="text-5xl font-bold mb-4">Welcome to Lendry.AI</h1>
                    <p className="text-xl text-muted-foreground">Let's get you set up in minutes</p>
                  </div>

                  <div className="bg-card border border-border rounded-lg p-8 space-y-4">
                    <h2 className="text-2xl font-semibold">{user?.userType?.charAt(0).toUpperCase() + user?.userType?.slice(1) || 'User'}</h2>
                    <p className="text-lg text-muted-foreground">{accountTypeDesc}</p>
                  </div>

                  <Button
                    onClick={handleNext}
                    size="lg"
                    className="w-full"
                  >
                    Get Started
                    <ChevronRight className="ml-2 h-5 w-5" />
                  </Button>
                </div>
              )}

              {/* Step 2: Training Video */}
              {currentStep === 2 && (
                <div className="space-y-8">
                  <div className="text-center space-y-2">
                    <h2 className="text-4xl font-bold">Platform Overview</h2>
                    <p className="text-muted-foreground">Watch a brief overview of how Lendry.AI works</p>
                  </div>

                  <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-xl overflow-hidden aspect-video flex items-center justify-center relative">
                    <div className="absolute inset-0 bg-black/20" />
                    <div className="relative z-10 flex flex-col items-center gap-6">
                      <div className="h-24 w-24 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center border-2 border-white/20 hover:border-white/40 transition-colors cursor-pointer hover:bg-white/20">
                        <Play className="h-10 w-10 text-white fill-white" />
                      </div>
                      <p className="text-white text-sm font-medium">Click to play</p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <p className="text-center text-sm text-muted-foreground">
                      This video covers the essentials to get you started with our platform
                    </p>
                  </div>

                  <div className="flex gap-4 justify-center">
                    <Button
                      variant="outline"
                      onClick={handleNext}
                    >
                      Skip
                    </Button>
                    <Button
                      onClick={handleNext}
                    >
                      Continue
                      <ChevronRight className="ml-2 h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}

              {/* Step 3: Agreement */}
              {currentStep === 3 && (
                <div className="space-y-6">
                  <div className="text-center space-y-2">
                    <h2 className="text-4xl font-bold">Partnership Agreement</h2>
                    <p className="text-muted-foreground">Please review and sign our partnership agreement</p>
                  </div>

                  {status.agreementSigned ? (
                    <div className="flex items-center gap-4 p-6 bg-green-50 dark:bg-green-950 rounded-lg border border-green-200 dark:border-green-800">
                      <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400 flex-shrink-0" />
                      <div>
                        <p className="font-semibold text-green-900 dark:text-green-100">Agreement Signed</p>
                        <p className="text-sm text-green-800 dark:text-green-200">
                          Signed on {new Date(status.user.partnershipAgreementSignedAt!).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="bg-card border border-border rounded-lg p-6 max-h-[400px] overflow-y-auto">
                        <div className="space-y-4 text-sm">
                          <p>
                            <strong>Partnership Agreement Summary</strong>
                          </p>
                          <ul className="space-y-2 text-muted-foreground list-disc list-inside">
                            <li>By signing, you agree to the terms and conditions outlined herein</li>
                            <li>Commission rates and payment terms are clearly defined</li>
                            <li>You represent that all information provided is accurate and complete</li>
                            <li>This agreement can be terminated by either party with written notice</li>
                            <li>Please review the full agreement document before proceeding</li>
                          </ul>
                        </div>
                      </div>

                      {partnershipAgreement && (partnershipAgreement.fileUrl || partnershipAgreement.externalUrl) && (
                        <Button
                          variant="outline"
                          className="w-full justify-center gap-2"
                          onClick={() => {
                            if (partnershipAgreement.externalUrl) {
                              window.open(partnershipAgreement.externalUrl, '_blank');
                            } else if (partnershipAgreement.fileUrl) {
                              window.open(partnershipAgreement.fileUrl, '_blank');
                            }
                          }}
                        >
                          <FileText className="h-4 w-4" />
                          View Full Agreement
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      )}

                      <div className="flex items-start gap-3">
                        <Checkbox
                          id="agree-terms"
                          checked={agreedToTerms}
                          onCheckedChange={(checked) => setAgreedToTerms(checked as boolean)}
                        />
                        <label htmlFor="agree-terms" className="text-sm cursor-pointer flex-1">
                          I have read and agree to the Partnership Agreement terms and conditions. I understand that by clicking "Sign Agreement" below, I am electronically signing this agreement.
                        </label>
                      </div>
                    </>
                  )}

                  <div className="flex gap-4">
                    <Button
                      variant="outline"
                      onClick={handleBack}
                    >
                      <ChevronLeft className="mr-2 h-4 w-4" />
                      Back
                    </Button>
                    {status.agreementSigned ? (
                      <Button
                        onClick={handleNext}
                        className="flex-1"
                      >
                        Continue
                        <ChevronRight className="ml-2 h-4 w-4" />
                      </Button>
                    ) : (
                      <Button
                        onClick={handleSignAgreement}
                        disabled={!agreedToTerms || updateProgressMutation.isPending}
                        className="flex-1"
                      >
                        {updateProgressMutation.isPending ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Signing...
                          </>
                        ) : (
                          <>
                            Sign Agreement
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {/* Step 4: Platform Tour */}
              {currentStep === 4 && (
                <div className="space-y-8">
                  <div className="text-center space-y-2">
                    <h2 className="text-4xl font-bold">Platform Features</h2>
                    <p className="text-muted-foreground">Here's what you'll have access to</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Dashboard */}
                    <div className="bg-card border border-border rounded-lg p-6 space-y-3 hover:border-primary/50 transition-colors">
                      <div className="h-10 w-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                        <BarChart3 className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                      </div>
                      <h3 className="font-semibold text-lg">Dashboard</h3>
                      <p className="text-sm text-muted-foreground">Your command center for pipeline overview and key metrics</p>
                    </div>

                    {/* Deals Pipeline */}
                    <div className="bg-card border border-border rounded-lg p-6 space-y-3 hover:border-primary/50 transition-colors">
                      <div className="h-10 w-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                        <CheckCircle2 className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                      </div>
                      <h3 className="font-semibold text-lg">Deals Pipeline</h3>
                      <p className="text-sm text-muted-foreground">Track every loan through stages and manage progress</p>
                    </div>

                    {/* Document Review */}
                    <div className="bg-card border border-border rounded-lg p-6 space-y-3 hover:border-primary/50 transition-colors">
                      <div className="h-10 w-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                        <FileText className="h-5 w-5 text-green-600 dark:text-green-400" />
                      </div>
                      <h3 className="font-semibold text-lg">Lane™ Document Review</h3>
                      <p className="text-sm text-muted-foreground">AI reads and verifies documents for accuracy</p>
                    </div>

                    {/* AI Assistant */}
                    <div className="bg-card border border-border rounded-lg p-6 space-y-3 hover:border-primary/50 transition-colors">
                      <div className="h-10 w-10 rounded-lg bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                        <Volume2 className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                      </div>
                      <h3 className="font-semibold text-lg">Your Assistant</h3>
                      <p className="text-sm text-muted-foreground">Voice + text AI helper, always available to support you</p>
                    </div>

                    {/* Messages */}
                    <div className="bg-card border border-border rounded-lg p-6 space-y-3 hover:border-primary/50 transition-colors">
                      <div className="h-10 w-10 rounded-lg bg-pink-100 dark:bg-pink-900/30 flex items-center justify-center">
                        <MessageSquare className="h-5 w-5 text-pink-600 dark:text-pink-400" />
                      </div>
                      <h3 className="font-semibold text-lg">Messages</h3>
                      <p className="text-sm text-muted-foreground">Communicate with borrowers and team members</p>
                    </div>

                    {/* Smart Prospect - Broker Only */}
                    {isBroker && (
                      <div className="bg-card border border-border rounded-lg p-6 space-y-3 hover:border-primary/50 transition-colors">
                        <div className="h-10 w-10 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
                          <Zap className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                        </div>
                        <h3 className="font-semibold text-lg">Smart Prospect</h3>
                        <p className="text-sm text-muted-foreground">AI-powered outreach to grow your business</p>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-4">
                    <Button
                      variant="outline"
                      onClick={handleBack}
                    >
                      <ChevronLeft className="mr-2 h-4 w-4" />
                      Back
                    </Button>
                    <Button
                      onClick={handleNext}
                      className="flex-1"
                    >
                      Continue
                      <ChevronRight className="ml-2 h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}

              {/* Step 5: Get Started */}
              {currentStep === 5 && (
                <div className="space-y-8 text-center">
                  <div className="flex justify-center">
                    <div className="relative">
                      <div className="absolute inset-0 bg-green-500/20 rounded-full blur-2xl" />
                      <div className="relative h-24 w-24 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center border-2 border-green-500">
                        <Check className="h-12 w-12 text-green-600 dark:text-green-400" />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h2 className="text-4xl font-bold">You're all set!</h2>
                    <p className="text-lg text-muted-foreground">
                      Your account is ready to go. You now have access to all platform features including the dashboard, pipeline management, AI document review, and more.
                    </p>
                  </div>

                  <div className="bg-card border border-border rounded-lg p-6 space-y-3 text-left">
                    <h3 className="font-semibold">What's next:</h3>
                    <ul className="space-y-2 text-sm text-muted-foreground">
                      <li className="flex items-start gap-3">
                        <Check className="h-4 w-4 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                        <span>Access your dashboard to get an overview of your activity</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <Check className="h-4 w-4 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                        <span>Use the AI assistant to help with questions and tasks</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <Check className="h-4 w-4 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                        <span>Start creating and managing your pipeline</span>
                      </li>
                    </ul>
                  </div>

                  <div className="flex gap-4 flex-col">
                    <Button
                      onClick={() => completeOnboardingMutation.mutate()}
                      disabled={completeOnboardingMutation.isPending}
                      size="lg"
                      className="w-full"
                    >
                      {completeOnboardingMutation.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Getting ready...
                        </>
                      ) : (
                        <>
                          Go to Dashboard
                          <ChevronRight className="ml-2 h-4 w-4" />
                        </>
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={handleBack}
                      disabled={completeOnboardingMutation.isPending}
                    >
                      <ChevronLeft className="mr-2 h-4 w-4" />
                      Back
                    </Button>
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
