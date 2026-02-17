/**
 * Training Checklist Component
 * Floating panel/drawer showing all training steps with progress.
 * Handles navigation to target pages and overlay triggers.
 */

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2,
  Circle,
  GraduationCap,
  ChevronRight,
  X,
  ArrowRight,
  Loader2,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { TrainingOverlay } from "./TrainingOverlay";

interface TrainingStep {
  id: number;
  title: string;
  description: string | null;
  targetPage: string;
  contentHtml: string | null;
  videoUrl: string | null;
  sortOrder: number;
  isRequired: boolean;
  isActive: boolean;
  isCompleted: boolean;
  progress: any;
}

interface TrainingProgressData {
  steps: TrainingStep[];
  summary: {
    totalSteps: number;
    completedSteps: number;
    requiredSteps: number;
    completedRequired: number;
    allRequiredComplete: boolean;
    percentComplete: number;
  };
}

export function TrainingChecklist() {
  const [location, setLocation] = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [overlayStep, setOverlayStep] = useState<TrainingStep | null>(null);
  const [showOverlay, setShowOverlay] = useState(false);
  const [hasAutoOpened, setHasAutoOpened] = useState(false);

  // Fetch training progress
  const { data: progressData, isLoading } = useQuery<TrainingProgressData>({
    queryKey: ["/api/training/progress"],
    queryFn: async () => {
      const res = await fetch("/api/training/progress");
      if (!res.ok) throw new Error("Failed to fetch training progress");
      return res.json();
    },
    staleTime: 30 * 1000,
  });

  const steps = progressData?.steps || [];
  const summary = progressData?.summary;
  const remainingSteps = summary
    ? summary.totalSteps - summary.completedSteps
    : 0;

  // Auto-open on first load if training not complete
  useEffect(() => {
    if (
      !hasAutoOpened &&
      progressData &&
      !summary?.allRequiredComplete &&
      summary?.totalSteps &&
      summary.totalSteps > 0
    ) {
      setIsOpen(true);
      setHasAutoOpened(true);
    }
  }, [progressData, hasAutoOpened, summary]);

  // Check if current page matches a training step and show overlay
  useEffect(() => {
    if (!steps.length || !isOpen) return;

    const matchingStep = steps.find(
      (s) => !s.isCompleted && s.targetPage === location
    );

    if (matchingStep && !showOverlay) {
      setOverlayStep(matchingStep);
      setShowOverlay(true);
    }
  }, [location, steps, isOpen, showOverlay]);

  const handleStepClick = (step: TrainingStep) => {
    if (step.targetPage && step.targetPage !== location) {
      setLocation(step.targetPage);
    }
    setOverlayStep(step);
    setShowOverlay(true);
  };

  const handleOverlayComplete = () => {
    // Move to next incomplete step
    const currentIdx = steps.findIndex((s) => s.id === overlayStep?.id);
    const nextStep = steps.find(
      (s, i) => i > currentIdx && !s.isCompleted
    );

    if (nextStep) {
      if (nextStep.targetPage !== location) {
        setLocation(nextStep.targetPage);
      }
      setOverlayStep(nextStep);
    } else {
      setShowOverlay(false);
      setOverlayStep(null);
    }
  };

  const handleOverlayNext = () => {
    handleOverlayComplete();
  };

  const handleOverlayDismiss = () => {
    setShowOverlay(false);
    setOverlayStep(null);
  };

  // If all training is complete or no steps exist, don't render
  if (summary?.allRequiredComplete || !steps.length) {
    return null;
  }

  const currentOverlayIndex = overlayStep
    ? steps.findIndex((s) => s.id === overlayStep.id)
    : 0;

  return (
    <>
      {/* Sidebar Badge / Trigger */}
      {!isOpen && remainingSteps > 0 && (
        <div className="fixed bottom-6 left-20 z-50">
          <Button
            onClick={() => setIsOpen(true)}
            className="rounded-full shadow-lg gap-2 px-4"
            size="sm"
          >
            <GraduationCap className="h-4 w-4" />
            {remainingSteps} step{remainingSteps !== 1 ? "s" : ""} remaining
          </Button>
        </div>
      )}

      {/* Checklist Drawer */}
      {isOpen && (
        <div className="fixed bottom-6 left-20 z-50 w-80 animate-in slide-in-from-bottom-2">
          <Card className="shadow-xl border-primary/20">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <GraduationCap className="h-5 w-5 text-primary" />
                  <CardTitle className="text-sm">Platform Training</CardTitle>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => setIsOpen(false)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              {/* Progress Bar */}
              {summary && (
                <div className="mt-2">
                  <div className="flex justify-between text-xs text-muted-foreground mb-1">
                    <span>
                      {summary.completedSteps} of {summary.totalSteps} completed
                    </span>
                    <span>{summary.percentComplete}%</span>
                  </div>
                  <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all duration-500"
                      style={{ width: `${summary.percentComplete}%` }}
                    />
                  </div>
                </div>
              )}
            </CardHeader>
            <CardContent className="pt-0 pb-3 space-y-1 max-h-72 overflow-y-auto">
              {isLoading ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                steps.map((step, i) => (
                  <button
                    key={step.id}
                    onClick={() => handleStepClick(step)}
                    className={cn(
                      "w-full flex items-start gap-3 p-2.5 rounded-lg text-left transition-colors",
                      "hover:bg-muted/60",
                      step.isCompleted && "opacity-70",
                      overlayStep?.id === step.id &&
                        showOverlay &&
                        "bg-primary/5 ring-1 ring-primary/20"
                    )}
                  >
                    <div className="flex-shrink-0 mt-0.5">
                      {step.isCompleted ? (
                        <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                      ) : overlayStep?.id === step.id && showOverlay ? (
                        <Sparkles className="h-5 w-5 text-primary" />
                      ) : (
                        <Circle className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span
                        className={cn(
                          "text-sm font-medium block",
                          step.isCompleted && "line-through text-muted-foreground"
                        )}
                      >
                        {step.title}
                      </span>
                      {step.description && (
                        <span className="text-xs text-muted-foreground line-clamp-1 mt-0.5 block">
                          {step.description}
                        </span>
                      )}
                    </div>
                    {!step.isCompleted && (
                      <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                    )}
                  </button>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Training Overlay */}
      {overlayStep && showOverlay && (
        <TrainingOverlay
          step={overlayStep}
          currentIndex={currentOverlayIndex}
          totalSteps={steps.length}
          onComplete={handleOverlayComplete}
          onNext={handleOverlayNext}
          onDismiss={handleOverlayDismiss}
          isOpen={showOverlay}
        />
      )}
    </>
  );
}
