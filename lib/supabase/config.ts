/** The browser must never receive a service-role/secret API key. */
export function isSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  return Boolean(url && url.startsWith('https://') && key && key.startsWith('sb_publishable_'));
}
