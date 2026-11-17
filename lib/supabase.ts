import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

export function database() {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_SECRET_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, options) => fetch(input, { ...options, cache: "no-store" }) },
  });
}

export function env(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error("Missing configuration: " + name);
  return value;
}

export function authConfigured() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_PUBLISHABLE_KEY && process.env.ADMIN_USER_ID);
}

export async function authClient() {
  const jar = await cookies();
  return createServerClient(env("SUPABASE_URL"), env("SUPABASE_PUBLISHABLE_KEY"), {
    cookieOptions: { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" },
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (values) => {
        try {
          for (const { name, value, options } of values) jar.set(name, value, options);
        } catch {
          // The proxy writes refreshed cookies before Server Components render.
        }
      },
    },
  });
}

export async function adminSession() {
  if (!authConfigured()) return null;
  const client = await authClient();
  const { data } = await client.auth.getClaims();
  if (!data?.claims || data.claims.sub !== process.env.ADMIN_USER_ID) return null;
  return { client, verified: data.claims.aal === "aal2" };
}
