import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { isSupabaseConfigured } from './config';

export async function updateSession(request: NextRequest) {
  // A missing env key is a setup state, not an excuse to expose protected data.
  if (!isSupabaseConfigured()) return NextResponse.next({ request });

  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
          Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
        },
      },
    }
  );

  // getClaims validates tokens; getSession alone must not authorize access.
  const { data, error } = await supabase.auth.getClaims();
  const path = request.nextUrl.pathname;
  const protectedPath = path === '/' || path.startsWith('/dashboard');
  if (protectedPath && (error || !data?.claims)) {
    const destination = request.nextUrl.clone();
    destination.pathname = '/login';
    destination.search = '';
    return NextResponse.redirect(destination);
  }
  return response;
}
