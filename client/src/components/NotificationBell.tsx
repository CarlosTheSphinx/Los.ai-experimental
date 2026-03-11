import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { Bell, FileUp, MessageSquare, Check, CheckCheck, ExternalLink, ClipboardList, AtSign, Mail, Paperclip, FileCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";

interface Notification {
  id: number;
  userId: number;
  type: string;
  title: string;
  message: string;
  dealId: number | null;
  link: string | null;
  isRead: boolean;
  createdAt: string;
}

export function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [, setLocation] = useLocation();

  const { data: countData } = useQuery<{ count: number }>({
    queryKey: ["/api/notifications/unread-count"],
    refetchInterval: 15000,
  });

  const { data: notificationsData, isLoading } = useQuery<{ notifications: Notification[] }>({
    queryKey: ["/api/notifications"],
    enabled: isOpen,
  });

  const markReadMutation = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/notifications/${id}/read`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/notifications/read-all"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
    },
  });

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const unreadCount = countData?.count || 0;
  const notificationsList = notificationsData?.notifications || [];

  function getNotificationIcon(type: string) {
    switch (type) {
      case "document_uploaded":
        return <FileUp className="h-4 w-4 text-blue-500" />;
      case "new_message":
        return <MessageSquare className="h-4 w-4 text-green-500" />;
      case "task_assigned":
        return <ClipboardList className="h-4 w-4 text-orange-500" />;
      case "mention_in_note":
        return <AtSign className="h-4 w-4 text-purple-500" />;
      case "new_email":
        return <Mail className="h-4 w-4 text-indigo-500" />;
      case "email_document_detected":
        return <Paperclip className="h-4 w-4 text-amber-500" />;
      case "term_sheet_signed":
        return <FileCheck className="h-4 w-4 text-emerald-500" />;
      default:
        return <Bell className="h-4 w-4 text-muted-foreground" />;
    }
  }

  function handleNotificationClick(notif: Notification) {
    if (!notif.isRead) {
      markReadMutation.mutate(notif.id);
    }
    if (notif.link) {
      setLocation(notif.link);
      setIsOpen(false);
    }
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <Button
        size="icon"
        onClick={() => setIsOpen(!isOpen)}
        className="relative h-10 w-10 rounded-full bg-primary hover:bg-primary/90 text-white"
        data-testid="button-notification-bell"
      >
        <Bell className="!h-5 !w-5" />
        {unreadCount > 0 && (
          <span
            className="absolute -top-1 -right-1 flex items-center justify-center min-w-[20px] h-[20px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold leading-none ring-2 ring-background"
            data-testid="badge-notification-count"
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </Button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-96 max-h-[480px] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-lg z-50 flex flex-col">
          <div className="flex items-center justify-between gap-2 px-4 py-3 border-b shrink-0">
            <h3 className="text-sm font-semibold">Notifications</h3>
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => markAllReadMutation.mutate()}
                disabled={markAllReadMutation.isPending}
                className="text-xs h-7"
                data-testid="button-mark-all-read"
              >
                <CheckCheck className="h-3.5 w-3.5 mr-1" />
                Mark all read
              </Button>
            )}
          </div>

          <div className="overflow-y-auto flex-1">
            {isLoading ? (
              <div className="p-6 text-center text-sm text-muted-foreground">Loading...</div>
            ) : notificationsList.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                No notifications yet
              </div>
            ) : (
              notificationsList.slice(0, 30).map((notif) => (
                <button
                  key={notif.id}
                  onClick={() => handleNotificationClick(notif)}
                  className={`w-full text-left px-4 py-3 border-b last:border-b-0 hover-elevate transition-colors cursor-pointer flex gap-3 ${
                    !notif.isRead ? "bg-primary/5" : ""
                  }`}
                  data-testid={`notification-item-${notif.id}`}
                >
                  <div className="shrink-0 mt-0.5">
                    {getNotificationIcon(notif.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className={`text-sm leading-tight ${!notif.isRead ? "font-semibold" : "font-medium"}`}>
                        {notif.title}
                      </p>
                      {!notif.isRead && (
                        <span className="shrink-0 h-2 w-2 rounded-full bg-primary mt-1.5" />
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                      {notif.message}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[11px] text-muted-foreground/70">
                        {notif.createdAt && !isNaN(new Date(notif.createdAt).getTime())
                          ? formatDistanceToNow(new Date(notif.createdAt), { addSuffix: true })
                          : "recently"}
                      </span>
                      {notif.dealId && (
                        <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                          DEAL-{notif.dealId}
                        </Badge>
                      )}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
