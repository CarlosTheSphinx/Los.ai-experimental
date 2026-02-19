import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  CheckCircle2,
  Play,
  Shield,
  BookOpen,
  Rocket,
  ChevronRight,
  ChevronLeft,
  BarChart3,
  FolderKanban,
  Zap,
  MessageSquare,
  Target,
  Inbox,
  DollarSign,
  FileText,
} from "lucide-react";

interface OnboardingStep {
  id: number;
  name: string;
  label: string;
  enabled: boolean;
  order: number;
  content: {
    title: string;
    subtitle?: string;
    description?: string;
    url?: string;
    skipEnabled?: boolean;
    body?: string;
    checkboxLabel?: string;
    required?: boolean;
    cards?: Array<{
      id: string;
      icon: string;
      title: string;
      description: string;
      enabled: boolean;
    }>;
    message?: string;
  };
}

interface OnboardingConfig {
  steps: OnboardingStep[];
}

const BORROWER_DEFAULT_STEPS: OnboardingStep[] = [
  {
    id: 1, name: "welcome", label: "Welcome", enabled: true, order: 1,
    content: {
      title: "Welcome",
      subtitle: "Let's get you set up",
      description: "We're excited to have you on board. Let's walk through a quick setup.",
    },
  },
  {
    id: 2, name: "video", label: "Video", enabled: true, order: 2,
    content: {
      title: "Platform Overview",
      description: "Watch a quick walkthrough of the platform features.",
      url: "",
      skipEnabled: true,
    },
  },
  {
    id: 3, name: "agreement", label: "Agreement", enabled: true, order: 3,
    content: {
      title: "Agreement",
      body: "By continuing, you acknowledge that you have read and agree to the terms and conditions.",
      checkboxLabel: "I have read and agree to the terms",
      required: true,
    },
  },
  {
    id: 4, name: "tour", label: "Tour", enabled: true, order: 4,
    content: {
      title: "Your Portal",
      description: "Here's what you can do:",
      cards: [
        { id: "inbox", icon: "Inbox", title: "Inbox", description: "View messages and updates about your loan.", enabled: true },
        { id: "loans", icon: "FileText", title: "Loans", description: "Upload documents and track your loan progress.", enabled: true },
      ],
    },
  },
  {
    id: 5, name: "start", label: "Start", enabled: true, order: 5,
    content: {
      title: "You're All Set!",
      message: "Your portal is ready. Let's get started.",
    },
  },
];

const BROKER_DEFAULT_STEPS: OnboardingStep[] = [
  {
    id: 1, name: "welcome", label: "Welcome", enabled: true, order: 1,
    content: {
      title: "Welcome",
      subtitle: "Let's get you set up",
      description: "We're excited to have you on board. Let's walk through a quick setup.",
    },
  },
  {
    id: 2, name: "video", label: "Video", enabled: true, order: 2,
    content: {
      title: "Platform Overview",
      description: "Watch a quick walkthrough of the platform features.",
      url: "",
      skipEnabled: true,
    },
  },
  {
    id: 3, name: "agreement", label: "Agreement", enabled: true, order: 3,
    content: {
      title: "Partnership Agreement",
      body: "By signing this agreement, you acknowledge that you have read and agree to the terms and conditions of our partnership program.",
      checkboxLabel: "I have read and agree to the partnership agreement",
      required: true,
    },
  },
  {
    id: 4, name: "tour", label: "Tour", enabled: true, order: 4,
    content: {
      title: "Your Broker Portal",
      description: "Here's what you can do:",
      cards: [
        { id: "inbox", icon: "Inbox", title: "Inbox", description: "View messages and notifications about your deals.", enabled: true },
        { id: "loans", icon: "FileText", title: "Loans", description: "Track deals, upload documents, and monitor progress.", enabled: true },
        { id: "commissions", icon: "DollarSign", title: "Commissions", description: "Track your earnings and commission payments.", enabled: true },
      ],
    },
  },
  {
    id: 5, name: "start", label: "Start", enabled: true, order: 5,
    content: {
      title: "You're All Set!",
      message: "Your portal is ready. Let's get started.",
    },
  },
];

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  BarChart3, FolderKanban, Zap, MessageSquare, Target, Inbox, DollarSign, FileText, BookOpen, Shield,
};

function getIcon(iconName: string) {
  return ICON_MAP[iconName] || BarChart3;
}

const STEP_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  welcome: CheckCircle2,
  video: Play,
  agreement: Shield,
  tour: BookOpen,
  start: Rocket,
};

interface PortalOnboardingProps {
  config?: OnboardingConfig | null;
  portalType: "broker" | "borrower";
  token: string;
  onComplete: () => void;
}

export function PortalOnboarding({ config, portalType, token, onComplete }: PortalOnboardingProps) {
  const defaultSteps = portalType === "broker" ? BROKER_DEFAULT_STEPS : BORROWER_DEFAULT_STEPS;
  const steps = (config?.steps || defaultSteps)
    .filter(s => s.enabled)
    .sort((a, b) => a.order - b.order);

  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  const currentStep = steps[currentStepIndex];
  if (!currentStep) return null;

  const isLastStep = currentStepIndex === steps.length - 1;
  const isFirstStep = currentStepIndex === 0;
  const StepIcon = STEP_ICONS[currentStep.name] || CheckCircle2;

  const handleNext = () => {
    if (isLastStep) {
      localStorage.setItem(`portal_onboarding_${portalType}_${token}`, "completed");
      onComplete();
    } else {
      setCurrentStepIndex(prev => prev + 1);
    }
  };

  const handleBack = () => {
    if (!isFirstStep) {
      setCurrentStepIndex(prev => prev - 1);
    }
  };

  const canProceed = () => {
    if (currentStep.name === "agreement" && currentStep.content.required) {
      return agreedToTerms;
    }
    return true;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center p-4" data-testid="portal-onboarding">
      <div className="w-full max-w-lg">
        <div className="flex items-center justify-center gap-2 mb-6">
          {steps.map((step, idx) => (
            <div key={step.id} className="flex items-center gap-2">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium transition-colors ${
                  idx < currentStepIndex
                    ? "bg-blue-600 text-white"
                    : idx === currentStepIndex
                      ? "bg-blue-600 text-white ring-4 ring-blue-100"
                      : "bg-gray-200 text-gray-500"
                }`}
              >
                {idx < currentStepIndex ? <CheckCircle2 className="h-4 w-4" /> : idx + 1}
              </div>
              {idx < steps.length - 1 && (
                <div className={`w-8 h-0.5 ${idx < currentStepIndex ? "bg-blue-600" : "bg-gray-200"}`} />
              )}
            </div>
          ))}
        </div>

        <Card className="shadow-lg">
          <CardHeader className="text-center pb-2">
            <div className="flex justify-center mb-3">
              <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                <StepIcon className="h-6 w-6 text-blue-600" />
              </div>
            </div>
            <CardTitle className="text-xl">{currentStep.content.title}</CardTitle>
            {currentStep.content.subtitle && (
              <p className="text-sm text-muted-foreground mt-1">{currentStep.content.subtitle}</p>
            )}
          </CardHeader>

          <CardContent className="pt-2">
            {currentStep.name === "welcome" && (
              <div className="text-center py-4">
                <p className="text-sm text-gray-600">{currentStep.content.description}</p>
              </div>
            )}

            {currentStep.name === "video" && (
              <div className="py-4">
                {currentStep.content.url ? (
                  <div className="aspect-video bg-black rounded-lg overflow-hidden">
                    <iframe
                      src={currentStep.content.url}
                      className="w-full h-full"
                      allow="autoplay; fullscreen"
                      allowFullScreen
                    />
                  </div>
                ) : (
                  <div className="aspect-video bg-gray-100 rounded-lg flex items-center justify-center">
                    <div className="text-center">
                      <Play className="h-12 w-12 text-gray-400 mx-auto mb-2" />
                      <p className="text-sm text-gray-500">Video coming soon</p>
                    </div>
                  </div>
                )}
                {currentStep.content.description && (
                  <p className="text-sm text-gray-600 mt-3 text-center">{currentStep.content.description}</p>
                )}
              </div>
            )}

            {currentStep.name === "agreement" && (
              <div className="py-4 space-y-4">
                <div className="bg-gray-50 rounded-lg p-4 max-h-48 overflow-y-auto">
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{currentStep.content.body}</p>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="agree-terms"
                    checked={agreedToTerms}
                    onCheckedChange={(checked) => setAgreedToTerms(checked === true)}
                    data-testid="checkbox-agree-terms"
                  />
                  <label htmlFor="agree-terms" className="text-sm text-gray-700 cursor-pointer">
                    {currentStep.content.checkboxLabel || "I agree to the terms"}
                  </label>
                </div>
              </div>
            )}

            {currentStep.name === "tour" && (
              <div className="py-4 space-y-3">
                {currentStep.content.description && (
                  <p className="text-sm text-gray-600 mb-3">{currentStep.content.description}</p>
                )}
                {currentStep.content.cards?.filter(c => c.enabled).map((card) => {
                  const CardIcon = getIcon(card.icon);
                  return (
                    <div key={card.id} className="flex items-start gap-3 p-3 rounded-lg border bg-white">
                      <div className="w-8 h-8 rounded-md bg-blue-50 flex items-center justify-center flex-shrink-0">
                        <CardIcon className="h-4 w-4 text-blue-600" />
                      </div>
                      <div>
                        <h4 className="text-sm font-medium text-gray-900">{card.title}</h4>
                        <p className="text-xs text-gray-500 mt-0.5">{card.description}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {currentStep.name === "start" && (
              <div className="text-center py-6">
                <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                  <Rocket className="h-8 w-8 text-green-600" />
                </div>
                <p className="text-sm text-gray-600">{currentStep.content.message}</p>
              </div>
            )}

            <div className="flex items-center justify-between pt-4 border-t mt-4">
              <Button
                variant="outline"
                onClick={handleBack}
                disabled={isFirstStep}
                className="gap-1"
                data-testid="button-onboarding-back"
              >
                <ChevronLeft className="h-4 w-4" />
                Back
              </Button>

              <div className="flex items-center gap-2">
                {currentStep.name === "video" && currentStep.content.skipEnabled && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleNext}
                    data-testid="button-onboarding-skip"
                  >
                    Skip
                  </Button>
                )}
                <Button
                  onClick={handleNext}
                  disabled={!canProceed()}
                  className="gap-1"
                  data-testid="button-onboarding-next"
                >
                  {isLastStep ? "Get Started" : "Next"}
                  {!isLastStep && <ChevronRight className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export function hasCompletedOnboarding(portalType: "broker" | "borrower", token: string): boolean {
  return localStorage.getItem(`portal_onboarding_${portalType}_${token}`) === "completed";
}
