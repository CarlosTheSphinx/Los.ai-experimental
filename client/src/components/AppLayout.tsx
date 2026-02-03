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
  SidebarTrigger
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { InboxBadge } from "@/components/InboxBadge";
import sphinxLogo from "@assets/Sphinx_Capital_Logo_-_Blue_-_No_Background_(1)_1769811166428.jpeg";

interface AppLayoutProps {
  children: React.ReactNode;
}

const brokerNavItems = [
  { href: "/", label: "New Quote", icon: Calculator },
  { href: "/quotes", label: "Saved Quotes", icon: FileText },
  { href: "/agreements", label: "Agreements", icon: ClipboardList },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/messages", label: "Messages", icon: MessageSquare, showBadge: true },
  { href: "/resources", label: "Resources", icon: BookOpen },
];

const borrowerNavItems = [
  { href: "/", label: "My Loans", icon: FolderKanban },
  { href: "/messages", label: "Messages", icon: MessageSquare, showBadge: true },
  { href: "/resources", label: "Resources", icon: BookOpen },
];

const adminNavItems = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/deals", label: "Deals", icon: FileText },
  { href: "/admin/partners", label: "Partners", icon: Handshake },
  { href: "/admin/programs", label: "Programs", icon: Settings2 },
  { href: "/admin/onboarding", label: "Onboarding", icon: BookOpen },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/projects", label: "All Projects", icon: FolderKanban },
  { href: "/messages", label: "Messages", icon: MessageSquare, showBadge: true },
  { href: "/admin/settings", label: "Settings", icon: Settings },
];

export function AppLayout({ children }: AppLayoutProps) {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  
  const isAdmin = user?.role && ['admin', 'staff', 'super_admin'].includes(user.role);
  const isBorrower = user?.userType === 'borrower';
  
  // Select navigation items based on user type
  const navItems = isBorrower ? borrowerNavItems : brokerNavItems;

  const handleLogout = async () => {
    await logout();
  };

  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3.5rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
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
                    {adminNavItems.map((item) => {
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

        <div className="flex flex-col flex-1 overflow-hidden">
          <header className="flex items-center gap-2 p-2 border-b border-slate-200 bg-white/80 backdrop-blur-md">
            <SidebarTrigger data-testid="button-toggle-sidebar" />
          </header>
          <main className="flex-1 overflow-auto">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
