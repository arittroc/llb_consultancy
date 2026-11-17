import type { Metadata } from "next";
import { Shell } from "@/components/shell";
import { canBook } from "@/lib/booking-access";
import { BookingForm } from "./booking-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Appointments", robots: { index: false, follow: false } };

export default async function AppointmentPage({ searchParams }: { searchParams: Promise<{ invite?: string | string[] }> }) {
  const params = await searchParams;
  const invite = typeof params.invite === "string" ? params.invite : undefined;
  const authorized = canBook(invite);
  return <Shell title="Appointments" lead={authorized ? "Choose a time to request an appointment. All times are shown in India Standard Time (IST)." : undefined} narrow>
    {authorized ? <BookingForm invite={invite} /> : <div className="panel"><h2>Invitation required</h2><p className="muted">Open a current appointment link shared with you by the practice.</p></div>}
  </Shell>;
}
