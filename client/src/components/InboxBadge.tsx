import { useEffect, useState } from "react";
import { getUnreadCount } from "@/lib/messagesApi";
import { Badge } from "@/components/ui/badge";

export function InboxBadge() {
  const [count, setCount] = useState<number>(0);

  useEffect(() => {
    let alive = true;

    async function tick() {
      try {
        const data = await getUnreadCount();
        if (alive) setCount(data.unreadCount ?? 0);
      } catch {
        // ignore errors
      }
    }

    tick();
    const id = setInterval(tick, 15000); // Poll every 15 seconds
    return () => { alive = false; clearInterval(id); };
  }, []);

  if (!count) return null;

  return (
    <Badge 
      variant="destructive" 
      className="ml-2 min-w-[20px] h-5 flex items-center justify-center text-xs"
      data-testid="badge-unread-count"
    >
      {count > 99 ? "99+" : count}
    </Badge>
  );
}
