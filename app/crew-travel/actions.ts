'use server';

import {revalidatePath} from 'next/cache';
import {redirect} from 'next/navigation';
import {requireWorkspace} from '../../lib/workspace';

const validIcao=/^[A-Z0-9]{4}$/;
const allowedModes=new Set(['shuttle','rail','airline']);

/** Persist only owner-defined fictional assumptions, never actual transport tickets. */
export async function addShadowCrewRoute(formData:FormData){
 const {supabase,organization,user}=await requireWorkspace();
 const from=String(formData.get('from_icao')??'').trim().toUpperCase();
 const to=String(formData.get('to_icao')??'').trim().toUpperCase();
 const mode=String(formData.get('mode')??'').trim();
 const mins=Number(String(formData.get('duration_minutes')??'').trim());
 const euros=Number(String(formData.get('estimated_cost_eur')??'').trim());
 const note=String(formData.get('scenario_note')??'').trim();
 if(!validIcao.test(from)||!validIcao.test(to)||from===to||
  !allowedModes.has(mode)||!Number.isSafeInteger(mins)||mins<5||mins>4320||
  !Number.isFinite(euros)||euros<0||euros>100000||
  note.length<3||note.length>400){
  redirect('/crew-travel?notice=invalid');
 }
 const {error}=await supabase.from('shadow_crew_travel_options').insert({
  organization_id:organization.id,from_icao:from,to_icao:to,mode,
  duration_minutes:mins,estimated_cost_eur:euros.toFixed(2),
  scenario_note:note,created_by_user_id:user.id,simulation_only:true
 });
 if(error){
  if(error.code==='23505')redirect('/crew-travel?notice=exists');
  redirect('/crew-travel?notice=failed');
 }
 revalidatePath('/crew-travel');
 redirect('/crew-travel?notice=added');
}
