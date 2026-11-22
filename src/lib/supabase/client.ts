import { createBrowserClient } from "@supabase/ssr";
import { getPublicEnv } from "@/lib/env";

export function createClient() {
  const env = getPublicEnv();
  if (!env.url || !env.key) throw new Error("Supabase is not configured. Add the project URL and publishable key to .env.local.");
  return createBrowserClient(env.url, env.key);
}
