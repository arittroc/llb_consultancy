"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { adminSession, authClient, authConfigured, database } from "@/lib/supabase";
import { bookingError, emailSchema } from "@/lib/appointments";
import { createInvite } from "@/lib/booking-access";
import { calendarEventState } from "@/lib/providers";
import { istDay } from "@/lib/time";

export type FormState = { error?: string; success?: string; link?: string; qr?: string; secret?: string; factor?: string };
const denied = { error: "Sign in and verify your authentication code first." };

export async function signIn(_: FormState, form: FormData): Promise<FormState> {
  const email = emailSchema.safeParse(form.get("email"));
  const pwd = z.string().min(1).max(256).safeParse(form.get("password"));
  if (!authConfigured() || !email.success || !pwd.success) return { error: "Sign-in is unavailable or the credentials are invalid." };
  const auth = await authClient();
  const result = await auth.auth.signInWithPassword({ email: email.data, password: pwd.data });
  if (result.error || result.data.user.id !== process.env.ADMIN_USER_ID) {
    if (!result.error) await auth.auth.signOut({ scope: "local" });
    return { error: "Sign-in failed. Check your credentials and try again." };
  }
  redirect("/admin");
}

export async function signOut() {
  if (authConfigured()) await (await authClient()).auth.signOut({ scope: "local" });
  redirect("/admin");
}

export async function enrollMfa(_: FormState): Promise<FormState> {
  const session = await adminSession();
  if (!session || session.verified) return denied;
  const client = session.client;
  const factors = await client.auth.mfa.listFactors();
  if (factors.error || factors.data.totp.length) return { error: "Use the code from your existing authenticator." };
  for (const factor of factors.data.all.filter(factor => factor.factor_type === "totp" && factor.status === "unverified")) {
    const removal = await client.auth.mfa.unenroll({ factorId: factor.id });
    if (removal.error) return { error: "The incomplete authenticator setup could not be reset." };
  }
  const setup = await client.auth.mfa.enroll({ factorType: "totp", issuer: "Trishik Seksaria", friendlyName: "Advocate dashboard" });
  if (setup.error) return { error: "Authenticator setup is temporarily unavailable." };
  return { factor: setup.data.id, qr: setup.data.totp.qr_code, secret: setup.data.totp.secret };
}

export async function verifyMfa(_: FormState, form: FormData): Promise<FormState> {
  const session = await adminSession();
  if (!session) return denied;
  const factor = z.uuid().safeParse(form.get("factor"));
  const code = z.string().regex(/^\d{6}$/).safeParse(form.get("code"));
  if (!factor.success || !code.success) return { error: "Enter the 6-digit code from your authenticator." };
  const result = await session.client.auth.mfa.challengeAndVerify({ factorId: factor.data, code: code.data });
  if (result.error) return { error: "That code could not be verified. Try the next code." };
  redirect("/admin");
}

export async function inviteClient(_: FormState, form: FormData): Promise<FormState> {
  if (!(await adminSession())?.verified) return denied;
  const email = emailSchema.safeParse(form.get("email"));
  if (!email.success) return { error: "Enter a valid email address." };
  try { return { link: createInvite(email.data) }; } catch { return { error: "Appointment links need to be configured." }; }
}

export async function changeAppointment(_: FormState, form: FormData): Promise<FormState> {
  if (!(await adminSession())?.verified) return denied;
  const id = z.uuid().safeParse(form.get("id"));
  const operation = z.enum(["approve", "decline", "cancel", "reschedule", "retry", "abort"]).safeParse(form.get("operation"));
  if (!id.success || !operation.success) return { error: "Choose a valid action." };
  const raw = form.get("newStart");
  let start: string | null = null;
  if (operation.data === "reschedule") {
    const input = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/).safeParse(raw);
    const time = input.success ? Date.parse(input.data + ":00+05:30") : NaN;
    if (!Number.isFinite(time)) return { error: "Choose a new time in IST." };
    start = new Date(time).toISOString();
  }
  const response = await database().rpc("transition_appointment", { p_id: id.data, p_action: operation.data, p_start: start });
  if (response.error) return { error: bookingError(response.error.code) };
  revalidatePath("/admin");
  return { success: "Appointment updated." };
}

export async function editAvailability(_: FormState, form: FormData): Promise<FormState> {
  if (!(await adminSession())?.verified) return denied;
  const operation = form.get("operation");
  let result;
  const db = database();
  if (operation === "save-hours" || operation === "close-day") {
    const weekday = z.coerce.number().int().min(1).max(7).safeParse(form.get("weekday"));
    if (!weekday.success) return { error: "Choose a day of the week." };
    if (operation === "close-day") {
      result = await db.from("availability_rules").delete().eq("weekday", weekday.data);
    } else {
      const schema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
      const open = schema.safeParse(form.get("open"));
      const close = schema.safeParse(form.get("close"));
      if (!open.success || !close.success || open.data >= close.data) return { error: "Enter opening and closing times in order." };
      result = await db.from("availability_rules").upsert({ weekday: weekday.data, opens_at: open.data, closes_at: close.data });
    }
  } else if (operation === "add-blackout" || operation === "remove-blackout") {
    const date = z.iso.date().safeParse(form.get("date"));
    if (!date.success) return { error: "Choose a valid date." };
    result = operation === "add-blackout"
      ? await db.from("blackout_dates").upsert({ date: date.data })
      : await db.from("blackout_dates").delete().eq("date", date.data);
  } else if (operation === "save-settings") {
    const schema = z.object({
      slot_minutes: z.coerce.number().int().min(15).max(120),
      buffer_minutes: z.coerce.number().int().min(0).max(60),
      window_days: z.coerce.number().int().min(1).max(60),
    });
    const settings = schema.safeParse(Object.fromEntries(form));
    if (!settings.success) return { error: "Check appointment duration, buffer and booking window." };
    result = await db.from("booking_settings").update(settings.data).eq("id", 1);
  } else {
    return { error: "Choose a valid schedule action." };
  }
  if (result.error) return { error: "The schedule could not be changed." };
  revalidatePath("/admin");
  return { success: "Schedule updated." };
}

export async function compareCalendar(_: FormState, form: FormData): Promise<FormState> {
  if (!(await adminSession())?.verified) return denied;
  const id = z.uuid().safeParse(form.get("id"));
  if (!id.success) return { error: "Select an appointment." };
  const response = await database().from("appointments").select("starts_at,ends_at,google_event_id,meet_url,status").eq("id", id.data).single();
  if (response.error || response.data.status !== "confirmed" || !response.data.google_event_id) return { error: "No confirmed event could be checked." };
  try {
    const row = response.data;
    const event = await calendarEventState(row.google_event_id);
    if (!event) return { error: "The confirmed event is missing from Google Calendar." };
    if (Date.parse(event.startsAt) !== Date.parse(row.starts_at) || Date.parse(event.endsAt) !== Date.parse(row.ends_at) || event.meetUrl !== row.meet_url) {
      return { error: "The time or Meet link in Google Calendar differs from this appointment. Review both records before making changes." };
    }
    return { success: "Google Calendar and the appointment match for " + istDay(row.starts_at) + "." };
  } catch {
    return { error: "Google Calendar could not be checked." };
  }
}
