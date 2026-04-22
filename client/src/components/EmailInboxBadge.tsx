import { useEffect, useState } from "react";

export function EmailInboxBadge() {
  const [count, setCount] = useState<number>(0);

  useEffect(() => {
    let alive = true;

    async function tick() {
      try {
        const res = await fetch('/api/email/unread-count', { credentials: 'include' });
        if (!res.ok) return;
        const data = await res.json();
        if (alive) setCount(data.unreadCount ?? 0);
      } catch {
        // ignore network errors
      }
    }

    tick();
    const id = setInterval(tick, 60000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  if (!count) return null;

  return (
    <span
      className="absolute -top-1.5 -right-1.5 flex items-center justify-center min-w-[16px] h-[16px] px-0.5 rounded-full bg-red-500 text-white text-[9px] font-bold leading-none ring-2 ring-background"
      data-testid="badge-email-unread-count"
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
