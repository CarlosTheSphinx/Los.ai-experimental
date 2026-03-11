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
    <span 
      className="absolute -top-1.5 -right-1.5 flex items-center justify-center min-w-[16px] h-[16px] px-0.5 rounded-full bg-red-500 text-white text-[9px] font-bold leading-none ring-2 ring-background"
      data-testid="badge-unread-count"
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
