import { canBook } from "@/lib/booking-access";
import { slots } from "@/lib/appointments";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  if (!canBook(request.headers.get("x-booking-invite"))) {
    return Response.json({ error: "A valid appointment invitation is required." }, { status: 403, headers });
  }
  try {
    return Response.json(await slots(), { headers });
  } catch {
    return Response.json({ error: "Availability is temporarily unavailable. Please try again later." }, { status: 503, headers });
  }
}
