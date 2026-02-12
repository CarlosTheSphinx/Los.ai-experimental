import { useState } from "react";
import { Link } from "wouter";
import {
  DndContext,
  DragOverlay,
  useDroppable,
  useDraggable,
  type DragStartEvent,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

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

interface KanbanViewProps {
  data: PipelineData;
}

function formatCurrency(value: number | null) {
  if (!value) return "-";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function ProjectCard({
  project,
  isDragOverlay,
}: {
  project: PipelineProject;
  isDragOverlay?: boolean;
}) {
  const content = (
    <Card
      className={`hover-elevate ${isDragOverlay ? "shadow-lg opacity-90" : ""}`}
      data-testid={`card-deal-${project.id}`}
    >
      <CardContent className="p-3 space-y-1.5">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="text-xs font-mono text-muted-foreground" data-testid={`text-deal-number-${project.id}`}>
            {project.projectNumber}
          </span>
          <Badge variant="outline" className="text-[10px]">
            {project.status.replace("_", " ")}
          </Badge>
        </div>
        <p className="text-sm font-medium truncate" data-testid={`text-deal-name-${project.id}`}>
          {project.projectName}
        </p>
        {project.borrowerName && (
          <p className="text-xs text-muted-foreground truncate">
            {project.borrowerName}
          </p>
        )}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="text-xs font-medium" data-testid={`text-loan-amount-${project.id}`}>
            {formatCurrency(project.loanAmount)}
          </span>
          <div className="flex items-center gap-1.5">
            <Progress value={project.progressPercentage} className="w-12 h-1.5" />
            <span className="text-[10px] text-muted-foreground">
              {project.progressPercentage}%
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  if (isDragOverlay) return content;

  return (
    <Link href={`/admin/deals/${project.id}`} data-testid={`link-deal-${project.id}`}>
      {content}
    </Link>
  );
}

function DraggableCard({ project, programId }: { project: PipelineProject; programId: number }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `project-${programId}-${project.id}`,
    data: { project, programId },
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{ opacity: isDragging ? 0.4 : 1 }}
      data-testid={`draggable-deal-${project.id}`}
    >
      <ProjectCard project={project} />
    </div>
  );
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
    id: `column-${programId}-${step.stepKey}`,
    data: { stepKey: step.stepKey, programId },
  });

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col min-w-[240px] w-[240px] rounded-md ${
        isOver ? "bg-accent/60" : "bg-muted/40"
      } transition-colors`}
      data-testid={`column-${step.stepKey}`}
    >
      <div className="p-3 flex items-center gap-2 flex-wrap">
        <div
          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: step.stepColor }}
        />
        <span className="text-sm font-medium truncate">{step.stepName}</span>
        <Badge variant="secondary" className="ml-auto text-[10px]">
          {projects.length}
        </Badge>
      </div>
      <div className="p-2 space-y-2 flex-1 overflow-y-auto max-h-[500px]">
        {projects.map((project) => (
          <DraggableCard key={project.id} project={project} programId={programId} />
        ))}
      </div>
    </div>
  );
}

function ProgramBoard({ program }: { program: PipelineProgram }) {
  const sortedSteps = [...program.steps].sort(
    (a, b) => a.stepOrder - b.stepOrder
  );

  const projectsByStage = new Map<string, PipelineProject[]>();
  for (const step of sortedSteps) {
    projectsByStage.set(step.stepKey, []);
  }
  for (const project of program.projects) {
    const existing = projectsByStage.get(project.currentStageKey);
    if (existing) {
      existing.push(project);
    }
  }

  return (
    <div className="space-y-3" data-testid={`kanban-program-${program.programId}`}>
      <h3 className="text-lg font-semibold" data-testid={`text-program-name-${program.programId}`}>
        {program.programName}
      </h3>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {sortedSteps.map((step) => (
          <DroppableColumn
            key={step.stepKey}
            step={step}
            projects={projectsByStage.get(step.stepKey) || []}
            programId={program.programId}
          />
        ))}
      </div>
    </div>
  );
}

export default function KanbanView({ data }: KanbanViewProps) {
  const { toast } = useToast();
  const [activeProject, setActiveProject] = useState<PipelineProject | null>(
    null
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  function handleDragStart(event: DragStartEvent) {
    const project = event.active.data.current?.project as
      | PipelineProject
      | undefined;
    if (project) {
      setActiveProject(project);
    }
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveProject(null);

    const { active, over } = event;
    if (!over) return;

    const project = active.data.current?.project as
      | PipelineProject
      | undefined;
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
    } catch (error: any) {
      toast({
        title: "Failed to move deal",
        description: error?.message || "An error occurred while moving the deal.",
        variant: "destructive",
      });
    }
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="space-y-8" data-testid="kanban-view">
        {data.programs.map((program) => (
          <ProgramBoard key={program.programId} program={program} />
        ))}

        {data.unassigned && data.unassigned.length > 0 && (
          <div className="space-y-3" data-testid="kanban-unassigned">
            <h3 className="text-lg font-semibold text-muted-foreground">
              Unassigned Deals
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {data.unassigned.map((project) => (
                <Link
                  key={project.id}
                  href={`/admin/deals/${project.id}`}
                  data-testid={`link-unassigned-deal-${project.id}`}
                >
                  <ProjectCard project={project} />
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>

      <DragOverlay>
        {activeProject ? (
          <div className="w-[240px]">
            <ProjectCard project={activeProject} isDragOverlay />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
