/**
 * Training Overlay Component
 * Shows training instructions as a modal overlay on the target page.
 * Includes step content, optional video, completion checkbox, and navigation.
 */

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2,
  ChevronRight,
  X,
  GraduationCap,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface TrainingStep {
  id: number;
  title: string;
  description: string | null;
  targetPage: string;
  contentHtml: string | null;
  videoUrl: string | null;
  sortOrder: number;
  isRequired: boolean;
  isCompleted: boolean;
}

interface TrainingOverlayProps {
  step: TrainingStep;
  currentIndex: number;
  totalSteps: number;
  onComplete: () => void;
  onNext: () => void;
  onDismiss: () => void;
  isOpen: boolean;
}

export function TrainingOverlay({
  step,
  currentIndex,
  totalSteps,
  onComplete,
  onNext,
  onDismiss,
  isOpen,
}: TrainingOverlayProps) {
  const { toast } = useToast();

  const completeMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/training/steps/${step.id}/complete`, {});
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/training/progress"] });
      onComplete();
      if (data?.allRequiredComplete) {
        toast({
          title: "Training Complete!",
          description: "You've completed all required training steps.",
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to mark step as complete",
        variant: "destructive",
      });
    },
  });

  const handleComplete = () => {
    if (!step.isCompleted) {
      completeMutation.mutate();
    } else {
      onNext();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onDismiss()}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-1">
            <GraduationCap className="h-5 w-5 text-primary" />
            <Badge variant="outline" className="text-xs">
              Step {currentIndex + 1} of {totalSteps}
            </Badge>
            {step.isRequired && (
              <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-xs">
                Required
              </Badge>
            )}
          </div>
          <DialogTitle className="text-lg">{step.title}</DialogTitle>
          {step.description && (
            <DialogDescription>{step.description}</DialogDescription>
          )}
        </DialogHeader>

        {/* Step Content */}
        <div className="py-2">
          {step.contentHtml && (
            <div
              className="prose prose-sm max-w-none text-sm [&_h3]:text-base [&_h3]:font-semibold [&_h3]:mt-2 [&_h3]:mb-2 [&_ul]:list-disc [&_ul]:ml-4 [&_ul]:space-y-1 [&_ol]:list-decimal [&_ol]:ml-4 [&_ol]:space-y-1 [&_p]:mb-2 [&_strong]:font-semibold"
              dangerouslySetInnerHTML={{ __html: step.contentHtml }}
            />
          )}

          {step.videoUrl && (
            <div className="mt-4 rounded-lg overflow-hidden border">
              <iframe
                src={step.videoUrl}
                className="w-full aspect-video"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                title={step.title}
              />
            </div>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onDismiss}
            className="sm:mr-auto"
          >
            Resume Later
          </Button>
          <div className="flex gap-2">
            {step.isCompleted ? (
              <Button size="sm" onClick={onNext}>
                <CheckCircle2 className="h-4 w-4 mr-1.5 text-emerald-600" />
                Completed — Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={handleComplete}
                disabled={completeMutation.isPending}
              >
                {completeMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 mr-1.5" />
                )}
                Mark Complete & Continue
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
