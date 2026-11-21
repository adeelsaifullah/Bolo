import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { requireEnv } from "@/lib/config/env";

/**
 * Supabase client for Server Components, Route Handlers and Server Actions. Acts as the signed-in user
 * (via cookies), so row-level security applies. Server only: never import this from a client component.
 *
 * Not here on purpose: a service-role (admin) client. It arrives with the first table, in its own
 * server-only module, and its key is never given a NEXT_PUBLIC_ name.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  return createServerClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
          } catch {
            // Called from a Server Component, where cookies are read-only. Session refresh will be
            // handled in the proxy when sign-in is built.
          }
        },
      },
    },
  );
}
