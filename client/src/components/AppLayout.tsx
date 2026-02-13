import { useState, useEffect } from "react";
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
  ShieldCheck,
  DollarSign,
  Sparkles,
  ClipboardEdit,
  Search,
} from "lucide-react";
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
import { InboxBadge } from "@/components/InboxBadge";
import { CommandPalette } from "@/components/CommandPalette";
import sphinxLogo from "@assets/Sphinx_Capital_Logo_-_Blue_-_No_Background_(1)_1769811166428.jpeg";
import type { PermissionKey } from "@shared/schema";

interface AppLayoutProps {
  children: React.ReactNode;
}

interface NavItem {
  href: string;
  label: string;
  icon: any;
  showBadge?: boolean;
  requiredPermission?: PermissionKey;
  shortcut?: string;
}

const brokerNavItems: NavItem[] = [
  { href: "/", label: "New Quote", icon: Calculator, shortcut: undefined },
  { href: "/quotes", label: "Saved Quotes", icon: FileText, shortcut: undefined },
  { href: "/agreements", label: "Term Sheets", icon: ClipboardList, shortcut: undefined },
  { href: "/deals", label: "Loans", icon: FolderKanban, shortcut: undefined },
  { href: "/commissions", label: "My Commissions", icon: DollarSign, shortcut: undefined },
  { href: "/commercial/dashboard", label: "Commercial", icon: Building2, shortcut: undefined },
  { href: "/messages", label: "Messages", icon: MessageSquare, showBadge: true, shortcut: undefined },
  { href: "/resources", label: "Resources", icon: BookOpen, shortcut: undefined },
];

const borrowerNavItems: NavItem[] = [
  { href: "/", label: "My Loans", icon: FolderKanban },
  { href: "/borrower-quote", label: "Get a Quote", icon: Calculator },
  { href: "/borrower-quotes", label: "My Quotes", icon: FileText },
  { href: "/messages", label: "Messages", icon: MessageSquare, showBadge: true },
  { href: "/resources", label: "Resources", icon: BookOpen },
];

const adminNavItems: NavItem[] = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, shortcut: "⌘1" },
  { href: "/admin/deals", label: "Pipeline", icon: FileText, requiredPermission: "pipeline.view", shortcut: "⌘2" },
  { href: "/admin/commercial-submissions", label: "Commercial Deals", icon: Building2, requiredPermission: "commercial.view" },
  { href: "/admin/commercial/config", label: "Commercial Config", icon: ClipboardEdit, requiredPermission: "commercial.manage" },
  { href: "/admin/partners", label: "Partners", icon: Handshake, requiredPermission: "partners.view" },
  { href: "/admin/credit-policies", label: "Credit Policies", icon: ShieldCheck, requiredPermission: "programs.view" },
  { href: "/admin/programs", label: "Programs", icon: Settings2, requiredPermission: "programs.view" },
  { href: "/admin/ai-review", label: "AI Review", icon: Sparkles, requiredPermission: "programs.view" },
  { href: "/admin/onboarding", label: "Onboarding", icon: BookOpen, requiredPermission: "onboarding.view" },
  { href: "/admin/digests", label: "Digests", icon: CalendarDays, requiredPermission: "digests.view" },
  { href: "/admin/users", label: "Users", icon: Users, requiredPermission: "users.view", shortcut: "⌘3" },
  { href: "/messages", label: "Messages", icon: MessageSquare, showBadge: true, requiredPermission: "messages.view" },
  { href: "/admin/settings", label: "Settings", icon: Settings, requiredPermission: "settings.view" },
];

function AppLayoutContent({ children }: AppLayoutProps) {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const { setOpenMobile, isMobile } = useSidebar();
  const { hasPermission, isSuperAdmin } = usePermissions();
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

  const isAdmin = user?.role && ['admin', 'staff', 'super_admin', 'processor'].includes(user.role);
  const isBorrower = user?.userType === 'borrower';

  const navItems = isBorrower ? borrowerNavItems : brokerNavItems;

  const filteredAdminItems = adminNavItems.filter(item => {
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
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="flex h-screen w-full bg-background">
      <Sidebar collapsible="icon">
        <SidebarHeader className="p-4 border-b border-sidebar-border space-y-3">
          <div className="flex flex-col items-start gap-1">
            <img
              src={sphinxLogo}
              alt="Sphinx Capital"
              className="h-[52px] w-auto object-contain group-data-[collapsible=icon]:h-10 group-data-[collapsible=icon]:w-10"
            />
            <span className="text-[10px] text-muted-foreground font-medium group-data-[collapsible=icon]:hidden">
              Intelligent Lending
            </span>
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
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/60 px-0 pb-2">
              {isBorrower ? 'Lending' : 'Deals'}
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
                          <Icon className="h-5 w-5" />
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
          
          {isAdmin && (
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
                            <Icon className="h-5 w-5" />
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

      <div className="flex flex-col flex-1 overflow-hidden min-w-0">
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
    </div>
  );
}

export function AppLayout({ children }: AppLayoutProps) {
  const style = {
    "--sidebar-width": "17rem",
    "--sidebar-width-icon": "3.5rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <AppLayoutContent>{children}</AppLayoutContent>
    </SidebarProvider>
  );
}
