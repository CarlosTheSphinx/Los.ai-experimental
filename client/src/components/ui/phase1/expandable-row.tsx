import React, { useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { ChevronRight } from "lucide-react";

interface ExpandableRowProps {
  summary: React.ReactNode;
  details: React.ReactNode;
  isExpanded?: boolean;
  onToggle?: (expanded: boolean) => void;
  className?: string;
  columns?: number;
}

export function ExpandableRow({ summary, details, isExpanded: controlledExpanded, onToggle, className, columns = 1 }: ExpandableRowProps) {
  const [internalExpanded, setInternalExpanded] = useState(false);
  const isExpanded = controlledExpanded ?? internalExpanded;

  const handleToggle = useCallback(() => {
    const next = !isExpanded;
    if (onToggle) {
      onToggle(next);
    } else {
      setInternalExpanded(next);
    }
  }, [isExpanded, onToggle]);

  return (
    <>
      <tr
        onClick={handleToggle}
        className={cn(
          "cursor-pointer transition-colors hover:bg-blue-50/50",
          isExpanded && "bg-blue-50/30",
          className
        )}
      >
        <td className="pl-3 pr-0 py-3 w-8">
          <ChevronRight
            className={cn(
              "h-3.5 w-3.5 text-muted-foreground transition-transform duration-200",
              isExpanded && "rotate-90"
            )}
          />
        </td>
        {summary}
      </tr>
      {isExpanded && (
        <tr className="bg-slate-50/80 border-b-2 border-b-blue-500">
          <td colSpan={columns + 1} className="p-0">
            <div className="px-6 py-5 border-t border-border/50 animate-in slide-in-from-top-1 duration-200">
              {details}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
