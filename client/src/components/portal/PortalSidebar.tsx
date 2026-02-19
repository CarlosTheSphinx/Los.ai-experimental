import { Inbox, FileText, DollarSign, Home } from "lucide-react";
import { cn } from "@/lib/utils";

export type PortalView = "dashboard" | "inbox" | "loans" | "commissions";

interface PortalSidebarProps {
  portalType: "broker" | "borrower";
  activeView: PortalView;
  onViewChange: (view: PortalView) => void;
  dealName?: string;
}

const BROKER_NAV = [
  { id: "dashboard" as PortalView, label: "Dashboard", icon: Home },
  { id: "inbox" as PortalView, label: "Inbox", icon: Inbox },
  { id: "loans" as PortalView, label: "Loans", icon: FileText },
  { id: "commissions" as PortalView, label: "Commissions", icon: DollarSign },
];

const BORROWER_NAV = [
  { id: "dashboard" as PortalView, label: "Dashboard", icon: Home },
  { id: "inbox" as PortalView, label: "Inbox", icon: Inbox },
  { id: "loans" as PortalView, label: "Loans", icon: FileText },
];

export function PortalSidebar({ portalType, activeView, onViewChange, dealName }: PortalSidebarProps) {
  const navItems = portalType === "broker" ? BROKER_NAV : BORROWER_NAV;

  return (
    <aside className="w-56 bg-white border-r min-h-screen flex flex-col" data-testid="portal-sidebar">
      <div className="p-4 border-b">
        <h2 className="font-semibold text-sm text-gray-900 truncate">{dealName || "My Portal"}</h2>
        <p className="text-xs text-muted-foreground capitalize mt-0.5">{portalType} Portal</p>
      </div>

      <nav className="flex-1 p-2 space-y-0.5">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onViewChange(item.id)}
              className={cn(
                "w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                isActive
                  ? "bg-blue-50 text-blue-700"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              )}
              data-testid={`nav-${item.id}`}
            >
              <Icon className={cn("h-4 w-4", isActive ? "text-blue-600" : "text-gray-400")} />
              {item.label}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
