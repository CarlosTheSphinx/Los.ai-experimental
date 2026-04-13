import { useState } from "react";
import { Inbox, FileText, DollarSign, FolderOpen, UserCircle, LogOut, Menu, LayoutGrid } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

export type PortalView = "dashboard" | "inbox" | "loans" | "commissions" | "documents" | "profile" | "deal-detail" | "programs";

interface PortalSidebarProps {
  portalType: "broker" | "borrower";
  activeView: PortalView;
  onViewChange: (view: PortalView) => void;
  dealName?: string;
  userName?: string;
  onSignOut?: () => void;
}

const BROKER_NAV = [
  { id: "inbox" as PortalView, label: "Inbox", icon: Inbox },
  { id: "loans" as PortalView, label: "Loans", icon: FileText },
  { id: "programs" as PortalView, label: "Programs", icon: LayoutGrid },
  { id: "commissions" as PortalView, label: "Commissions", icon: DollarSign },
];

const BORROWER_NAV = [
  { id: "loans" as PortalView, label: "My Loans", icon: FileText },
  { id: "inbox" as PortalView, label: "Inbox", icon: Inbox },
  { id: "documents" as PortalView, label: "My Documents", icon: FolderOpen },
  { id: "profile" as PortalView, label: "My Profile", icon: UserCircle },
];

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function SidebarNav({ navItems, activeView, onViewChange, userName, onSignOut }: {
  navItems: typeof BROKER_NAV;
  activeView: PortalView;
  onViewChange: (view: PortalView) => void;
  userName?: string;
  onSignOut?: () => void;
}) {
  return (
    <>
      <nav className="flex-1 p-2 space-y-0.5">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeView === item.id || (item.id === "loans" && activeView === "deal-detail");
          return (
            <button
              key={item.id}
              onClick={() => onViewChange(item.id)}
              className={cn(
                "w-full flex items-center gap-2.5 px-3 py-2 rounded-md font-ui text-[14px] font-normal transition-colors",
                isActive
                  ? "border-l-2 bg-white/5"
                  : "text-white/60 hover:bg-white/5 hover:text-white/80"
              )}
              style={isActive ? { borderColor: '#C9A84C', color: 'white' } : undefined}
              data-testid={`nav-${item.id}`}
            >
              <span className="flex items-center justify-center w-[14px] h-[14px] flex-shrink-0">
                <Icon
                  className="w-[14px] h-[14px]"
                  style={{ color: isActive ? '#C9A84C' : 'rgba(255,255,255,0.3)' }}
                />
              </span>
              {item.label}
            </button>
          );
        })}
      </nav>

      {(userName || onSignOut) && (
        <div className="p-3 border-t border-white/10">
          <div className="flex items-center gap-2">
            {userName && (
              <div className="h-7 w-7 rounded-full flex items-center justify-center text-white text-[11px] font-medium flex-shrink-0" style={{ background: 'linear-gradient(135deg, #C9A84C, #C9A84C99)' }}>
                {getInitials(userName)}
              </div>
            )}
            <div className="flex-1 min-w-0">
              {userName && (
                <p className="text-[12px] text-white/80 font-ui truncate">{userName}</p>
              )}
            </div>
            {onSignOut && (
              <button
                onClick={onSignOut}
                className="p-1 rounded hover:bg-white/10 transition-colors"
                title="Sign Out"
                data-testid="btn-sign-out"
              >
                <LogOut className="h-3.5 w-3.5 text-white/40 hover:text-white/70" />
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function SidebarBrand() {
  return (
    <div className="p-4 border-b border-white/10">
      <div className="flex items-baseline gap-1.5">
        <span className="font-display font-bold text-[20px] text-white tracking-[0.25em]">LENDRY</span>
        <span className="font-display font-bold text-[12px] tracking-[0.15em]" style={{ color: '#C9A84C' }}>AI</span>
      </div>
      <p className="font-display text-[13px] font-medium text-white/40 mt-0.5">Lending Intelligence</p>
    </div>
  );
}

export function PortalSidebar({ portalType, activeView, onViewChange, dealName, userName, onSignOut }: PortalSidebarProps) {
  const isMobile = useIsMobile();
  const [mobileOpen, setMobileOpen] = useState(false);
  const navItems = portalType === "broker" ? BROKER_NAV : BORROWER_NAV;

  const handleNavChange = (view: PortalView) => {
    onViewChange(view);
    if (isMobile) {
      setMobileOpen(false);
    }
  };

  if (isMobile) {
    return (
      <>
        <div
          className="sticky top-0 z-40 flex items-center gap-3 px-3 py-2.5 border-b border-white/10"
          style={{ backgroundColor: '#0F1729' }}
          data-testid="portal-mobile-header"
        >
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-white/70 hover:text-white hover:bg-white/10"
            onClick={() => setMobileOpen(true)}
            data-testid="button-portal-menu"
          >
            <Menu className="h-5 w-5" />
          </Button>
          <div className="flex items-baseline gap-1.5">
            <span className="font-display font-bold text-[16px] text-white tracking-[0.2em]">LENDRY</span>
            <span className="font-display font-bold text-[10px] tracking-[0.15em]" style={{ color: '#C9A84C' }}>AI</span>
          </div>
        </div>
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent
            side="left"
            className="p-0 w-[14.4rem] border-r border-white/10 [&>button]:hidden"
            style={{ backgroundColor: '#0F1729' }}
          >
            <SheetHeader className="sr-only">
              <SheetTitle>Navigation</SheetTitle>
              <SheetDescription>Portal navigation menu</SheetDescription>
            </SheetHeader>
            <SidebarBrand />
            <SidebarNav
              navItems={navItems}
              activeView={activeView}
              onViewChange={handleNavChange}
              userName={userName}
              onSignOut={onSignOut}
            />
          </SheetContent>
        </Sheet>
      </>
    );
  }

  return (
    <aside className="w-[12.8rem] min-h-screen flex flex-col shrink-0" style={{ backgroundColor: '#0F1729' }} data-testid="portal-sidebar">
      <SidebarBrand />
      <SidebarNav
        navItems={navItems}
        activeView={activeView}
        onViewChange={handleNavChange}
        userName={userName}
        onSignOut={onSignOut}
      />
    </aside>
  );
}
