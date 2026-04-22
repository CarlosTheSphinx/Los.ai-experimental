// Business-hours utility for SLA computation.
// Mon-Fri 9 AM - 5 PM America/New_York. No holiday calendar.

const TZ = 'America/New_York';
const DAY_START_HOUR = 9;
const DAY_END_HOUR = 17;
const HOURS_PER_DAY = DAY_END_HOUR - DAY_START_HOUR; // 8

interface NyParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number; // 0=Sun..6=Sat
}

function getNyParts(d: Date): NyParts {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    weekday: 'short',
  });
  const parts = fmt.formatToParts(d);
  const get = (t: string) => parts.find(p => p.type === t)?.value || '';
  const wkMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    year: parseInt(get('year'), 10),
    month: parseInt(get('month'), 10),
    day: parseInt(get('day'), 10),
    hour: parseInt(get('hour'), 10) % 24,
    minute: parseInt(get('minute'), 10),
    second: parseInt(get('second'), 10),
    weekday: wkMap[get('weekday')] ?? 0,
  };
}

// Build a UTC Date that corresponds to a given Y/M/D H:M:S in America/New_York.
function nyDateToUtc(year: number, month: number, day: number, hour: number, minute = 0, second = 0): Date {
  // Start with a guess (treating the values as UTC) and correct using the
  // observed offset between that guess and what NY shows for it.
  let guess = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  for (let i = 0; i < 3; i++) {
    const p = getNyParts(guess);
    const observedUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    const desiredUtc = Date.UTC(year, month - 1, day, hour, minute, second);
    const drift = desiredUtc - observedUtc;
    if (drift === 0) return guess;
    guess = new Date(guess.getTime() + drift);
  }
  return guess;
}

function isBusinessDay(weekday: number): boolean {
  return weekday >= 1 && weekday <= 5;
}

function nextBusinessDayStart(p: NyParts): Date {
  // Move forward until weekday in 1..5, then return 9:00 of that day.
  let { year, month, day } = p;
  let cursor = nyDateToUtc(year, month, day, 9, 0, 0);
  for (let i = 0; i < 14; i++) {
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
    const cp = getNyParts(cursor);
    if (isBusinessDay(cp.weekday)) {
      return nyDateToUtc(cp.year, cp.month, cp.day, 9, 0, 0);
    }
  }
  return cursor; // safety net
}

function clampToBusinessHours(d: Date): Date {
  const p = getNyParts(d);
  if (!isBusinessDay(p.weekday)) {
    return nextBusinessDayStart(p);
  }
  if (p.hour < DAY_START_HOUR) {
    return nyDateToUtc(p.year, p.month, p.day, DAY_START_HOUR, 0, 0);
  }
  if (p.hour >= DAY_END_HOUR) {
    return nextBusinessDayStart(p);
  }
  return d;
}

// Add N business hours to a starting Date, honoring Mon-Fri 9-5 NY.
export function addBusinessHours(start: Date, hours: number): Date {
  let cursor = clampToBusinessHours(start);
  let remainingMs = hours * 60 * 60 * 1000;

  while (remainingMs > 0) {
    const p = getNyParts(cursor);
    const endOfDay = nyDateToUtc(p.year, p.month, p.day, DAY_END_HOUR, 0, 0);
    const msLeftToday = endOfDay.getTime() - cursor.getTime();
    if (remainingMs <= msLeftToday) {
      return new Date(cursor.getTime() + remainingMs);
    }
    remainingMs -= msLeftToday;
    cursor = nextBusinessDayStart(p);
  }
  return cursor;
}

// Add N business days. End-of-day on the Nth business day at 5 PM NY.
export function addBusinessDays(start: Date, days: number): Date {
  let cursor = clampToBusinessHours(start);
  let p = getNyParts(cursor);
  for (let i = 0; i < days; i++) {
    cursor = nextBusinessDayStart(p);
    p = getNyParts(cursor);
  }
  // End at 5 PM on that day
  return nyDateToUtc(p.year, p.month, p.day, DAY_END_HOUR, 0, 0);
}

// Add N calendar hours
export function addCalendarHours(start: Date, hours: number): Date {
  return new Date(start.getTime() + hours * 60 * 60 * 1000);
}

// Compute response_due_at from ticket type
export function computeResponseDueAt(type: string, createdAt: Date = new Date()): Date {
  if (type === 'help') return addBusinessHours(createdAt, 4);
  if (type === 'bug') return addCalendarHours(createdAt, 24);
  if (type === 'feature') return addBusinessDays(createdAt, 5);
  return addBusinessHours(createdAt, 4);
}
