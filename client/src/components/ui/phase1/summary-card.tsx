import React from "react";
import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

interface SummaryCardProps {
  icon?: LucideIcon;
  label: string;
  value: string | number;
  subtitle?: string;
  isActive?: boolean;
  onClick?: () => void;
  className?: string;
}

export function SummaryCard({ icon: Icon, label, value, subtitle, isActive, onClick, className }: SummaryCardProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "bg-card border rounded-[10px] px-5 py-4 text-left transition-all cursor-pointer",
        "hover:border-primary hover:shadow-[0_0_0_1px] hover:shadow-primary/30",
        isActive && "border-primary bg-blue-50/50 shadow-[0_0_0_1px] shadow-primary/30",
        !isActive && "border-border",
        className
      )}
    >
      <div className="flex items-center gap-2 mb-1">
        {Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground" />}
        <span className="text-[14px] font-medium text-muted-foreground">{label}</span>
      </div>
      <div className="text-[26px] font-bold text-foreground">{value}</div>
      {subtitle && <div className="text-[13px] text-muted-foreground mt-0.5">{subtitle}</div>}
    </button>
  );
}

interface SummaryStripProps {
  children: React.ReactNode;
  className?: string;
}

export function SummaryStrip({ children, className }: SummaryStripProps) {
  return (
    <div className={cn("grid grid-cols-2 md:grid-cols-4 gap-4", className)}>
      {children}
    </div>
  );
}
