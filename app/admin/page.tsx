import type { Metadata } from "next";
import Link from "next/link";
import { Shell } from "@/components/shell";
import { adminSession, authConfigured, database } from "@/lib/supabase";
import { formatAppointment, istDay } from "@/lib/time";
import { weekdays, type Appointment } from "@/lib/appointments";
import { changeAppointment, compareCalendar, editAvailability, inviteClient, signIn, signOut } from "./actions";
import { ActionForm, MfaSetup } from "./forms";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Advocate dashboard", robots: { index: false, follow: false } };

type Job = { id: string; kind: string; state: string; last_error: string | null; calendar_write_started_at: string | null };
type Rule = { weekday: number; opens_at: string; closes_at: string };
type Blackout = { date: string };
type Settings = { slot_minutes: number; buffer_minutes: number; window_days: number };

const authNote = <div className="panel"><p className="muted">The advocate dashboard needs its Supabase account configured.</p>
  {(process.env.NODE_ENV === "development" || process.env.ENABLE_DEMO === "true") && <Link className="button alt" href="/preview">Open workflow demo</Link>}</div>;

function Operation({ id, operation, label, children }: { id: string; operation: string; label: string; children?: React.ReactNode }) {
  return <ActionForm action={changeAppointment} label={label} compact secondary={operation !== "approve"} danger={operation === "cancel"}>
    <input type="hidden" name="id" value={id} /><input type="hidden" name="operation" value={operation} />{children}
  </ActionForm>;
}

const jobMessages: Record<string, string> = {
  calendar_conflict: "Google Calendar has a conflicting event.",
  meet_pending: "Google Meet is still generating the join link.",
  verify_email_delivery: "Check the delivery in Resend before resolving this job.",
};

function AppointmentEntry({ appt }: { appt: Appointment & { integration_jobs: Job[] } }) {
  const { id, name, email, starts_at, status, meet_url, integration_jobs } = appt;
  const failed = integration_jobs.filter(job => job.state === "failed");
  const canRetry = failed.some(job => job.last_error !== "verify_email_delivery");
  const canAbort = failed.some(job => job.kind !== "receipt" && job.last_error === "calendar_conflict" && !job.calendar_write_started_at);
  return <article className="entry stack">
    <div><h3>{name}</h3><span className="muted">{email}</span></div>
    <div><time dateTime={starts_at}>{formatAppointment.format(new Date(starts_at))} IST</time>{" "}<span className="badge">{status}</span></div>
    {meet_url && status === "confirmed" && <a href={meet_url} target="_blank" rel="noreferrer">Open Google Meet</a>}
    {failed.map(job => <div key={job.id} className="notice error">{job.kind === "receipt" ? "Receipt" : "Calendar or email job"} — {jobMessages[job.last_error || ""] || "A provider step needs attention. Check provider settings before retrying."}</div>)}
    {status === "pending" && <div className="inline">
      <Operation id={id} operation="approve" label="Approve request" />
      <Operation id={id} operation="decline" label="Decline request" />
    </div>}
    {status === "confirmed" && <>
      <Operation id={id} operation="reschedule" label="Reschedule"><label className="field">New time (IST)<input type="datetime-local" name="newStart" required /></label></Operation>
      <div className="inline">
        <ActionForm action={compareCalendar} label="Check Calendar sync" compact secondary><input type="hidden" name="id" value={id} /></ActionForm>
        <Operation id={id} operation="cancel" label="Cancel appointment" />
      </div>
    </>}
    {canRetry && <Operation id={id} operation="retry" label="Retry failed jobs" />}
    {canAbort && <Operation id={id} operation="abort" label={appt.previous_starts_at ? "Keep original time" : "Return to pending"} />}
  </article>;
}

function Schedule({ rules, blackouts, settings }: { rules: Rule[]; blackouts: Blackout[]; settings: Settings }) {
  return <section className="panel stack">
    <h2>Office hours</h2>
    <p className="muted">All times use IST. Changes apply to new reservations.</p>
    {weekdays.map((day, index) => {
      const rule = rules.find(row => row.weekday === index + 1);
      return <details key={day}>
        <summary>{day} · {rule ? rule.opens_at.slice(0, 5) + "–" + rule.closes_at.slice(0, 5) : "Closed"}</summary>
        <div className="stack entry">
          <ActionForm action={editAvailability} label="Save hours" compact>
            <input type="hidden" name="operation" value="save-hours" /><input type="hidden" name="weekday" value={index + 1} />
            <label className="field">Opens<input name="open" type="time" defaultValue={rule?.opens_at.slice(0, 5)} required /></label>
            <label className="field">Closes<input name="close" type="time" defaultValue={rule?.closes_at.slice(0, 5)} required /></label>
          </ActionForm>
          {rule && <ActionForm action={editAvailability} label="Close this weekday" secondary>
            <input type="hidden" name="operation" value="close-day" /><input type="hidden" name="weekday" value={index + 1} />
          </ActionForm>}
        </div>
      </details>;
    })}
    <h3>Appointment settings</h3>
    <ActionForm action={editAvailability} label="Save settings" compact>
      <input type="hidden" name="operation" value="save-settings" />
      <label className="field">Duration (minutes)<input name="slot_minutes" type="number" min="15" max="120" defaultValue={settings.slot_minutes} required /></label>
      <label className="field">Buffer (minutes)<input name="buffer_minutes" type="number" min="0" max="60" defaultValue={settings.buffer_minutes} required /></label>
      <label className="field">Booking window (days)<input name="window_days" type="number" min="1" max="60" defaultValue={settings.window_days} required /></label>
    </ActionForm>
    <h3>Blackout dates</h3>
    <ActionForm action={editAvailability} label="Block date" compact>
      <input type="hidden" name="operation" value="add-blackout" />
      <label className="field">Date<input name="date" type="date" min={istDay(new Date())} required /></label>
    </ActionForm>
    {blackouts.map(({ date }) => <ActionForm key={date} action={editAvailability} label={"Remove " + date} compact secondary>
      <input type="hidden" name="operation" value="remove-blackout" /><input type="hidden" name="date" value={date} />
    </ActionForm>)}
  </section>;
}

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  if (!authConfigured()) return <Shell title="Advocate dashboard" narrow>{authNote}</Shell>;
  const session = await adminSession();
  if (!session) return <Shell title="Advocate sign-in" narrow>
    <div className="panel"><ActionForm action={signIn} label="Sign in">
      <label className="field">Email address<input type="email" name="email" autoComplete="username" required /></label>
      <label className="field">Password<input type="password" name="password" autoComplete="current-password" required /></label>
    </ActionForm></div>
  </Shell>;
  const signOutButton = <form action={signOut}><button className="button alt">Sign out</button></form>;
  if (!session.verified) {
    const factors = await session.client.auth.mfa.listFactors();
    return <Shell title="Two-step verification" narrow>
      <div className="panel"><MfaSetup factor={factors.data?.totp[0]?.id} /></div>{signOutButton}
    </Shell>;
  }

  const rawPage = Number((await searchParams).page || 1);
  const page = Number.isSafeInteger(rawPage) && rawPage > 0 && rawPage < 5000 ? rawPage : 1;
  const count = 20;
  const db = database();
  const [appointments, rules, blackouts, settings] = await Promise.all([
    db.from("appointments").select("*, integration_jobs(id,kind,state,last_error,calendar_write_started_at)").order("created_at", { ascending: false }).range((page - 1) * count, page * count),
    db.from("availability_rules").select("*").order("weekday"),
    db.from("blackout_dates").select("date").gte("date", istDay(new Date())).order("date"),
    db.from("booking_settings").select("*").eq("id", 1).single(),
  ]);

  return <Shell title="Advocate dashboard" lead="Review requests, share appointment invitations and manage your calendar.">
    <div className="grid-two">
      <section className="panel stack">
        <h2>Appointment requests</h2>
        {appointments.error && <p className="notice error" role="alert">Appointment records are temporarily unavailable.</p>}
        {appointments.data && appointments.data.length === 0 && <p className="muted">No appointment requests on this page.</p>}
        {appointments.data?.slice(0, count).map(appt => <AppointmentEntry key={appt.id} appt={appt} />)}
        <div className="inline">
          {page > 1 && <Link className="button alt" href={"/admin?page=" + (page - 1)}>Previous page</Link>}
          {(appointments.data?.length ?? 0) > count && <Link className="button alt" href={"/admin?page=" + (page + 1)}>Next page</Link>}
        </div>
      </section>
      <div>
        <section className="panel">
          <h2>Client invitation</h2>
          <p className="muted">Share the generated link with the client. It works with their email address for seven days.</p>
          <ActionForm action={inviteClient} label="Create invitation"><label className="field">Client email<input name="email" type="email" required /></label></ActionForm>
        </section>
        {rules.data && blackouts.data && settings.data
          ? <Schedule rules={rules.data} blackouts={blackouts.data} settings={settings.data} />
          : <div className="panel"><p className="notice error">Office hours could not be loaded.</p></div>}
        {signOutButton}
      </div>
    </div>
  </Shell>;
}
