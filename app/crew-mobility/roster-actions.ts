'use server';

import {randomUUID} from 'node:crypto';
import {revalidatePath} from 'next/cache';
import {redirect} from 'next/navigation';
import {requireWorkspace} from '../../lib/workspace';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const kinds=['standby','training','office','rest','absence'];
const events=['created','revised','cancelled'];
const dayOK=(day:string)=>/^\d{4}-\d{2}-\d{2}$/.test(day)&&
 Number.isFinite(Date.parse(day+'T00:00:00Z'))&&
 new Date(day+'T00:00:00Z').toISOString().slice(0,10)===day;
const parseUtcInput=(value:string)=>{
 // AERVELYS crew roster form explicitly labels its datetime-local inputs UTC.
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))return null;
 const date=new Date(value+'Z');
 if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,16)!==value)return null;
 return date.toISOString();
};
const target=(f:FormData,notice:string)=>{
 const day=String(f.get('view_date')??'').trim();
 const weeks=String(f.get('view_weeks')??'4');
 const kept=dayOK(day)?day:new Date().toISOString().slice(0,10);
 const span=['2','4','8','12'].includes(weeks)?weeks:'4';
 return '/crew-mobility?date='+kept+'&weeks='+span+'&notice='+notice;
};

/** Owner-only, append-only virtual crew roster draft. Never writes operational duties. */
export async function saveSimCrewRosterDraft(formData:FormData){
 const event=String(formData.get('event_type')??'');
 const member=String(formData.get('employee_id')??'');
 const kind=String(formData.get('kind')??'');
 const note=String(formData.get('note')??'').trim();
 const series=String(formData.get('series_id')??'');
 const revision=Number(String(formData.get('revision')??'1'));
 const start=String(formData.get('starts_at')??'');
 const end=String(formData.get('ends_at')??'');
 if(!events.includes(event)||!uuid.test(member)||!kinds.includes(kind)||
  note.length>400||!Number.isSafeInteger(revision)||revision<1||revision>1000||
  (event==='created'?(revision!==1||Boolean(series)) : !uuid.test(series))){
  redirect(target(formData,'draft_invalid'));
 }
 const {supabase,organization,user}=await requireWorkspace();
 let snapshot:{employee_id:string;kind:string;starts_at:string;ends_at:string;note:string}|null=null;
 if(event!=='created'){
  const {data,error}=await supabase.from('sim_crew_roster_revisions')
   .select('employee_id,kind,starts_at,ends_at,note,revision,event_type')
   .eq('organization_id',organization.id).eq('series_id',series)
   .order('revision',{ascending:false}).limit(1).maybeSingle();
  if(error||!data||data.event_type==='cancelled'||data.revision!==revision-1||
   data.employee_id!==member)redirect(target(formData,'draft_conflict'));
  snapshot=data;
 }
 let startsAt=parseUtcInput(start),endsAt=parseUtcInput(end);
 let finalKind=kind,finalNote=note;
 if(event==='cancelled'&&snapshot){
  startsAt=snapshot.starts_at;endsAt=snapshot.ends_at;
  finalKind=snapshot.kind;finalNote=snapshot.note;
 }
 if(!startsAt||!endsAt||Date.parse(startsAt)>=Date.parse(endsAt)||
  Date.parse(endsAt)-Date.parse(startsAt)>86_400_000){
  redirect(target(formData,'draft_invalid'));
 }
 // Postgres trigger revalidates owner, employee status, revision concurrency,
 // collisions with existing duties and synthetic flights.
 const {error}=await supabase.from('sim_crew_roster_revisions').insert({
  organization_id:organization.id,series_id:event==='created'?randomUUID():series,
  revision,event_type:event,employee_id:member,kind:finalKind,
  starts_at:startsAt,ends_at:endsAt,note:finalNote,
  created_by_user_id:user.id,simulation_only:true,
  staff_notified:false,operational_release:false
 });
 if(error)redirect(target(formData,'draft_conflict'));
 revalidatePath('/crew-mobility');
 redirect(target(formData,event==='cancelled'?'draft_cancelled':'draft_saved'));
}
