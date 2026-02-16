import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { Dialog, DialogContent, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/use-auth';
import {
  LayoutDashboard,
  FileText,
  Users,
  Building2,
  Settings,
  Search,
  ArrowRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface CommandItem {
  id: string;
  label: string;
  description: string;
  icon: any;
  href: string;
  shortcut?: string;
}

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const isAdmin = user?.role && ['admin', 'staff', 'super_admin', 'processor'].includes(user.role);

  const commands: CommandItem[] = [
    {
      id: 'dashboard',
      label: 'Command Center',
      description: 'View dashboard and pipeline',
      icon: LayoutDashboard,
      href: '/admin',
      shortcut: '⌘1',
    },
    {
      id: 'users',
      label: 'Users',
      description: 'Manage users',
      icon: Users,
      href: '/admin/users',
      shortcut: '⌘2',
    },
    ...(isAdmin
      ? [
          {
            id: 'settings',
            label: 'Settings',
            description: 'Admin settings',
            icon: Settings,
            href: '/admin/settings',
          },
        ]
      : []),
  ];

  const filteredCommands = commands.filter((cmd) =>
    cmd.label.toLowerCase().includes(search.toLowerCase()) ||
    cmd.description.toLowerCase().includes(search.toLowerCase())
  );

  useEffect(() => {
    setSelectedIndex(0);
  }, [search]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!open) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => (i + 1) % filteredCommands.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => (i - 1 + filteredCommands.length) % filteredCommands.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filteredCommands[selectedIndex]) {
          setLocation(filteredCommands[selectedIndex].href);
          onOpenChange(false);
          setSearch('');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, selectedIndex, filteredCommands, setLocation, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden p-0 shadow-lg sm:rounded-lg">
        <div className="flex items-center border-b px-3">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search commands, pages..."
            className="border-0 outline-none ring-0 placeholder:text-muted-foreground focus-visible:ring-0"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
        </div>
        <div className="max-h-[300px] overflow-y-auto">
          {filteredCommands.length === 0 ? (
            <div className="py-6 text-center">
              <p className="text-sm text-muted-foreground">No commands found</p>
            </div>
          ) : (
            <div className="space-y-1 p-2">
              {filteredCommands.map((cmd, index) => {
                const Icon = cmd.icon;
                const isSelected = index === selectedIndex;
                return (
                  <button
                    key={cmd.id}
                    onClick={() => {
                      setLocation(cmd.href);
                      onOpenChange(false);
                      setSearch('');
                    }}
                    onMouseEnter={() => setSelectedIndex(index)}
                    className={cn(
                      'relative flex w-full cursor-pointer select-none items-center gap-3 rounded-md px-2 py-2 text-sm outline-none transition-colors',
                      isSelected ? 'bg-accent text-accent-foreground' : 'text-foreground hover:bg-muted'
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <div className="flex flex-1 flex-col text-left">
                      <span className="font-medium">{cmd.label}</span>
                      <span className={cn(
                        'text-xs',
                        isSelected ? 'text-accent-foreground/70' : 'text-muted-foreground'
                      )}>
                        {cmd.description}
                      </span>
                    </div>
                    {cmd.shortcut && (
                      <Badge variant="secondary" className="text-[10px] shrink-0">
                        {cmd.shortcut}
                      </Badge>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
