import type { Metadata } from "next";
import { Shell } from "@/components/shell";

export const metadata: Metadata = { title: "Privacy notice" };

export default function Privacy() {
  return <Shell title="Privacy notice" narrow>
    <article className="panel privacy-copy">
      <h2>Appointment information</h2>
      <p>The appointment form collects your name, email address and requested time so the practice can review your request and send scheduling updates. The service uses a short-lived pseudonymous request counter to limit repeated submissions.</p>
      <p>Supabase stores booking records. Google Calendar and Google Meet provide availability and meeting details. Resend delivers appointment email. The application runs on Vercel.</p>
      <p>Please keep case information, documents and other private materials out of the appointment form.</p>
      <p>For questions about your appointment information, contact the practice through the person who sent your invitation.</p>
    </article>
  </Shell>;
}
