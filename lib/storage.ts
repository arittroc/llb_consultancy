import "server-only";

export function publicAssetUrl(key?: string) {
  const base = process.env.SUPABASE_URL;
  if (!key || !base) return null;
  return new URL("/storage/v1/object/public/profile-assets/" + key.split("/").map(encodeURIComponent).join("/"), base).href;
}
