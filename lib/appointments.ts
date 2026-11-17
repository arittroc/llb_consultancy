import "server-only";
import { z } from "zod";
import { database } from "./supabase";
import { availableStarts } from "./time";
import { calendarBusy } from "./providers";

export const bookingSchema = z.object({
  key: z.uuid(),
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().toLowerCase().max(254).pipe(z.email()),
  start: z.iso.datetime(),
  invite: z.string().max(180).optional(),
});
export const emailSchema = z.string().trim().toLowerCase().max(254).pipe(z.email());
export type Appointment = {
  id: string; name: string; email: string; requested_at_slot: string; starts_at: string; ends_at: string;
  status: string; meet_url: string | null; google_event_id: string | null;
  buffer_minutes: number; previous_starts_at: string | null; previous_ends_at: string | null;
  previous_buffer_minutes: number | null;
};
export const weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export async function slots(now = new Date()) {
  const db = database();
  const rules = await db.from("availability_rules").select("weekday, opens_at, closes_at");
  const settings = await db.from("booking_settings").select("slot_minutes, buffer_minutes, window_days").eq("id", 1).single();
  if (rules.error || settings.error) throw new Error("availability_configuration");
  const until = new Date(+now + (settings.data.window_days + 1) * 86_400_000);
  const [blackouts, appointments, busy] = await Promise.all([
    db.from("blackout_dates").select("date").gte("date", now.toISOString().slice(0, 10)).lte("date", until.toISOString().slice(0, 10)),
    db.from("appointments").select("starts_at,ends_at,buffer_minutes,previous_starts_at,previous_ends_at,previous_buffer_minutes")
      .in("status", ["confirming", "confirmed", "cancelling"])
      .or("ends_at.gte." + new Date(+now - 86_400_000).toISOString() + ",previous_ends_at.gte." + new Date(+now - 86_400_000).toISOString()),
    calendarBusy(now.toISOString(), until.toISOString()),
  ]);
  if (blackouts.error || appointments.error) throw new Error("availability_read");
  const ranges = appointments.data.flatMap(a => {
    const current = { start: a.starts_at, end: new Date(Date.parse(a.ends_at) + a.buffer_minutes * 60_000).toISOString() };
    if (!a.previous_starts_at || !a.previous_ends_at) return [current];
    return [current, { start: a.previous_starts_at, end: new Date(Date.parse(a.previous_ends_at) + (a.previous_buffer_minutes ?? 0) * 60_000).toISOString() }];
  });
  return {
    starts: availableStarts(rules.data, blackouts.data.map(x => x.date), settings.data, busy, ranges, now),
    minutes: settings.data.slot_minutes as number,
  };
}

export function bookingError(code?: string) {
  if (code === "53300") return "Too many requests. Please try again in an hour.";
  if (code === "23P01" || code === "P0001") return "That action is no longer available. Refresh the page and check the current status.";
  return "The request could not be processed. Please try again.";
}
