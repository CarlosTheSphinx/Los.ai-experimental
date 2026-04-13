import React from "react";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

interface Stage {
  id: string | number;
  label: string;
  completed?: boolean;
  current?: boolean;
}

interface StageProgressBarProps {
  stages: Stage[];
  className?: string;
  progressPercent?: number;
  completedItems?: number;
  totalItems?: number;
}

export function StageProgressBar({ stages, className, progressPercent: externalPercent, completedItems, totalItems }: StageProgressBarProps) {
  const completedCount = stages.filter((s) => s.completed).length;
  const hasItemsInfo = typeof completedItems === "number" && typeof totalItems === "number";
  const progressPercent = externalPercent ?? (hasItemsInfo && totalItems > 0
    ? Math.round((completedItems / totalItems) * 100)
    : (stages.length > 0 ? Math.round((completedCount / stages.length) * 100) : 0));

  return (
    <div className={cn("bg-card border rounded-[10px] px-3 sm:px-5 py-2.5", className)}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[14px] sm:text-[18px] font-medium text-muted-foreground">
          {hasItemsInfo ? `${completedItems} of ${totalItems} items` : `Stage ${stages.findIndex((s) => s.current) + 1} of ${stages.length}`}
        </span>
        <span className="text-[14px] sm:text-[18px] font-medium text-muted-foreground">{progressPercent}% complete</span>
      </div>

      <div className="flex items-center gap-0.5 sm:gap-1">
        {stages.map((stage, i) => (
          <React.Fragment key={stage.id}>
            <div className="flex flex-col items-center" style={{ flex: "0 0 auto" }}>
              <div
                className={cn(
                  "w-7 h-7 sm:w-9 sm:h-9 rounded-full flex items-center justify-center text-[12px] sm:text-[15px] font-semibold transition-colors",
                  stage.completed && "bg-emerald-500 text-white",
                  stage.current && !stage.completed && "bg-primary text-white ring-2 ring-primary/20",
                  !stage.completed && !stage.current && "bg-gray-100 text-gray-400"
                )}
              >
                {stage.completed ? <Check className="h-3 w-3 sm:h-4 sm:w-4" /> : i + 1}
              </div>
              <span
                className={cn(
                  "hidden sm:block text-[15px] mt-1 whitespace-nowrap max-w-[90px] truncate text-center",
                  stage.current ? "text-foreground font-medium" : "text-muted-foreground"
                )}
              >
                {stage.label}
              </span>
            </div>

            {i < stages.length - 1 && (
              <div
                className={cn(
                  "h-0.5 flex-1 rounded-full min-w-[8px] sm:min-w-[12px]",
                  i < completedCount ? "bg-emerald-500" : "bg-gray-200"
                )}
              />
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}
