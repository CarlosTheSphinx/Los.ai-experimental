import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import {
  Calculator,
  FileText,
  ClipboardList,
  FolderKanban,
  LogOut,
  LayoutDashboard,
  Users,
  Settings,
  Settings2,
  Shield,
  Handshake,
  MessageSquare,
  BookOpen,
  CalendarDays,
  Building2,
  DollarSign,
  Sparkles,
  ClipboardEdit,
  Search,
  Zap,
  Send,
  UserCircle,
  Target,
  BotMessageSquare,
  Pin,
  PinOff,
  Eye,
  X,
  Globe,
  GraduationCap,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  Sidebar, 
  SidebarContent, 
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  SidebarProvider,
  SidebarTrigger,
  useSidebar
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { usePermissions } from "@/hooks/use-permissions";
import { useBranding } from "@/hooks/use-branding";
import { InboxBadge } from "@/components/InboxBadge";
import { CommandPalette } from "@/components/CommandPalette";
import { ProcessorAssistant } from "@/components/admin/ProcessorAssistant";
import { TrainingChecklist } from "@/components/TrainingChecklist";
import type { PermissionKey } from "@shared/schema";

interface AppLayoutProps {
  children: React.ReactNode;
  sidebarPinnedProp?: boolean;
  setSidebarPinnedProp?: (v: boolean) => void;
}

interface NavItem {
  href: string;
  label: string;
  icon: any;
  showBadge?: boolean;
  requiredPermission?: PermissionKey;
  shortcut?: string;
  superAdminOnly?: boolean;
}

const brokerNavItems: NavItem[] = [
  { href: "/quotes", label: "Quotes", icon: FileText, shortcut: undefined },
  { href: "/deals", label: "My Loans", icon: FolderKanban, shortcut: undefined },
  { href: "/commissions", label: "My Commissions", icon: DollarSign, shortcut: undefined },
  { href: "/commercial/dashboard", label: "Commercial", icon: Building2, shortcut: undefined },
  { href: "/broker/contacts", label: "Contacts", icon: Users, shortcut: undefined },
  { href: "/broker/outreach", label: "Smart Prospect", icon: Target, shortcut: undefined },
  { href: "/messages", label: "Messages", icon: MessageSquare, showBadge: true, shortcut: undefined },
  { href: "/resources", label: "Resources", icon: BookOpen, shortcut: undefined },
];

const borrowerNavItems: NavItem[] = [
  { href: "/", label: "My Loans", icon: FolderKanban },
  { href: "/quotes", label: "Quotes", icon: FileText },
  { href: "/messages", label: "Messages", icon: MessageSquare, showBadge: true },
  { href: "/resources", label: "Resources", icon: BookOpen },
];

const adminNavItems: NavItem[] = [
  { href: "/admin/platform", label: "Platform", icon: Globe, superAdminOnly: true },
  { href: "/admin", label: "Pipeline", icon: LayoutDashboard, shortcut: "⌘1" },
  { href: "/admin/processor", label: "One-Click Processing", icon: Zap, requiredPermission: "processor.view" },
  { href: "/quotes", label: "Quotes", icon: FileText },
  { href: "/admin/commercial-submissions", label: "Commercial Deals", icon: Building2, requiredPermission: "commercial.view" },
  { href: "/admin/commercial/config", label: "Commercial Config", icon: ClipboardEdit, requiredPermission: "commercial.manage" },
  { href: "/admin/partners", label: "Partners", icon: Handshake, requiredPermission: "partners.view" },
  { href: "/admin/programs", label: "Programs", icon: Settings2, requiredPermission: "programs.view" },
  { href: "/admin/ai-review", label: "Lane", icon: UserCircle, requiredPermission: "programs.view" },
  { href: "/admin/ai-agents", label: "AI Agents", icon: Sparkles, requiredPermission: "agents.view" },
  { href: "/admin/onboarding", label: "Onboarding", icon: BookOpen, requiredPermission: "onboarding.view" },
  { href: "/admin/digests", label: "Digests", icon: CalendarDays, requiredPermission: "digests.view" },
  { href: "/admin/training-config", label: "Training", icon: GraduationCap, superAdminOnly: true },
  { href: "/admin/users", label: "Users", icon: Users, requiredPermission: "users.view", shortcut: "⌘2" },
  { href: "/admin/team-permissions", label: "Permissions", icon: Shield, requiredPermission: "users.manage" },
  { href: "/messages", label: "Messages", icon: MessageSquare, showBadge: true, requiredPermission: "messages.view" },
  { href: "/admin/settings", label: "Settings", icon: Settings, requiredPermission: "settings.view" },
];

type ViewAsMode = "super_admin" | "lender" | "borrower";

const VIEW_AS_STORAGE_KEY = "lendry_view_as_mode";

function AppLayoutContent({ children, sidebarPinnedProp, setSidebarPinnedProp }: AppLayoutProps) {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const { setOpenMobile, isMobile, open, setOpen } = useSidebar();
  const { hasPermission, isSuperAdmin } = usePermissions();
  const { branding } = useBranding();
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const sidebarPinned = sidebarPinnedProp ?? false;
  const setSidebarPinned = setSidebarPinnedProp ?? (() => {});
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [sidebarHovered, setSidebarHovered] = useState(false);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setOpen(sidebarPinned);
  }, [sidebarPinned, setOpen]);

  const handleSidebarMouseEnter = () => {
    if (isMobile || sidebarPinned) return;
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    hoverTimeoutRef.current = setTimeout(() => {
      setSidebarHovered(true);
      setOpen(true);
    }, 150);
  };

  const handleSidebarMouseLeave = () => {
    if (isMobile || sidebarPinned) return;
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    hoverTimeoutRef.current = setTimeout(() => {
      setSidebarHovered(false);
      setOpen(false);
    }, 300);
  };

  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    };
  }, []);

  const [viewAsMode, setViewAsMode] = useState<ViewAsMode>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(VIEW_AS_STORAGE_KEY);
      if (stored === "lender" || stored === "borrower" || stored === "super_admin") return stored;
    }
    return "super_admin";
  });

  useEffect(() => {
    localStorage.setItem(VIEW_AS_STORAGE_KEY, viewAsMode);
  }, [viewAsMode]);

  const isAdmin = user?.role && ['admin', 'staff', 'super_admin', 'processor'].includes(user.role);
  const isBorrower = user?.userType === 'borrower';

  const isPreviewingOtherRole = isSuperAdmin && viewAsMode !== "super_admin";
  const effectiveViewAsBorrower = isSuperAdmin && viewAsMode === "borrower";
  const effectiveViewAsLender = isSuperAdmin && viewAsMode === "lender";

  const navItems = (effectiveViewAsBorrower || isBorrower) ? borrowerNavItems : brokerNavItems;

  const showAdminSection = isAdmin && !effectiveViewAsBorrower && !effectiveViewAsLender;

  const filteredAdminItems = adminNavItems.filter(item => {
    if (item.superAdminOnly && !isSuperAdmin) return false;
    if (!item.requiredPermission) return true;
    if (isSuperAdmin) return true;
    return hasPermission(item.requiredPermission);
  });

  const handleLogout = async () => {
    await logout();
  };

  const handleNavClick = () => {
    if (isMobile) {
      setOpenMobile(false);
    }
  };

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // CMD+K or CTRL+K opens command palette
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCommandPaletteOpen(true);
      }
      // Alt+S toggles sidebar
      if (e.altKey && e.key === 's') {
        e.preventDefault();
        setOpen(!open);
      }
      // Alt+A toggles Your Assistant
      if (e.altKey && e.key === 'a') {
        e.preventDefault();
        setAssistantOpen(!assistantOpen);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, assistantOpen]);

  return (
    <div className="flex h-screen w-full bg-background">
      <div
        onMouseEnter={handleSidebarMouseEnter}
        onMouseLeave={handleSidebarMouseLeave}
        className="relative h-full"
        data-sidebar-hovered={sidebarHovered && !sidebarPinned ? "true" : "false"}
        style={sidebarHovered && !sidebarPinned ? { zIndex: 50 } : undefined}
      >
      <Sidebar collapsible="icon">
        <SidebarHeader className="p-3 border-b border-sidebar-border space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex flex-col items-start gap-1">
              <div className="flex items-center gap-0 group-data-[collapsible=icon]:hidden">
                <span className="text-lg font-bold text-foreground">Lendry.</span>
                <span className="text-lg font-bold text-primary">AI</span>
              </div>
              <div className="hidden group-data-[collapsible=icon]:flex items-center justify-center">
                <span className="text-base font-bold text-primary">L.AI</span>
              </div>
              <span className="text-[10px] text-muted-foreground font-medium group-data-[collapsible=icon]:hidden">
                Intelligent Lending Platform
              </span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground group-data-[collapsible=icon]:hidden"
              onClick={() => setSidebarPinned(!sidebarPinned)}
              title={sidebarPinned ? "Unpin sidebar" : "Pin sidebar open"}
              data-testid="button-pin-sidebar"
            >
              {sidebarPinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
            </Button>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start text-muted-foreground text-xs group-data-[collapsible=icon]:hidden"
            onClick={() => setCommandPaletteOpen(true)}
          >
            <Search className="h-3.5 w-3.5 mr-2" />
            Search... ⌘K
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="w-full hidden group-data-[collapsible=icon]:flex items-center justify-center text-muted-foreground"
            onClick={() => setCommandPaletteOpen(true)}
            title="Search (⌘K)"
          >
            <Search className="h-5 w-5" />
          </Button>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/60 px-0 pb-2">
              {(effectiveViewAsBorrower || isBorrower) ? 'My Loans' : 'Pipeline'}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {navItems.map((item) => {
                  const isActive = location === item.href ||
                    (item.href !== "/" && location.startsWith(item.href) && !location.startsWith("/admin"));
                  const Icon = item.icon;

                  return (
                    <SidebarMenuItem key={item.href} className="group relative">
                      <SidebarMenuButton
                        asChild
                        isActive={isActive}
                        tooltip={item.label}
                        className={isActive ? "border-l-2 border-primary bg-sidebar-accent" : ""}
                      >
                        <Link
                          href={item.href}
                          data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                          onClick={handleNavClick}
                        >
                          <Icon className="h-5 w-5 shrink-0" />
                          <span className="flex items-center gap-1 flex-1">
                            {item.label}
                            {'showBadge' in item && item.showBadge && <InboxBadge />}
                          </span>
                          {item.shortcut && (
                            <span className="text-[10px] text-muted-foreground/50 group-hover:text-muted-foreground/70 transition-colors ml-2 hidden group-hover:inline">
                              {item.shortcut}
                            </span>
                          )}
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
          
          {showAdminSection && (
            <SidebarGroup className="mt-4 pt-4 border-t border-sidebar-border">
              <SidebarGroupLabel className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/60 px-0 pb-2">
                Administration
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {filteredAdminItems.map((item) => {
                    const isActive = location === item.href ||
                      (item.href !== "/admin" && location.startsWith(item.href));
                    const Icon = item.icon;

                    return (
                      <SidebarMenuItem key={item.href} className="group relative">
                        <SidebarMenuButton
                          asChild
                          isActive={isActive}
                          tooltip={item.label}
                          className={isActive ? "border-l-2 border-primary bg-sidebar-accent" : ""}
                        >
                          <Link
                            href={item.href}
                            data-testid={`nav-admin-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                            onClick={handleNavClick}
                          >
                            <Icon className="h-5 w-5 shrink-0" />
                            <span className="flex items-center gap-1 flex-1">
                              {item.label}
                              {'showBadge' in item && item.showBadge && <InboxBadge />}
                            </span>
                            {item.shortcut && (
                              <span className="text-[10px] text-muted-foreground/50 group-hover:text-muted-foreground/70 transition-colors ml-2 hidden group-hover:inline">
                                {item.shortcut}
                              </span>
                            )}
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          )}
        </SidebarContent>
        <SidebarFooter className="border-t border-sidebar-border p-2">
          <div className="flex flex-col gap-2">
            {isSuperAdmin && (
              <div className="px-2 py-1 group-data-[collapsible=icon]:hidden">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Eye className="h-3 w-3 text-muted-foreground" />
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">View As</span>
                </div>
                <Select
                  value={viewAsMode}
                  onValueChange={(value) => setViewAsMode(value as ViewAsMode)}
                >
                  <SelectTrigger className="h-8 text-xs" data-testid="select-view-as-mode">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="super_admin">Super Admin</SelectItem>
                    <SelectItem value="lender">Lender / Broker</SelectItem>
                    <SelectItem value="borrower">Borrower</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            {user && (
              <div className="px-2 py-2 flex items-center gap-2 group-data-[collapsible=icon]:hidden">
                <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center text-white text-xs font-semibold shrink-0">
                  {user.firstName?.charAt(0)}{user.lastName?.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">
                    {user.firstName} {user.lastName}
                  </div>
                  {isAdmin && (
                    <Badge variant="default" className="mt-1 text-xs px-2 py-0.5 h-auto">
                      <Shield className="h-3 w-3 mr-1" />
                      {user.role?.replace('_', ' ')}
                    </Badge>
                  )}
                </div>
              </div>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              className="w-full justify-start gap-2"
              data-testid="button-logout"
            >
              <LogOut className="h-4 w-4" />
              <span className="group-data-[collapsible=icon]:hidden">Sign Out</span>
            </Button>
          </div>
        </SidebarFooter>
      </Sidebar>
      </div>

      <div className="flex flex-col flex-1 overflow-hidden min-w-0">
        {isPreviewingOtherRole && (
          <div className="flex items-center justify-between gap-2 px-3 py-1.5 bg-amber-500/10 border-b border-amber-500/20 shrink-0">
            <div className="flex items-center gap-2">
              <Eye className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
              <span className="text-xs font-medium text-amber-700 dark:text-amber-300">
                Previewing as {viewAsMode === "borrower" ? "Borrower" : "Lender / Broker"}
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setViewAsMode("super_admin")}
              className="h-6 text-xs text-amber-700 dark:text-amber-300"
              data-testid="button-exit-preview"
            >
              <X className="h-3 w-3 mr-1" />
              Exit Preview
            </Button>
          </div>
        )}
        <header className="flex items-center gap-2 p-2 md:p-3 border-b border-border bg-card/80 backdrop-blur-md shrink-0">
          <SidebarTrigger data-testid="button-toggle-sidebar" className="shrink-0" />
          <span className="text-sm font-medium text-muted-foreground truncate md:hidden">
            {user?.firstName ? `Hi, ${user.firstName}` : 'Lendry.AI'}
          </span>
        </header>
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>

      <CommandPalette open={commandPaletteOpen} onOpenChange={setCommandPaletteOpen} />

      {isAdmin && !isPreviewingOtherRole && <ProcessorAssistant isOpen={assistantOpen} onOpenChange={setAssistantOpen} />}

      {isAdmin && !isPreviewingOtherRole && <TrainingChecklist />}

      {isAdmin && !assistantOpen && !isPreviewingOtherRole && (
        <button
          onClick={() => setAssistantOpen(true)}
          className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-200 flex items-center justify-center group"
          title="Your Assistant (Alt+A)"
          data-testid="fab-your-assistant"
        >
          <BotMessageSquare className="h-6 w-6 group-hover:scale-110 transition-transform" />
        </button>
      )}
    </div>
  );
}

const SIDEBAR_PINNED_KEY = "lendry_sidebar_pinned";

export function AppLayout({ children }: AppLayoutProps) {
  const [pinned, setPinned] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem(SIDEBAR_PINNED_KEY) === "true";
    }
    return false;
  });

  useEffect(() => {
    localStorage.setItem(SIDEBAR_PINNED_KEY, String(pinned));
  }, [pinned]);

  const style = {
    "--sidebar-width": "17rem",
    "--sidebar-width-icon": "4.5rem",
  };

  return (
    <SidebarProvider
      defaultOpen={pinned}
      style={style as React.CSSProperties}
    >
      <AppLayoutContent
        sidebarPinnedProp={pinned}
        setSidebarPinnedProp={setPinned}
      >
        {children}
      </AppLayoutContent>
    </SidebarProvider>
  );
}
