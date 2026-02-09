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
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";

interface Deal {
  id: number;
  projectId?: number;
  projectNumber?: string;
  userId: number;
  customerFirstName: string;
  customerLastName: string;
  propertyAddress: string;
  loanData: {
    loanAmount: number;
    loanType: string;
    propertyType?: string;
  };
  interestRate: string;
  stage: string;
  progressPercentage?: number;
  createdAt: string;
  userName: string | null;
  userEmail: string | null;
}

interface DealStageConfig {
  id: number;
  key: string;
  label: string;
  color: string;
  sortOrder: number;
  isActive: boolean;
}

interface DealsKanbanViewProps {
  deals: Deal[];
}

function formatCurrency(amount: number) {
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `$${(amount / 1_000).toFixed(0)}K`;
  return `$${amount.toFixed(0)}`;
}

function getLoanTypeLabel(loanType: string): string {
  const labels: Record<string, string> = {
    rtl: "RTL",
    dscr: "DSCR",
    "fix-and-flip": "Fix & Flip",
    bridge: "Bridge",
    "ground-up": "Ground Up",
    rental: "Rental",
  };
  return labels[loanType?.toLowerCase()] || loanType || "N/A";
}

function DroppableColumn({
  stageKey,
  stageLabel,
  stageColor,
  deals,
  children,
}: {
  stageKey: string;
  stageLabel: string;
  stageColor: string;
  deals: Deal[];
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `stage-${stageKey}`,
    data: { stageKey },
  });

  const totalVolume = deals.reduce(
    (sum, d) => sum + (d.loanData?.loanAmount || 0),
    0
  );

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex flex-col min-w-[280px] max-w-[320px] rounded-md border transition-colors",
        isOver ? "bg-primary/5 border-primary/30" : "bg-muted/30"
      )}
      data-testid={`kanban-column-${stageKey}`}
    >
      <div className="p-3 border-b flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: resolveColor(stageColor) }}
          />
          <span className="text-sm font-medium truncate">{stageLabel}</span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Badge variant="secondary" className="text-[10px]">
            {deals.length}
          </Badge>
          {totalVolume > 0 && (
            <span className="text-[10px] text-muted-foreground font-mono">
              {formatCurrency(totalVolume)}
            </span>
          )}
        </div>
      </div>
      <div className="p-2 space-y-2 flex-1 overflow-y-auto max-h-[calc(100vh-320px)]">
        {children}
        {deals.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-6">
            No deals
          </p>
        )}
      </div>
    </div>
  );
}

function DraggableDealCard({ deal }: { deal: Deal }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `deal-${deal.id}`,
    data: { deal },
  });

  return (
    <div
      ref={setNodeRef}
      className={cn("transition-opacity", isDragging && "opacity-30")}
    >
      <DealCardContent
        deal={deal}
        dragHandleProps={{ ...attributes, ...listeners }}
      />
    </div>
  );
}

function DealCardContent({
  deal,
  dragHandleProps,
}: {
  deal: Deal;
  dragHandleProps?: Record<string, any>;
}) {
  return (
    <Card
      className="overflow-visible"
      data-testid={`kanban-deal-${deal.id}`}
    >
      <CardContent className="p-3 space-y-2">
        <div className="flex items-start justify-between gap-1">
          <Link
            href={`/admin/deals/${deal.id}`}
            data-testid={`link-kanban-deal-${deal.id}`}
          >
            <span className="text-sm font-medium hover:underline leading-tight line-clamp-2">
              {deal.customerFirstName} {deal.customerLastName}
            </span>
          </Link>
          <div
            {...dragHandleProps}
            className="cursor-grab active:cursor-grabbing p-0.5 rounded hover-elevate flex-shrink-0"
            data-testid={`drag-handle-deal-${deal.id}`}
          >
            <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
        </div>

        {deal.propertyAddress && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <MapPin className="h-3 w-3 flex-shrink-0" />
            <span className="truncate">{deal.propertyAddress}</span>
          </div>
        )}

        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1 text-xs">
            <DollarSign className="h-3 w-3 text-muted-foreground" />
            <span className="font-medium">
              {deal.loanData?.loanAmount
                ? formatCurrency(deal.loanData.loanAmount)
                : "--"}
            </span>
          </div>
          <Badge variant="outline" className="text-[10px]">
            {getLoanTypeLabel(deal.loanData?.loanType)}
          </Badge>
        </div>

        {deal.userName && (
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <User className="h-2.5 w-2.5" />
            <span className="truncate">{deal.userName}</span>
          </div>
        )}

        {deal.projectNumber && (
          <span className="text-[10px] font-mono text-muted-foreground">
            {deal.projectNumber}
          </span>
        )}
      </CardContent>
    </Card>
  );
}

const COLOR_NAME_TO_HEX: Record<string, string> = {
  gray: "#6b7280",
  yellow: "#eab308",
  orange: "#f97316",
  blue: "#3b82f6",
  emerald: "#10b981",
  cyan: "#06b6d4",
  indigo: "#6366f1",
  teal: "#14b8a6",
  green: "#22c55e",
  red: "#ef4444",
  purple: "#a855f7",
  pink: "#ec4899",
};

function resolveColor(color: string): string {
  if (color.startsWith("#") || color.startsWith("rgb")) return color;
  return COLOR_NAME_TO_HEX[color] || "#6b7280";
}

const DEFAULT_STAGES: DealStageConfig[] = [
  { id: 0, key: "initial-review", label: "Initial Review", color: "yellow", sortOrder: 0, isActive: true },
  { id: 1, key: "term-sheet", label: "Term Sheet", color: "blue", sortOrder: 1, isActive: true },
  { id: 2, key: "onboarding", label: "Onboarding", color: "purple", sortOrder: 2, isActive: true },
  { id: 3, key: "processing", label: "Processing", color: "cyan", sortOrder: 3, isActive: true },
  { id: 4, key: "underwriting", label: "Underwriting", color: "indigo", sortOrder: 4, isActive: true },
  { id: 5, key: "closing", label: "Closing", color: "teal", sortOrder: 5, isActive: true },
  { id: 6, key: "closed", label: "Closed", color: "green", sortOrder: 6, isActive: true },
];

export default function DealsKanbanView({ deals }: DealsKanbanViewProps) {
  const { toast } = useToast();
  const [activeDeal, setActiveDeal] = useState<Deal | null>(null);

  const { data: stagesData } = useQuery<{ stages: DealStageConfig[] }>({
    queryKey: ["/api/admin/deal-stages"],
  });

  const stages = stagesData?.stages?.length
    ? [...stagesData.stages].filter(s => s.isActive).sort((a, b) => a.sortOrder - b.sortOrder)
    : DEFAULT_STAGES;

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    })
  );

  function handleDragStart(event: DragStartEvent) {
    const deal = event.active.data.current?.deal as Deal | undefined;
    setActiveDeal(deal || null);
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveDeal(null);
    const { active, over } = event;
    if (!over) return;

    const deal = active.data.current?.deal as Deal | undefined;
    const targetStageKey = over.data.current?.stageKey as string | undefined;

    if (!deal || !targetStageKey) return;
    if (deal.stage === targetStageKey) return;

    try {
      await apiRequest("PATCH", `/api/admin/deals/${deal.id}`, {
        stage: targetStageKey,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/deals"] });
      const targetLabel =
        stages.find((s) => s.key === targetStageKey)?.label || targetStageKey;
      toast({
        title: "Deal moved",
        description: `${deal.customerFirstName} ${deal.customerLastName} moved to ${targetLabel}`,
      });
    } catch {
      toast({
        title: "Move failed",
        description: "Could not move deal to this stage.",
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
      <div
        className="flex gap-3 overflow-x-auto pb-4"
        data-testid="deals-kanban-view"
      >
        {stages.map((stage) => {
          const stageDeals = deals.filter((d) => d.stage === stage.key);
          return (
            <DroppableColumn
              key={stage.key}
              stageKey={stage.key}
              stageLabel={stage.label}
              stageColor={stage.color}
              deals={stageDeals}
            >
              {stageDeals.map((deal) => (
                <DraggableDealCard key={deal.id} deal={deal} />
              ))}
            </DroppableColumn>
          );
        })}
      </div>

      <DragOverlay>
        {activeDeal && <DealCardContent deal={activeDeal} />}
      </DragOverlay>
    </DndContext>
  );
}
