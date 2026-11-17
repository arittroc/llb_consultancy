export const zone = "Asia/Kolkata";
const dayFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" });
export const istDay = (value: Date | string) => dayFormatter.format(new Date(value));
export const formatDay = new Intl.DateTimeFormat("en-IN", { timeZone: zone, weekday: "long", day: "numeric", month: "short" });
export const formatTime = new Intl.DateTimeFormat("en-IN", { timeZone: zone, hour: "numeric", minute: "2-digit" });
export const formatAppointment = new Intl.DateTimeFormat("en-IN", { timeZone: zone, weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const minute = 60_000;
const day = 24 * 60 * minute;

export function availableStarts(
  rules: { weekday: number; opens_at: string; closes_at: string }[],
  blackouts: string[],
  settings: { slot_minutes: number; buffer_minutes: number; window_days: number },
  busy: { start: string; end: string }[],
  reserved: { start: string; end: string }[],
  now = new Date(),
) {
  const midnight = Date.parse(istDay(now) + "T00:00:00+05:30");
  const duration = settings.slot_minutes * minute;
  const buffer = settings.buffer_minutes * minute;
  const intervals = (ranges: typeof busy) => ranges.map(r => [Date.parse(r.start), Date.parse(r.end)]);
  const busyTimes = intervals(busy);
  const reservedTimes = intervals(reserved);
  const slots = new Set<string>();
  for (let i = 0; i < settings.window_days; i++) {
    const date = new Date(midnight + i * day + 6 * 60 * minute);
    const dateKey = istDay(date);
    if (blackouts.includes(dateKey)) continue;
    const weekday = date.getUTCDay() || 7;
    for (const rule of rules.filter(r => r.weekday === weekday)) {
      const open = Date.parse(dateKey + "T" + rule.opens_at + "+05:30");
      const close = Date.parse(dateKey + "T" + rule.closes_at + "+05:30");
      for (let start = open; start + duration <= close; start += duration + buffer) {
        const end = start + duration;
        if (start <= now.getTime()) continue;
        if (busyTimes.some(([from, to]) => start < to && end + buffer > from)) continue;
        if (reservedTimes.some(([from, to]) => start < to && end + buffer > from)) continue;
        slots.add(new Date(start).toISOString());
      }
    }
  }
  return [...slots].sort();
}
