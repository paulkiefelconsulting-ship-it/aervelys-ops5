'use server';

import {redirect} from 'next/navigation';
import {revalidatePath} from 'next/cache';
import {requireWorkspace} from '../../lib/workspace';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const icao=/^[A-Z0-9]{4}$/;
const iso=(s:string):number=>Number.isFinite(Date.parse(s))?Date.parse(s):NaN;

/** Explicit owner-approved *fictional* travel order.
 * SQL row trigger checks owner, assignment, direction, option pricing,
 * transfer minutes, connection buffer, reporting time and collisions.
 * Never handles real bookings or operational crew positions.
 */
export async function scheduleShadowCrewTransfer(formData:FormData){
 const {supabase,organization,user}=await requireWorkspace();
 const flightId=String(formData.get('flight_id')??'');
 const employeeId=String(formData.get('employee_id')??'');
 const from=String(formData.get('from_icao')??'').trim().toUpperCase();
 const to=String(formData.get('to_icao')??'').trim().toUpperCase();
 const startsAt=String(formData.get('starts_at')??'');
 const endsAt=String(formData.get('ends_at')??'');
 const reportAt=String(formData.get('report_at')??'');
 const itineraryRaw=String(formData.get('itinerary')??'');
 const amount=Number(String(formData.get('cost_eur')??''));
 if(!uuid.test(flightId)||!uuid.test(employeeId)||
  !icao.test(from)||!icao.test(to)||from===to||
  !Number.isFinite(iso(startsAt))||!Number.isFinite(iso(endsAt))||
  !Number.isFinite(iso(reportAt))||iso(startsAt)>=iso(endsAt)||
  iso(endsAt)>iso(reportAt)||iso(startsAt)<=Date.now()||
  !Number.isFinite(amount)||amount<0||amount>200000||
  itineraryRaw.length>10000||itineraryRaw.length<10){
  redirect('/crew-travel?notice=invalid_transfer');
 }
 let steps:unknown;
 try{steps=JSON.parse(itineraryRaw);}catch{redirect('/crew-travel?notice=invalid_transfer');}
 if(!Array.isArray(steps)||steps.length<1||steps.length>2||
    steps.some(x=>typeof x!=='object'||x===null||!uuid.test(String(x.routeId??''))||
      !Number.isFinite(iso(String(x.startsAt??'')))||
      !Number.isFinite(iso(String(x.endsAt??''))))){
  redirect('/crew-travel?notice=invalid_transfer');
 }
 const {data:assigned,error:assignmentError}=await supabase
  .from('shadow_crew_assignments').select('id,shadow_flight_id,employee_id')
  .eq('organization_id',organization.id).eq('shadow_flight_id',flightId)
  .eq('employee_id',employeeId).maybeSingle();
 if(assignmentError||!assigned)redirect('/crew-travel?notice=assign_first');
 const {error}=await supabase.from('shadow_crew_transfer_orders').insert({
  organization_id:organization.id,shadow_flight_id:flightId,
  employee_id:employeeId,assignment_id:assigned.id,
  created_by_user_id:user.id,from_icao:from,to_icao:to,
  starts_at:new Date(startsAt).toISOString(),
  ends_at:new Date(endsAt).toISOString(),
  report_at:new Date(reportAt).toISOString(),
  itinerary:steps,estimated_cost_eur:amount.toFixed(2),
  simulation_only:true
 });
 if(error){
  if(error.code==='23505')redirect('/crew-travel?notice=transfer_exists');
  redirect('/crew-travel?notice=transfer_blocked');
 }
 revalidatePath('/crew-travel');
 revalidatePath('/shadow-crew');
 redirect('/crew-travel?notice=transfer_scheduled');
}
