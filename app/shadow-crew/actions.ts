'use server';

import {redirect} from 'next/navigation';
import {revalidatePath} from 'next/cache';
import {requireWorkspace} from '../../lib/workspace';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Owner assigns PIC or SIC exclusively to a counterfactual shadow-flight story.
 * This does not issue a charter release or set operational crew location.
 */
export async function assignShadowCrew(formData:FormData){
 const {supabase,organization,user}=await requireWorkspace();
 const flightId=String(formData.get('flight_id')??'').trim();
 const employeeId=String(formData.get('employee_id')??'').trim();
 const role=String(formData.get('role')??'');
 if(!uuid.test(flightId)||!uuid.test(employeeId)||!['PIC','SIC'].includes(role)){
  redirect('/shadow-crew?notice=invalid');
 }
 const [fResult,eResult]=await Promise.all([
  supabase.from('shadow_flights').select('id,status,departure_at,simulation_only')
   .eq('organization_id',organization.id).eq('id',flightId).maybeSingle(),
  supabase.from('employees').select('id,crew_role')
   .eq('organization_id',organization.id).eq('id',employeeId).maybeSingle()
 ]);
 const flight=fResult.data,crew=eResult.data;
 if(fResult.error||eResult.error||!flight||!crew||
    flight.status!=='planned'||flight.simulation_only!==true||
    new Date(flight.departure_at).getTime()<=Date.now()+10*60*1000||
    crew.crew_role!==role){
  redirect('/shadow-crew?notice=invalid');
 }
 const {error}=await supabase.from('shadow_crew_assignments').insert({
  organization_id:organization.id,
  shadow_flight_id:flightId,
  employee_id:employeeId,
  crew_role:role,
  assigned_by_user_id:user.id,
  simulation_only:true
 });
 if(error){
  if(error.code==='23505')redirect('/shadow-crew?notice=duplicate');
  redirect('/shadow-crew?notice=blocked');
 }
 revalidatePath('/shadow-crew');
 redirect('/shadow-crew?notice=assigned');
}
