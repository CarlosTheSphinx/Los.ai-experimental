import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin, User, DollarSign, GripVertical } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";

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
  loanType: string | null;
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

function formatCurrency(value: number | null) {
  if (!value) return "-";
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

function getLoanTypeLabel(loanType: string | null): string {
  if (!loanType) return "N/A";
  const labels: Record<string, string> = {
    rtl: "RTL",
    dscr: "DSCR",
    "fix-and-flip": "Fix & Flip",
    bridge: "Bridge",
    "ground-up": "Ground Up",
    rental: "Rental",
  };
  return labels[loanType.toLowerCase()] || loanType;
}

function DroppableColumn({
  step,
  projects,
  programId,
}: {
  step: PipelineStep;
  projects: PipelineProject[];
  programId: number;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `deal-column-${programId}-${step.stepKey}`,
    data: { stepKey: step.stepKey, programId },
  });

  const totalVolume = projects.reduce(
    (sum, p) => sum + (p.loanAmount || 0),
    0
  );

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex flex-col min-w-[280px] max-w-[320px] rounded-md border transition-colors",
        isOver ? "bg-primary/5 border-primary/30" : "bg-muted/30"
      )}
      data-testid={`kanban-column-${step.stepKey}`}
    >
      <div className="p-3 border-b flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: step.stepColor }}
          />
          <span className="text-sm font-medium truncate">{step.stepName}</span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Badge variant="secondary" className="text-[10px]">
            {projects.length}
          </Badge>
          {totalVolume > 0 && (
            <span className="text-[10px] text-muted-foreground font-mono">
              {formatCurrency(totalVolume)}
            </span>
          )}
        </div>
      </div>
      <div className="p-2 space-y-2 flex-1 overflow-y-auto max-h-[calc(100vh-320px)]">
        {projects.map((project) => (
          <DraggableDealCard key={project.id} project={project} programId={programId} />
        ))}
        {projects.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-6">
            No deals
          </p>
        )}
      </div>
    </div>
  );
}

function DraggableDealCard({ project, programId }: { project: PipelineProject; programId: number }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `deal-${programId}-${project.id}`,
    data: { project, programId },
  });

  return (
    <div
      ref={setNodeRef}
      className={cn("transition-opacity", isDragging && "opacity-30")}
    >
      <DealCardContent
        project={project}
        dragHandleProps={{ ...attributes, ...listeners }}
      />
    </div>
  );
}

function DealCardContent({
  project,
  dragHandleProps,
  isDragOverlay,
}: {
  project: PipelineProject;
  dragHandleProps?: Record<string, any>;
  isDragOverlay?: boolean;
}) {
  const nameParts = (project.borrowerName || project.projectName || "").split(" - ");
  const displayName = project.borrowerName || nameParts[0] || "Unknown";

  // Mock Lane confidence calculation based on progress percentage
  const laneConfidence = Math.min(95, Math.max(60, project.progressPercentage + 20));

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 80) return 'bg-green-100 text-green-700';
    if (confidence >= 50) return 'bg-yellow-100 text-yellow-700';
    return 'bg-red-100 text-red-700';
  };

  return (
    <Card
      className={cn("overflow-visible", isDragOverlay && "shadow-lg opacity-90")}
      data-testid={`kanban-deal-${project.id}`}
    >
      <CardContent className="p-3 space-y-2">
        <div className="flex items-start justify-between gap-1">
          <Link
            href={`/admin/deals/${project.id}`}
            data-testid={`link-kanban-deal-${project.id}`}
          >
            <span className="text-sm font-medium hover:underline leading-tight line-clamp-2">
              {displayName}
            </span>
          </Link>
          <div className="flex items-center gap-1 flex-shrink-0">
            <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${getConfidenceColor(laneConfidence)}`} data-testid={`lane-confidence-${project.id}`}>
              Lane: {laneConfidence}%
            </span>
            {dragHandleProps && (
              <div
                {...dragHandleProps}
                className="cursor-grab active:cursor-grabbing p-0.5 rounded hover-elevate"
                data-testid={`drag-handle-deal-${project.id}`}
              >
                <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
            )}
          </div>
        </div>

        {project.propertyAddress && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <MapPin className="h-3 w-3 flex-shrink-0" />
            <span className="truncate">{project.propertyAddress}</span>
          </div>
        )}

        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1 text-xs">
            <DollarSign className="h-3 w-3 text-muted-foreground" />
            <span className="font-medium">
              {project.loanAmount ? formatCurrency(project.loanAmount) : "--"}
            </span>
          </div>
          <Badge variant="outline" className="text-[10px]">
            {getLoanTypeLabel(project.loanType)}
          </Badge>
        </div>

        <div className="flex items-center justify-between gap-2 flex-wrap">
          {project.ownerName && (
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <User className="h-2.5 w-2.5" />
              <span className="truncate">{project.ownerName}</span>
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <Progress value={project.progressPercentage} className="w-12 h-1.5" />
            <span className="text-[10px] text-muted-foreground">
              {project.progressPercentage}%
            </span>
          </div>
        </div>

        {project.projectNumber && (
          <span className="text-[10px] font-mono text-muted-foreground">
            {project.projectNumber}
          </span>
        )}
      </CardContent>
    </Card>
  );
}

function ProgramBoard({ program }: { program: PipelineProgram }) {
  const sortedSteps = [...program.steps].sort(
    (a, b) => a.stepOrder - b.stepOrder
  );

  const projectsByStep = new Map<string, PipelineProject[]>();
  for (const step of sortedSteps) {
    projectsByStep.set(step.stepKey, []);
  }
  for (const project of program.projects) {
    const existing = projectsByStep.get(project.currentStageKey);
    if (existing) {
      existing.push(project);
    }
  }

  return (
    <div className="space-y-3" data-testid={`deals-kanban-program-${program.programId}`}>
      <h3 className="text-lg font-semibold" data-testid={`text-program-name-${program.programId}`}>
        {program.programName}
      </h3>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {sortedSteps.map((step) => (
          <DroppableColumn
            key={step.stepKey}
            step={step}
            projects={projectsByStep.get(step.stepKey) || []}
            programId={program.programId}
          />
        ))}
      </div>
    </div>
  );
}

export default function DealsKanbanView() {
  const { toast } = useToast();
  const [activeProject, setActiveProject] = useState<PipelineProject | null>(null);

  const { data: pipelineData, isLoading } = useQuery<PipelineData>({
    queryKey: ["/api/admin/pipeline"],
  });

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    })
  );

  function handleDragStart(event: DragStartEvent) {
    const project = event.active.data.current?.project as PipelineProject | undefined;
    setActiveProject(project || null);
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveProject(null);
    const { active, over } = event;
    if (!over) return;

    const project = active.data.current?.project as PipelineProject | undefined;
    const sourceProgramId = active.data.current?.programId as number | undefined;
    const targetStepKey = over.data.current?.stepKey as string | undefined;
    const targetProgramId = over.data.current?.programId as number | undefined;

    if (!project || !targetStepKey) return;
    if (project.currentStageKey === targetStepKey) return;
    if (sourceProgramId !== targetProgramId) return;

    try {
      await apiRequest("PATCH", `/api/admin/projects/${project.id}/move-stage`, {
        targetStageKey,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pipeline"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/deals"] });

      const program = pipelineData?.programs.find(p => p.programId === targetProgramId);
      const targetLabel = program?.steps.find(s => s.stepKey === targetStepKey)?.stepName || targetStepKey;
      toast({
        title: "Deal moved",
        description: `${project.borrowerName || project.projectName} moved to ${targetLabel}`,
      });
    } catch {
      toast({
        title: "Move failed",
        description: "Could not move deal to this stage.",
        variant: "destructive",
      });
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-sm text-muted-foreground">Loading pipeline...</p>
      </div>
    );
  }

  if (!pipelineData?.programs?.length && !pipelineData?.unassigned?.length) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <p className="text-sm text-muted-foreground">No deals in the pipeline yet</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="space-y-8" data-testid="deals-kanban-view">
        {pipelineData?.programs.map((program) => (
          <ProgramBoard key={program.programId} program={program} />
        ))}

        {pipelineData?.unassigned && pipelineData.unassigned.length > 0 && (
          <div className="space-y-3" data-testid="kanban-unassigned">
            <h3 className="text-lg font-semibold text-muted-foreground">
              Unassigned
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {pipelineData.unassigned.map((project) => (
                <Link
                  key={project.id}
                  href={`/admin/deals/${project.id}`}
                  data-testid={`link-unassigned-deal-${project.id}`}
                >
                  <DealCardContent project={project} />
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>

      <DragOverlay>
        {activeProject && (
          <div className="w-[280px]">
            <DealCardContent project={activeProject} isDragOverlay />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
