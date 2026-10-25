'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { isSupabaseConfigured } from '../../lib/supabase/config';
import { createClient } from '../../lib/supabase/server';

export async function login(formData: FormData) {
  if (!isSupabaseConfigured()) redirect('/login?error=setup');
  const email = String(formData.get('email') || '').trim();
  const password = String(formData.get('password') || '');
  if (!email || !password || email.length > 254) redirect('/login?error=invalid');

  // Sign-in only. No open registration, no anonymous CEO bootstrap.
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) redirect('/login?error=invalid');
  revalidatePath('/', 'layout');
  redirect('/');
}

export async function logout() {
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  revalidatePath('/', 'layout');
  redirect('/login');
}
