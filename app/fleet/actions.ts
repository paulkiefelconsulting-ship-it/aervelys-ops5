'use server';
import {redirect} from 'next/navigation';
import {revalidatePath} from 'next/cache';
import {requireWorkspace} from '../../lib/workspace';
import {fleetSeed,nextFleetRegistration,suggestedPrefix} from '../../lib/fleet-registry';
const dest=(result:string):never=>redirect('/fleet?result='+result);
export async function importFleetManifest(){
 const {supabase,organization}=await requireWorkspace();
 const {data:existing,error:readError}=await supabase.from('aircraft').select('registration')
   .eq('organization_id',organization.id);
 if(readError)dest('failed');
 const used=new Set((existing??[]).map(x=>String(x.registration).toUpperCase()));
 const missing=fleetSeed.filter(a=>!used.has(a.registration));
 if(!missing.length)dest('already');
 const {error}=await supabase.from('aircraft').insert(missing.map(a=>({
  organization_id:organization.id,...a,operational_status:'inactive'
 })));
 if(error)dest('failed');
 revalidatePath('/fleet');revalidatePath('/');dest('imported');
}
export async function addFleetAircraft(form:FormData){
 const {supabase,organization}=await requireWorkspace();
 const type=String(form.get('aircraft_type')??'').trim();
 const home=String(form.get('home_base_icao')??'EDAZ').trim().toUpperCase();
 const prefix=String(form.get('prefix')??'').trim().toUpperCase();
 if(type.length<3||type.length>100||! /^[A-Z0-9]{4}$/.test(home))dest('invalid');
 const suggested=suggestedPrefix(type);
 if(!/^D-[A-Z]$/.test(prefix))dest('invalid');
 // If the aircraft type is known, do not allow silently choosing an unrelated class.
 if(suggested&&suggested!==prefix)dest('class');
 const {data,error:readError}=await supabase.from('aircraft').select('registration')
   .eq('organization_id',organization.id);
 if(readError)dest('failed');
 const used=(data??[]).map(r=>String(r.registration));
 const registration=nextFleetRegistration(prefix,used);
 const {error}=await supabase.from('aircraft').insert({
  organization_id:organization.id,registration,aircraft_type:type,
  home_base_icao:home,current_icao:null,operational_status:'inactive'
 });
 if(error)dest(error.code==='23505'?'duplicate':'failed');
 revalidatePath('/fleet');revalidatePath('/');dest('created');
}
