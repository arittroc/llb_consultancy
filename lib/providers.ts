import "server-only";
import { createElement } from "react";
import { render } from "@react-email/render";
import { AppointmentEmail, appointmentEmailSubject, type AppointmentEmailKind, type EmailAppointment } from "./appointment-email";
import { env } from "./supabase";

export class GoogleProviderError extends Error {
  constructor(public code: string, public retryable: boolean) { super(code); }
}

export class ResendProviderError extends Error {
  constructor(public code: string, public retryable: boolean) { super(code); }
}

type Interval = { start: string; end: string };
type GoogleEvent = {
  id: string;
  status?: string;
  transparency?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  conferenceData?: {
    createRequest?: { status?: { statusCode?: string } };
    entryPoints?: { entryPointType: string; uri: string }[];
  };
};
type EventTimes = { id: string; starts_at: string; ends_at: string };

const googleCalendar = "https://www.googleapis.com/calendar/v3";
const timeout = 9000;
let access: { token: string; expiry: number; key: string } | undefined;

async function googleToken() {
  let clientId: string;
  let clientSecret: string;
  let refresh: string;
  try {
    clientId = env("GOOGLE_CLIENT_ID");
    clientSecret = env("GOOGLE_CLIENT_SECRET");
    refresh = env("GOOGLE_REFRESH_TOKEN");
  } catch {
    throw new GoogleProviderError("google_configuration", false);
  }
  if (access?.key === refresh && access.expiry > Date.now() + 30_000) return access.token;
  const body = new URLSearchParams({ grant_type: "refresh_token", client_id: clientId, client_secret: clientSecret, refresh_token: refresh });
  let response: Response;
  try {
    response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", body, cache: "no-store", signal: AbortSignal.timeout(timeout) });
  } catch {
    throw new GoogleProviderError("google_token_network", true);
  }
  if (!response.ok) throw new GoogleProviderError("google_token", response.status === 429 || response.status >= 500);
  const data: { access_token?: string; expires_in?: number } = await response.json();
  if (!data.access_token) throw new GoogleProviderError("google_token", true);
  access = { token: data.access_token, expiry: Date.now() + (data.expires_in || 1800) * 1000, key: refresh };
  return access.token;
}

async function google<T>(path: string, method = "GET", body?: object, allow: number[] = []): Promise<T | null> {
  const token = await googleToken();
  let response: Response;
  try {
    response = await fetch(googleCalendar + path, {
      method,
      headers: { Authorization: "Bearer " + token, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(timeout),
    });
  } catch {
    throw new GoogleProviderError("google_network", true);
  }
  if (allow.includes(response.status) || response.status === 204) return null;
  if (response.status === 401) access = undefined;
  if (!response.ok) {
    const reason = await response.json().catch(() => null);
    const quota = reason?.error?.errors?.some((error: { reason: string }) => ["rateLimitExceeded", "userRateLimitExceeded", "quotaExceeded"].includes(error.reason));
    throw new GoogleProviderError("google_http_" + response.status, quota || [401, 408, 429].includes(response.status) || response.status >= 500);
  }
  return await response.json() as T;
}

function writeCalendar() {
  try { return env("GOOGLE_CALENDAR_ID"); }
  catch { throw new GoogleProviderError("google_configuration", false); }
}

function eventPath(id?: string) {
  const base = "/calendars/" + encodeURIComponent(writeCalendar()) + "/events";
  return id ? base + "/" + encodeURIComponent(id) : base;
}

export function calendarEventId(id: string) {
  return "appt" + id.replace(/-/g, "").toLowerCase();
}

export async function calendarBusy(min: string, max: string, excludeEventId?: string): Promise<Interval[]> {
  const write = writeCalendar();
  const ids = [...new Set([write, ...(process.env.GOOGLE_BUSY_CALENDAR_IDS || "").split(",").map(value => value.trim()).filter(Boolean)])];
  const checkIds = excludeEventId ? ids.filter(id => id !== write) : ids;
  const intervals: Interval[] = [];
  if (checkIds.length) {
    const data = await google<{ calendars?: Record<string, { busy?: Interval[]; errors?: { reason: string }[] }> }>("/freeBusy", "POST", {
      timeMin: min, timeMax: max, items: checkIds.map(id => ({ id })),
    });
    for (const id of checkIds) {
      const calendar = data?.calendars?.[id];
      if (!calendar?.busy || calendar.errors?.length) throw new GoogleProviderError("google_busy_calendar", false);
      intervals.push(...calendar.busy);
    }
  }
  if (excludeEventId) {
    const params = new URLSearchParams({ timeMin: min, timeMax: max, singleEvents: "true", showDeleted: "false", maxResults: "2500" });
    for (let page = 0; page < 5; page++) {
      const data = await google<{ items?: GoogleEvent[]; nextPageToken?: string }>(eventPath() + "?" + params);
      if (!data) throw new GoogleProviderError("google_event_list", true);
      for (const event of data.items || []) {
        if (event.id === excludeEventId || event.status === "cancelled" || event.transparency === "transparent") continue;
        intervals.push({ start: event.start?.dateTime || min, end: event.end?.dateTime || max });
      }
      if (!data.nextPageToken) return intervals;
      params.set("pageToken", data.nextPageToken);
    }
    throw new GoogleProviderError("google_event_list_limit", false);
  }
  return intervals;
}

function meetLink(event: GoogleEvent) {
  const status = event.conferenceData?.createRequest?.status?.statusCode;
  if (status === "failure") throw new GoogleProviderError("google_meet_creation", false);
  const match = event.conferenceData?.entryPoints?.find(entry => entry.entryPointType === "video" && /^https:\/\/meet\.google\.com\/[a-z0-9-]+$/i.test(entry.uri));
  return match?.uri ?? null;
}

async function getEvent(id: string) {
  const event = await google<GoogleEvent>(eventPath(id), "GET", undefined, [404, 410]);
  return event?.status === "cancelled" ? null : event;
}

export async function calendarEventState(id: string) {
  const event = await getEvent(id);
  if (!event) return null;
  return { eventId: event.id, startsAt: event.start?.dateTime ?? "", endsAt: event.end?.dateTime ?? "", meetUrl: meetLink(event) };
}

export async function upsertCalendarEvent(appointment: EventTimes) {
  const id = calendarEventId(appointment.id);
  const prior = await getEvent(id);
  const same = prior && Date.parse(prior.start?.dateTime ?? "") === Date.parse(appointment.starts_at)
    && Date.parse(prior.end?.dateTime ?? "") === Date.parse(appointment.ends_at);
  const priorLink = prior ? meetLink(prior) : null;
  if (same && priorLink) return { eventId: id, meetUrl: priorLink };
  if (same && prior.conferenceData?.createRequest?.status?.statusCode === "pending") return null;

  const time = {
    start: { dateTime: appointment.starts_at, timeZone: "Asia/Kolkata" },
    end: { dateTime: appointment.ends_at, timeZone: "Asia/Kolkata" },
  };
  const pending = prior?.conferenceData?.createRequest?.status?.statusCode === "pending";
  const conferenceData = priorLink || pending ? undefined : {
    createRequest: { requestId: id + "meet", conferenceSolutionKey: { type: "hangoutsMeet" } },
  };
  const endpoint = "?conferenceDataVersion=1&sendUpdates=none";
  let event = prior
    ? await google<GoogleEvent>(eventPath(id) + endpoint, "PATCH", { ...time, conferenceData })
    : await google<GoogleEvent>(eventPath() + endpoint, "POST", { id, summary: "Consultation appointment", visibility: "private", ...time, conferenceData }, [409]);
  if (!event) event = await getEvent(id);
  if (!event) throw new GoogleProviderError("google_event_missing", false);
  if (Date.parse(event.start?.dateTime ?? "") !== Date.parse(appointment.starts_at)
      || Date.parse(event.end?.dateTime ?? "") !== Date.parse(appointment.ends_at)) {
    throw new GoogleProviderError("google_event_changed", true);
  }
  const meetUrl = meetLink(event);
  if (!meetUrl) {
    if (event.conferenceData?.createRequest?.status?.statusCode === "pending") return null;
    throw new GoogleProviderError("google_meet_unavailable", true);
  }
  return { eventId: event.id, meetUrl };
}

export async function deleteCalendarEvent(id: string) {
  await google(eventPath(id) + "?sendUpdates=none", "DELETE", undefined, [404, 410]);
}

export async function sendAppointmentEmail(kind: AppointmentEmailKind, appointment: EmailAppointment, key: string) {
  let mailFrom: string;
  let apiKey: string;
  try { mailFrom = env("MAIL_FROM"); apiKey = env("RESEND_API_KEY"); }
  catch { throw new ResendProviderError("resend_configuration", false); }
  const template = createElement(AppointmentEmail, { kind, appointment });
  const [html, plain] = await Promise.all([render(template), render(template, { plainText: true })]);
  let response: Response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json", "Idempotency-Key": key },
      body: JSON.stringify({ from: mailFrom, to: [appointment.email], subject: appointmentEmailSubject(kind), html, text: plain }),
      cache: "no-store",
      signal: AbortSignal.timeout(timeout),
    });
  } catch {
    throw new ResendProviderError("resend_network", true);
  }
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    const retryable = [408, 429].includes(response.status) || response.status >= 500
      || (response.status === 409 && error?.name === "concurrent_idempotent_requests");
    throw new ResendProviderError("resend_http_" + response.status, retryable);
  }
  const data: { id?: string } = await response.json();
  if (!data.id) throw new ResendProviderError("resend_missing_id", true);
  return data.id;
}
