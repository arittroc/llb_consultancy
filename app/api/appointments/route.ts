import { bookingError, bookingSchema, slots } from "@/lib/appointments";
import { bookingDigest, canBook, equal } from "@/lib/booking-access";
import { database } from "@/lib/supabase";

const headers = { "Cache-Control": "private, no-store" };
const fail = (error: string, status: number) => Response.json({ error }, { status, headers });

export async function POST(request: Request) {
  const configuredOrigin = process.env.SITE_URL && new URL(process.env.SITE_URL).origin;
  if (request.headers.get("origin") !== configuredOrigin) return fail("Invalid request origin.", 403);
  if (!request.headers.get("content-type")?.startsWith("application/json")) return fail("Invalid request format.", 415);
  const reader = request.body?.getReader();
  if (!reader) return fail("A request body is required.", 400);
  const decoder = new TextDecoder();
  let size = 0;
  let body = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 4096) {
      await reader.cancel();
      return fail("This request is too large.", 413);
    }
    body += decoder.decode(value, { stream: true });
  }
  body += decoder.decode();
  let parsed: unknown;
  try { parsed = JSON.parse(body); } catch { return fail("Invalid request format.", 400); }
  const valid = bookingSchema.safeParse(parsed);
  if (!valid.success) return fail("Check your name, email and appointment time.", 400);
  const { key, name, email, start, invite } = valid.data;
  if (!canBook(invite, email)) return fail("Use the email address associated with your invitation.", 403);
  try {
    const db = database();
    const prior = await db.from("appointments").select("name,email,requested_at_slot").eq("id", key).maybeSingle();
    if (prior.error) throw prior.error;
    if (prior.data) {
      const match = equal(prior.data.email, email) && equal(prior.data.name, name) && Date.parse(prior.data.requested_at_slot) === Date.parse(start);
      return match
        ? Response.json({ status: "pending" }, { headers })
        : fail("This request key was already used.", 409);
    }
    const availability = await slots();
    if (!availability.starts.includes(start)) return fail("That slot is no longer available. Choose another time.", 409);
    const source = request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() || (process.env.VERCEL ? "unknown" : "local");
    const result = await db.rpc("submit_appointment", { p_key: key, p_name: name, p_email: email, p_start: start, p_rate_key: bookingDigest("rate", source, "hex") });
    if (result.error) return fail(bookingError(result.error.code), result.error.code === "53300" ? 429 : ["23P01", "P0001"].includes(result.error.code) ? 409 : 503);
    return Response.json({ status: "pending" }, { status: 201, headers });
  } catch {
    return fail("Appointment requests are temporarily unavailable. Please try again later.", 503);
  }
}
