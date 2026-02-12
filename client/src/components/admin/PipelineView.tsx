import { useState } from "react";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";

interface PipelineStep {
  id: number;
  stepOrder: number;
  stepName: string;
  stepKey: string;
  stepColor: string;
}

interface PipelineProject {
  id: number;
  projectNumber: string;
  projectName: string;
  borrowerName: string | null;
  propertyAddress: string | null;
  loanAmount: number | null;
  status: string;
  currentStage: string | null;
  progressPercentage: number;
  ownerName: string;
  ownerEmail: string;
  currentStageName: string;
  currentStageKey: string;
  currentStageId: number | null;
  stages: Array<{
    id: number;
    stageKey: string;
    stageName: string;
    stageOrder: number;
    status: string;
  }>;
}

interface PipelineProgram {
  programId: number;
  programName: string;
  steps: PipelineStep[];
  projects: PipelineProject[];
}

interface PipelineData {
  programs: PipelineProgram[];
  unassigned: PipelineProject[];
}

interface PipelineViewProps {
  data: PipelineData;
}

function formatCurrency(value: number | null) {
  if (!value) return "$0";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatCompactCurrency(value: number) {
  if (value === 0) return "$0";
  if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `$${(value / 1_000).toFixed(0)}K`;
  }
  return formatCurrency(value);
}

interface StageData {
  step: PipelineStep;
  projects: PipelineProject[];
  totalVolume: number;
}

function ProgramPipeline({ program }: { program: PipelineProgram }) {
  const [selectedStageKey, setSelectedStageKey] = useState<string | null>(null);

  const sortedSteps = [...program.steps].sort(
    (a, b) => a.stepOrder - b.stepOrder
  );

  const stageDataMap: StageData[] = sortedSteps.map((step) => {
    const projects = program.projects.filter(
      (p) => p.currentStageKey === step.stepKey
    );
    const totalVolume = projects.reduce(
      (sum, p) => sum + (p.loanAmount || 0),
      0
    );
    return { step, projects, totalVolume };
  });

  const selectedStage = selectedStageKey
    ? stageDataMap.find((s) => s.step.stepKey === selectedStageKey)
    : null;

  return (
    <Card data-testid={`pipeline-program-${program.programId}`}>
      <CardContent className="p-4 space-y-4">
        <h3
          className="text-lg font-semibold"
          data-testid={`text-pipeline-program-name-${program.programId}`}
        >
          {program.programName}
        </h3>

        <div className="flex gap-1 overflow-x-auto pb-1">
          {stageDataMap.map((stageData, index) => {
            const isSelected = selectedStageKey === stageData.step.stepKey;
            return (
              <Button
                key={stageData.step.stepKey}
                variant={isSelected ? "default" : "ghost"}
                className={`flex-1 min-w-[120px] flex flex-col items-center gap-0.5 relative ${
                  isSelected ? "" : "bg-muted/40"
                }`}
                style={
                  isSelected
                    ? { backgroundColor: stageData.step.stepColor }
                    : undefined
                }
                onClick={() =>
                  setSelectedStageKey(
                    isSelected ? null : stageData.step.stepKey
                  )
                }
                data-testid={`button-stage-${stageData.step.stepKey}`}
              >
                <div className="flex items-center gap-1.5">
                  {!isSelected && (
                    <div
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: stageData.step.stepColor }}
                    />
                  )}
                  <span className="text-xs font-medium truncate">
                    {stageData.step.stepName}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] opacity-80">
                    {stageData.projects.length} deals
                  </span>
                  <span className="text-[10px] font-mono opacity-70">
                    {formatCompactCurrency(stageData.totalVolume)}
                  </span>
                </div>
                {index < stageDataMap.length - 1 && (
                  <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 text-muted-foreground/30 z-10 pointer-events-none">
                    &rsaquo;
                  </div>
                )}
              </Button>
            );
          })}
        </div>

        {selectedStage && selectedStage.projects.length > 0 && (
          <div
            className="space-y-1 border-t pt-3"
            data-testid={`stage-deals-${selectedStage.step.stepKey}`}
          >
            <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
              <div className="flex items-center gap-2">
                <div
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: selectedStage.step.stepColor }}
                />
                <span className="text-sm font-medium">
                  {selectedStage.step.stepName}
                </span>
                <Badge variant="secondary" className="text-[10px]">
                  {selectedStage.projects.length}
                </Badge>
              </div>
              <span className="text-sm text-muted-foreground font-mono">
                Volume: {formatCurrency(selectedStage.totalVolume)}
              </span>
            </div>

            <div className="space-y-1">
              {selectedStage.projects.map((project) => (
                <Link
                  key={project.id}
                  href={`/admin/deals/${project.id}`}
                  data-testid={`link-pipeline-deal-${project.id}`}
                >
                  <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-md hover-elevate flex-wrap">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <span className="text-xs font-mono text-muted-foreground flex-shrink-0">
                        {project.projectNumber}
                      </span>
                      <span className="text-sm truncate">
                        {project.projectName}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0 flex-wrap">
                      {project.borrowerName && (
                        <span className="text-xs text-muted-foreground">
                          {project.borrowerName}
                        </span>
                      )}
                      <span className="text-xs font-medium">
                        {formatCurrency(project.loanAmount)}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {project.progressPercentage}%
                      </span>
                      <ExternalLink className="h-3 w-3 text-muted-foreground" />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {selectedStage && selectedStage.projects.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            No deals in this stage
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default function PipelineView({ data }: PipelineViewProps) {
  return (
    <div className="space-y-6" data-testid="pipeline-view">
      {data.programs.map((program) => (
        <ProgramPipeline key={program.programId} program={program} />
      ))}

      {data.unassigned && data.unassigned.length > 0 && (
        <Card data-testid="pipeline-unassigned">
          <CardContent className="p-4 space-y-3">
            <h3 className="text-lg font-semibold text-muted-foreground">
              Unassigned Deals
            </h3>
            <div className="space-y-1">
              {data.unassigned.map((project) => (
                <Link
                  key={project.id}
                  href={`/admin/deals/${project.id}`}
                  data-testid={`link-unassigned-pipeline-deal-${project.id}`}
                >
                  <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-md hover-elevate flex-wrap">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <span className="text-xs font-mono text-muted-foreground flex-shrink-0">
                        {project.projectNumber}
                      </span>
                      <span className="text-sm truncate">
                        {project.projectName}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0 flex-wrap">
                      <span className="text-xs font-medium">
                        {formatCurrency(project.loanAmount)}
                      </span>
                      <Badge variant="outline" className="text-[10px]">
                        {project.status.replace("_", " ")}
                      </Badge>
                      <ExternalLink className="h-3 w-3 text-muted-foreground" />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
