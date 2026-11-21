import { createBrowserClient } from "@supabase/ssr";
import { requireEnv } from "@/lib/config/env";

/**
 * Supabase client for browser code. Uses only the public anon key; row-level security is what protects data.
 * NEXT_PUBLIC_* values are passed in literally so Next.js can inline them into the browser bundle.
 */
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  );
}
