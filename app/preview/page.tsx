import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Shell } from "@/components/shell";
import { Demo } from "./demo";

export const metadata: Metadata = { title: "Appointment demo", robots: { index: false, follow: false } };

export default function Preview() {
  if (process.env.NODE_ENV !== "development" && process.env.ENABLE_DEMO !== "true") notFound();
  return <Shell title="Appointment demo" lead="Try the client and advocate views with fictional appointments." narrow><Demo /></Shell>;
}
