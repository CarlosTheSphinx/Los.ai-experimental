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
}

const brokerNavItems: NavItem[] = [
  { href: "/", label: "New Quote", icon: Calculator },
  { href: "/quotes", label: "Saved Quotes", icon: FileText },
  { href: "/agreements", label: "Term Sheets", icon: ClipboardList },
  { href: "/projects", label: "Loans", icon: FolderKanban },
  { href: "/commissions", label: "My Commissions", icon: DollarSign },
  { href: "/commercial-submission/new", label: "Commercial", icon: Building2 },
  { href: "/messages", label: "Messages", icon: MessageSquare, showBadge: true },
  { href: "/resources", label: "Resources", icon: BookOpen },
];

const borrowerNavItems: NavItem[] = [
  { href: "/", label: "My Loans", icon: FolderKanban },
  { href: "/borrower-quote", label: "Get a Quote", icon: Calculator },
  { href: "/borrower-quotes", label: "My Quotes", icon: FileText },
  { href: "/messages", label: "Messages", icon: MessageSquare, showBadge: true },
  { href: "/resources", label: "Resources", icon: BookOpen },
];

const adminNavItems: NavItem[] = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/deals", label: "Pipeline", icon: FileText, requiredPermission: "pipeline.view" },
  { href: "/admin/commercial-submissions", label: "Commercial", icon: Building2, requiredPermission: "commercial.view" },
  { href: "/admin/partners", label: "Partners", icon: Handshake, requiredPermission: "partners.view" },
  { href: "/admin/credit-policies", label: "Credit Policies", icon: ShieldCheck, requiredPermission: "programs.view" },
  { href: "/admin/programs", label: "Programs", icon: Settings2, requiredPermission: "programs.view" },
  { href: "/admin/ai-review", label: "AI Review", icon: Sparkles, requiredPermission: "programs.view" },
  { href: "/admin/onboarding", label: "Onboarding", icon: BookOpen, requiredPermission: "onboarding.view" },
  { href: "/admin/digests", label: "Digests", icon: CalendarDays, requiredPermission: "digests.view" },
  { href: "/admin/users", label: "Users", icon: Users, requiredPermission: "users.view" },
  { href: "/messages", label: "Messages", icon: MessageSquare, showBadge: true, requiredPermission: "messages.view" },
  { href: "/admin/settings", label: "Settings", icon: Settings, requiredPermission: "settings.view" },
];

function AppLayoutContent({ children }: AppLayoutProps) {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const { setOpenMobile, isMobile } = useSidebar();
  const { hasPermission, isSuperAdmin } = usePermissions();
  
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

  return (
    <div className="flex h-screen w-full bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100">
      <Sidebar collapsible="icon">
        <SidebarHeader className="p-4 border-b border-sidebar-border">
          <div className="flex items-center gap-2">
            <img 
              src={sphinxLogo} 
              alt="Sphinx Capital" 
              className="h-[52px] w-auto object-contain group-data-[collapsible=icon]:h-10 group-data-[collapsible=icon]:w-10"
            />
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {navItems.map((item) => {
                  const isActive = location === item.href || 
                    (item.href !== "/" && location.startsWith(item.href) && !location.startsWith("/admin"));
                  const Icon = item.icon;
                  
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton 
                        asChild 
                        isActive={isActive}
                        tooltip={item.label}
                      >
                        <Link 
                          href={item.href}
                          data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                          onClick={handleNavClick}
                        >
                          <Icon className="h-5 w-5" />
                          <span className="flex items-center gap-1">
                            {item.label}
                            {'showBadge' in item && item.showBadge && <InboxBadge />}
                          </span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
          
          {isAdmin && (
            <SidebarGroup>
              <SidebarGroupLabel className="flex items-center gap-2">
                <Shield className="h-3 w-3" />
                Admin
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {filteredAdminItems.map((item) => {
                    const isActive = location === item.href || 
                      (item.href !== "/admin" && location.startsWith(item.href));
                    const Icon = item.icon;
                    
                    return (
                      <SidebarMenuItem key={item.href}>
                        <SidebarMenuButton 
                          asChild 
                          isActive={isActive}
                          tooltip={item.label}
                        >
                          <Link 
                            href={item.href}
                            data-testid={`nav-admin-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                            onClick={handleNavClick}
                          >
                            <Icon className="h-5 w-5" />
                            <span className="flex items-center gap-1">
                              {item.label}
                              {'showBadge' in item && item.showBadge && <InboxBadge />}
                            </span>
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
              <div className="px-2 py-1 group-data-[collapsible=icon]:hidden">
                <div className="text-sm text-muted-foreground truncate">
                  {user.firstName} {user.lastName}
                </div>
                {isAdmin && (
                  <Badge variant="secondary" className="mt-1 text-xs">
                    <Shield className="h-3 w-3 mr-1" />
                    {user.role?.replace('_', ' ')}
                  </Badge>
                )}
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
        <header className="flex items-center gap-2 p-2 md:p-3 border-b border-slate-200 bg-white/80 backdrop-blur-md shrink-0">
          <SidebarTrigger data-testid="button-toggle-sidebar" className="shrink-0" />
          <span className="text-sm font-medium text-slate-600 truncate md:hidden">
            {user?.firstName ? `Hi, ${user.firstName}` : 'Sphinx Capital'}
          </span>
        </header>
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}

export function AppLayout({ children }: AppLayoutProps) {
  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3.5rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <AppLayoutContent>{children}</AppLayoutContent>
    </SidebarProvider>
  );
}
