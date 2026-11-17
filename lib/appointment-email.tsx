import "server-only";
import { Body, Button, Container, Head, Heading, Html, Preview, Text } from "@react-email/components";

export type AppointmentEmailKind = "receipt" | "confirm" | "reschedule" | "cancel";

export type EmailAppointment = {
  id: string;
  name: string;
  email: string;
  starts_at: string;
  meet_url?: string | null;
};

const copy = {
  receipt: {
    subject: "Appointment request received",
    message: "Your request has been received and is pending review. You’ll receive a separate email if the appointment is confirmed.",
    timeLabel: "Requested time",
  },
  confirm: {
    subject: "Appointment confirmed",
    message: "Your appointment with Trishik Seksaria is confirmed. Use the Google Meet link below at the scheduled time.",
    timeLabel: "Appointment time",
  },
  reschedule: {
    subject: "Appointment rescheduled",
    message: "Your appointment with Trishik Seksaria has been moved. Use the Google Meet link below at the new time.",
    timeLabel: "New appointment time",
  },
  cancel: {
    subject: "Appointment cancelled",
    message: "Your appointment with Trishik Seksaria has been cancelled.",
    timeLabel: "Original appointment time",
  },
} satisfies Record<AppointmentEmailKind, { subject: string; message: string; timeLabel: string }>;

export function appointmentEmailSubject(kind: AppointmentEmailKind) {
  return copy[kind].subject;
}

const appointmentDate = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "full",
  timeStyle: "short",
  timeZone: "Asia/Kolkata",
});

export function AppointmentEmail({ kind, appointment }: { kind: AppointmentEmailKind; appointment: EmailAppointment }) {
  const { subject, message, timeLabel } = copy[kind];
  const showMeet = kind === "confirm" || kind === "reschedule";

  return (
    <Html lang="en">
      <Head />
      <Preview>{subject}</Preview>
      <Body style={{ margin: 0, padding: "28px 12px", backgroundColor: "#f5f0e9", color: "#261e1b", fontFamily: "Arial, sans-serif" }}>
        <Container style={{ maxWidth: 540, padding: "28px 24px", backgroundColor: "#fffdf9" }}>
          <Text style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Trishik Seksaria</Text>
          <Heading as="h1" style={{ fontFamily: "Georgia, serif", fontSize: 30, fontWeight: 400 }}>{subject}</Heading>
          <Text>Hello {appointment.name},</Text>
          <Text>{message}</Text>
          <Text><strong>{timeLabel}</strong><br />{appointmentDate.format(new Date(appointment.starts_at))} (IST)</Text>
          {showMeet && appointment.meet_url && (
            <Button href={appointment.meet_url} style={{ backgroundColor: "#322428", color: "#fffaf2", padding: "12px 18px", borderRadius: 4 }}>
              Join on Google Meet
            </Button>
          )}
        </Container>
      </Body>
    </Html>
  );
}
