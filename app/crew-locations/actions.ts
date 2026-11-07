'use server';

import {revalidatePath} from 'next/cache';
import {redirect} from 'next/navigation';
import {requireWorkspace} from '../../lib/workspace';

const pilotId=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const icao=/^[A-Z0-9]{4}$/;

/**
 * Owner-attested INITIAL crew location in the virtual airline only.
 * Can never overwrite a position, verify a flight, or release a crew member.
 * Enforcement is duplicated in database RLS and a one-check-in unique index.
 */
export async function recordInitialCrewLocation(formData:FormData){
 const {supabase,organization,user}=await requireWorkspace();
 const employeeId=String(formData.get('employee_id')??'').trim();
 const place=String(formData.get('location_icao')??'').trim().toUpperCase();
 if(!pilotId.test(employeeId)||!icao.test(place)){
  redirect('/crew-locations?notice=invalid');
 }
 const {data:person,error:personError}=await supabase.from('employees')
  .select('id,crew_role')
  .eq('organization_id',organization.id)
  .eq('id',employeeId).maybeSingle();
 if(personError||!person||!['PIC','SIC'].includes(person.crew_role)){
  redirect('/crew-locations?notice=invalid');
 }
 const {count,error:historyError}=await supabase.from('crew_location_events')
  .select('id',{count:'exact',head:true})
  .eq('organization_id',organization.id).eq('employee_id',employeeId)
  .eq('event_type','check_in').eq('verification_state','verified');
 if(historyError)redirect('/crew-locations?notice=unavailable');
 if((count??0)>0)redirect('/crew-locations?notice=already');
 const now=new Date().toISOString();
 const {error}=await supabase.from('crew_location_events').insert({
  organization_id:organization.id,employee_id:employeeId,
  event_type:'check_in',location_icao:place,origin_icao:null,
  departed_at:null,occurred_at:now,verified_at:now,
  verification_state:'verified',recorded_by_user_id:user.id,
  source_reference:'owner_manual_initial_checkin',
  notes:'Virtueller Anfangsstandort durch den Unternehmensinhaber bestätigt – keine reale Positionsmessung.'
 });
 if(error){
  if(error.code==='23505')redirect('/crew-locations?notice=already');
  redirect('/crew-locations?notice=unavailable');
 }
 revalidatePath('/crew-locations');
 redirect('/crew-locations?notice=created');
}
