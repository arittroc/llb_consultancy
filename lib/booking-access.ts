import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "./supabase";

const inviteDuration = 7 * 24 * 60 * 60 * 1000;
const normalize = (email: string) => email.trim().toLowerCase();

export function bookingDigest(namespace: string, value: string, encoding: "hex" | "base64url" = "base64url") {
  return createHmac("sha256", env("BOOKING_SECRET")).update(namespace + ":" + value).digest(encoding);
}

export function equal(left: string, right: string) {
  const l = Buffer.from(left);
  const r = Buffer.from(right);
  return l.length === r.length && timingSafeEqual(l, r);
}

export function createInvite(email: string) {
  const expiry = String(Date.now() + inviteDuration);
  const nonce = randomBytes(18).toString("base64url");
  const target = bookingDigest("recipient", nonce + ":" + normalize(email));
  const payload = [expiry, nonce, target].join(".");
  const token = payload + "." + bookingDigest("invite", payload);
  return new URL("/appointment?invite=" + token, env("SITE_URL")).href;
}

export function canBook(token?: string | null, email?: string) {
  if (process.env.PUBLIC_BOOKING === "true") return true;
  if (!process.env.BOOKING_SECRET || !token || !/^\d{13}\.[\w-]{24}\.[\w-]{43}\.[\w-]{43}$/.test(token)) return false;
  const [expiry, nonce, target, signature] = token.split(".");
  if (Number(expiry) <= Date.now() || !equal(signature, bookingDigest("invite", [expiry, nonce, target].join(".")))) return false;
  return email === undefined || equal(target, bookingDigest("recipient", nonce + ":" + normalize(email)));
}
