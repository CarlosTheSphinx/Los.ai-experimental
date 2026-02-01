import { Link, useLocation } from "wouter";
import { 
  Calculator, 
  FileText, 
  ClipboardList
} from "lucide-react";
import { 
  Sidebar, 
  SidebarContent, 
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarProvider,
  SidebarTrigger
} from "@/components/ui/sidebar";
import sphinxLogo from "@assets/Sphinx_Capital_Logo_-_Blue_-_No_Background_(1)_1769811166428.jpeg";

interface AppLayoutProps {
  children: React.ReactNode;
}

const navItems = [
  { href: "/", label: "New Quote", icon: Calculator },
  { href: "/quotes", label: "Saved Quotes", icon: FileText },
  { href: "/agreements", label: "Agreements", icon: ClipboardList },
];

export function AppLayout({ children }: AppLayoutProps) {
  const [location] = useLocation();

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
                className="h-10 w-auto object-contain group-data-[collapsible=icon]:h-8 group-data-[collapsible=icon]:w-8"
              />
            </div>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  {navItems.map((item) => {
                    const isActive = location === item.href || 
                      (item.href !== "/" && location.startsWith(item.href));
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
                            <span>{item.label}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
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
