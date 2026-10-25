import {redirect} from 'next/navigation';
import {createClient} from './supabase/server';
import {isSupabaseConfigured} from './supabase/config';
export async function requireWorkspace(){
 if(!isSupabaseConfigured())redirect('/login?error=setup');
 const supabase=await createClient();
 const {data:auth,error:authError}=await supabase.auth.getUser();
 if(authError||!auth.user)redirect('/login');
 const {data:organization,error}=await supabase.from('organizations')
  .select('id,name,currency').eq('owner_user_id',auth.user.id).maybeSingle();
 if(error||!organization)redirect('/?access=missing');
 return {supabase,organization,user:auth.user};
}
