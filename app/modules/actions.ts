'use server';
import {redirect} from 'next/navigation';
import {revalidatePath} from 'next/cache';
import {getModule,type Field} from '../../lib/modules';
import {requireWorkspace} from '../../lib/workspace';

function invalid(id:string):never{redirect('/modules/'+id+'?result=invalid');}
function parseField(f:Field,raw:string,id:string):string|number|null{
 let value=raw.trim();
 if(!value){if(f.required)invalid(id);return null;}
 if(f.max && value.length>f.max && f.kind!=='number')invalid(id);
 if(f.kind==='select' && !f.options?.includes(value))invalid(id);
 if(f.kind==='reference' && !/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(value))invalid(id);
 if(f.kind==='email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))invalid(id);
 if(f.kind==='number'){
  const n=Number(value);
  if(!Number.isFinite(n)||n<=0||n>999999999.99)invalid(id);
  if(f.key==='passengers' && (!Number.isInteger(n)||n>40))invalid(id);
  return n;
 }
 if(f.kind==='date' && (!/^\d{4}-\d{2}-\d{2}$/.test(value)||Number.isNaN(Date.parse(value))))invalid(id);
 if(f.kind==='datetime'){
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))invalid(id);
  const d=new Date(value+':00Z');
  if(Number.isNaN(d.getTime()))invalid(id);
  return d.toISOString();
 }
 if(f.key.endsWith('_icao')){
  value=value.toUpperCase();
  if(!/^[A-Z0-9]{4}$/.test(value))invalid(id);
 }
 if(f.key==='registration'){
  value=value.toUpperCase();
  if(!/^[A-Z0-9-]{3,16}$/.test(value))invalid(id);
 }
 return value;
}

export async function createModuleRecord(data:FormData){
 const id=String(data.get('module')||'');
 const module=getModule(id);
 if(!module||module.readonly||module.fields.length===0)redirect('/');
 const {supabase,organization}=await requireWorkspace();
 const insert:Record<string,string|number|null>={organization_id:organization.id};
 for(const field of module.fields){
  const v=data.get(field.key);
  if(typeof v!=='string')invalid(id);
  const parsed=parseField(field,v,id);
  if(parsed!==null)insert[field.key]=parsed;
 }
 // The client cannot set deployment/operational/finance status.
 if(id==='crew'){insert.department='Crew';insert.employment_status='draft';}
 if(id==='fleet')insert.operational_status='inactive';
 if(id==='scheduler')insert.state='option';
 if(!['fleet','crew','scheduler'].includes(id))insert.status='draft';
 if((id==='flight-ops'||id==='sales')&&insert.departure_icao===insert.arrival_icao)invalid(id);
 if(id==='flight-ops' && Date.parse(String(insert.departure_at))>=Date.parse(String(insert.arrival_at)))invalid(id);
 if(id==='scheduler'&&Date.parse(String(insert.starts_at))>=Date.parse(String(insert.ends_at)))invalid(id);
 if(id==='hr' && String(insert.starts_on)>String(insert.ends_on))invalid(id);
 const {error}=await supabase.from(module.table).insert(insert);
 if(error)redirect('/modules/'+id+'?result='+(error.code==='23505'?'duplicate':'failed'));
 revalidatePath('/');
 revalidatePath('/modules/'+id);
 redirect('/modules/'+id+'?result=created');
}
