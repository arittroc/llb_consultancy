import { env, database } from "@/lib/supabase";
import { equal } from "@/lib/booking-access";
import { calendarBusy, calendarEventId, calendarEventState, deleteCalendarEvent, GoogleProviderError, ResendProviderError, sendAppointmentEmail, upsertCalendarEvent } from "@/lib/providers";
import type { Appointment } from "@/lib/appointments";

export const dynamic = "force-dynamic";
export const maxDuration = 120;
type Job = { id: string; appointment_id: string; lock_token: string; kind: "receipt" | "confirm" | "reschedule" | "cancel" };
const noStore = { "Cache-Control": "private, no-store" };

class JobError extends Error {
  constructor(public code: string, public retryable: boolean) { super(code); }
}

async function run(job: Job) {
  const db = database();
  const args = { p_id: job.id, p_lock_token: job.lock_token };
  try {
    const result = await db.from("appointments").select("*").eq("id", job.appointment_id).single();
    if (result.error) throw new JobError("appointment_read", true);
    const a: Appointment = result.data;
    const id = a.google_event_id || calendarEventId(a.id);
    async function beforeCalendarWrite() {
      const checkpoint = await db.rpc("mark_job_calendar_write", args);
      if (checkpoint.error || !checkpoint.data) throw new JobError("calendar_checkpoint", true);
    }

    let meet = a.meet_url;
    let eventId: string | null = null;
    if (job.kind === "confirm" || job.kind === "reschedule") {
      const current = await calendarEventState(id);
      const matches = current && Date.parse(current.startsAt) === Date.parse(a.starts_at)
        && Date.parse(current.endsAt) === Date.parse(a.ends_at);
      if (!matches) {
        const end = new Date(Date.parse(a.ends_at) + a.buffer_minutes * 60_000).toISOString();
        const busy = await calendarBusy(a.starts_at, end, job.kind === "reschedule" ? id : undefined);
        if (busy.length) throw new JobError("calendar_conflict", false);
      }
      if (!matches || !current.meetUrl) await beforeCalendarWrite();
      const synced = matches && current.meetUrl ? { eventId: id, meetUrl: current.meetUrl } : await upsertCalendarEvent(a);
      if (!synced) throw new JobError("meet_pending", true);
      eventId = synced.eventId;
      meet = synced.meetUrl;
    }
    if (job.kind === "cancel") {
      await beforeCalendarWrite();
      await deleteCalendarEvent(id);
    }
    let emailId: string | null = null;
    if (job.kind !== "receipt" || a.status === "pending") {
      const checkpoint = await db.rpc("mark_job_email_send", args);
      if (checkpoint.error || !checkpoint.data) throw new JobError("email_checkpoint", true);
      // The first attempted send anchors the provider's deduplication window.
      if (Date.now() - Date.parse(checkpoint.data) >= 23 * 60 * 60 * 1000) {
        throw new JobError("verify_email_delivery", false);
      }
      const startsAt = job.kind === "receipt" ? a.requested_at_slot : a.starts_at;
      emailId = await sendAppointmentEmail(job.kind, { ...a, starts_at: startsAt, meet_url: meet }, job.id);
    }
    const completion = await db.rpc("complete_job", { ...args, p_event_id: eventId, p_meet_url: meet, p_email_id: emailId });
    if (completion.error || !completion.data) throw new JobError("job_commit", true);
  } catch (error) {
    const known = error instanceof JobError || error instanceof GoogleProviderError || error instanceof ResendProviderError;
    const failure = await db.rpc("fail_job", { ...args, p_error: known ? error.code : "job_error", p_retry: known ? error.retryable : true });
    if (failure.error || !failure.data) throw new Error("job_state_update_failed");
  }
}

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || !equal(request.headers.get("authorization") || "", "Bearer " + env("CRON_SECRET"))) {
    return Response.json({ error: "Unauthorized" }, { status: 401, headers: noStore });
  }
  try {
    const jobs = await database().rpc("claim_jobs", { p_limit: 2 });
    if (jobs.error) throw new Error("job_claim_failed");
    const results = await Promise.allSettled((jobs.data as Job[]).map(run));
    const healthy = results.every(result => result.status === "fulfilled");
    return Response.json({ processed: results.length }, { status: healthy ? 200 : 500, headers: noStore });
  } catch {
    return Response.json({ error: "Job processing is unavailable." }, { status: 503, headers: noStore });
  }
}
