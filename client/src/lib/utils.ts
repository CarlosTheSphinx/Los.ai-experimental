import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

function safeDate(value: string | number | Date | null | undefined): Date | null {
  if (value == null || value === '') return null;
  const d = value instanceof Date ? value : new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

export function formatDateTime(dateStr: string | number | Date | null | undefined): string {
  const d = safeDate(dateStr);
  if (!d) return '—';
  const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  return `${date} · ${time}`;
}

export function formatDate(value: string | number | Date | null | undefined, fallback = '—'): string {
  const d = safeDate(value);
  if (!d) return fallback;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatDateFull(value: string | number | Date | null | undefined, options?: Intl.DateTimeFormatOptions, fallback = '—'): string {
  const d = safeDate(value);
  if (!d) return fallback;
  return d.toLocaleDateString('en-US', options || { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatTime(value: string | number | Date | null | undefined, fallback = '—'): string {
  const d = safeDate(value);
  if (!d) return fallback;
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

export function formatTimestamp(value: string | number | Date | null | undefined, fallback = '—'): string {
  const d = safeDate(value);
  if (!d) return fallback;
  return d.toLocaleString('en-US');
}

export function docActionPriority(status: string | null | undefined): number {
  switch (status) {
    case 'approved':
    case 'accepted':
    case 'waived':
    case 'not_applicable':
      return 3;
    case 'update_needed':
    case 'rejected':
    case 'uploaded':
    case 'submitted':
    case 'ai_reviewed':
    case 'conditional':
    case 'at_risk':
      return 2;
    default:
      return 1;
  }
}

export function taskActionPriority(status: string | null | undefined): number {
  switch (status) {
    case 'completed':
    case 'done':
      return 3;
    case 'in_progress':
    case 'blocked':
      return 2;
    default:
      return 1;
  }
}

export function sortByActionPriority<T>(items: T[], getPriority: (item: T) => number): T[] {
  return [...items].sort((a, b) => getPriority(a) - getPriority(b));
}
