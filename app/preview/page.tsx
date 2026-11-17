import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Shell } from "@/components/shell";
import { Demo } from "./demo";
import "./demo.css";

export const metadata: Metadata = { title: "Appointment demo", robots: { index: false, follow: false } };

export default function Preview() {
  if (process.env.NODE_ENV !== "development" && process.env.ENABLE_DEMO !== "true") notFound();
  return <Shell title="Appointment demo" lead="Try requesting and managing an appointment with sample data." narrow><Demo /></Shell>;
}
