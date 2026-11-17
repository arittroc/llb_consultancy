import type { Metadata } from "next";
import "@fontsource-variable/cormorant-garamond";
import "@fontsource-variable/inter";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Trishik Seksaria | Advocate", template: "%s | Trishik Seksaria" },
  description: "Professional profile of Trishik Seksaria, Advocate, Calcutta High Court.",
  robots: { index: process.env.PROFILE_INDEXABLE === "true", follow: process.env.PROFILE_INDEXABLE === "true" },
};

export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en-IN"><body>{children}</body></html>;
}
