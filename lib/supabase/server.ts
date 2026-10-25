import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { isSupabaseConfigured } from './config';

export async function createClient() {
  if (!isSupabaseConfigured()) throw new Error('OPS5_SUPABASE_NOT_CONFIGURED');
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet, _headers) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // A Server Component cannot modify cookies; Next.js Proxy refreshes sessions.
          }
        },
      },
    }
  );
}
