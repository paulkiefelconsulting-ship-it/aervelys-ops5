import Link from 'next/link';
import {notFound} from 'next/navigation';
import OpsShell from '../../../components/ops-shell';
import {requireWorkspace} from '../../../lib/workspace';

export const dynamic='force-dynamic';
type Qualification={
 id:string;qualification:string;aircraft_type:string;
 cat_recorded:boolean|null;ifr_recorded:boolean|null;simulation_only:boolean;
 status:string;source_review_note:string|null;
};
function flag(value:boolean|null):string{
 return value===true?'Im Altbestand: Ja':value===false?'Im Altbestand: Nein':'Nicht belegt';
}
function roleName(value:string|null){
 const names:Record<string,string>={
  PIC:'Captain · PIC',SIC:'First Officer · SIC',OPS_LEAD:'OPS-Leitung',
  DISPATCHER:'Dispatcher',OPS_SUPPORT:'OPS Support'};
 return names[value??'']??'Nicht festgelegt';
}

export default async function StaffProfilePage({params}:{params:Promise<{id:string}>}){
 const {id}=await params;
 if(!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(id))notFound();
 const {supabase,organization}=await requireWorkspace();
 const {data:person,error}=await supabase.from('employees')
  .select('id,employee_code,display_name,department,crew_role,home_base_icao,hire_date,source_duty_status,source_status,employment_status,is_owner_pilot,internal_dispatch_qualified')
  .eq('organization_id',organization.id).eq('id',id).maybeSingle();
 if(error||!person)notFound();
 const {data,error:qualError}=await supabase.from('crew_qualifications')
  .select('id,qualification,aircraft_type,cat_recorded,ifr_recorded,simulation_only,status,source_review_note')
  .eq('organization_id',organization.id).eq('employee_id',id)
  .order('aircraft_type',{ascending:true}).limit(30);
 const qualifications=(data??[]) as Qualification[];
 return <OpsShell active="crew">
  <div className="moduleBreadcrumb"><Link href="/modules/crew">Crew Management</Link><span>/</span>Personalakte</div>
  <header className="header"><div><span className="eyebrow">PERSONALAKTE · {organization.name}</span>
   <h1>{person.display_name}</h1><p>{roleName(person.crew_role)} · {person.employee_code}</p></div>
   <span className="state">● Prüfung ausstehend</span></header>
  <section className="moduleBanner"><strong>Bestandsübernahme ohne operative Freigabe</strong>
   <p>Die Angaben stammen aus der bisherigen Simulation. Hinterlegte Muster, CAT/IFR-Merkmale und ursprüngliche Aktiv-Kennzeichen sind keine gültige Flugfreigabe. Medizinische und vertragliche Nachweise bleiben im geschützten HR-Bereich.</p></section>
  <section className="staffFacts">
   <article><span>Abteilung</span><strong>{person.department}</strong></article>
   <article><span>Funktion</span><strong>{roleName(person.crew_role)}</strong></article>
   <article><span>Heimatbasis</span><strong>{person.home_base_icao??'Nicht bestätigt'}</strong></article>
   <article><span>Eintritt</span><strong>{person.hire_date??'Nicht hinterlegt'}</strong></article>
   <article><span>Altbestand</span><strong>{person.source_status==='legacy_active_simulated'?'Aktiv (Simulation)':'Nicht belegt'}</strong></article>
   <article><span>Freigabe OPS 5.0</span><strong>{person.employment_status==='draft'?'Entwurf – gesperrt':person.employment_status}</strong></article>
   <article><span>Dienststatus (Altbestand)</span><strong>{person.source_duty_status??'Nicht belegt'}</strong></article>
   <article><span>Dispatch (intern)</span><strong>{person.internal_dispatch_qualified?'Im Altsystem hinterlegt':'Nicht hinterlegt'}</strong></article>
  </section>
  {person.is_owner_pilot&&<section className="moduleBanner"><strong>Owner Pilot / Geschäftsführung</strong>
   <p>Geschäftsführerrolle ist dokumentiert. Die Phenom-300/300E- und Global-6000-Muster sind ausdrücklich als separate Simulationsberechtigungen erfasst. Keine automatische Betreiberfreigabe.</p></section>}
  <section className="workspacePanel">
   <div className="panelHeading"><h2>Muster- und Rollenberechtigungen</h2>
    <span>{qualifications.length} Bestandseinträge · Prüfung offen</span></div>
   {qualError?<div className="emptyState">Qualifikationsdaten derzeit nicht abrufbar.</div>:
    qualifications.length===0?<div className="emptyState">Keine Flugzeugmuster hinterlegt. OPS-Dispatch-Berechtigung wird getrennt geführt.</div>:
    <div className="staffQualList">{qualifications.map(q=><article key={q.id} className="staffQualification">
     <div><h3>{q.aircraft_type}</h3><span>{q.qualification} · {q.simulation_only?'Simulationsberechtigung':'Muster im Altbestand'}</span></div>
     <div><strong>CAT</strong><span>{flag(q.cat_recorded)}</span></div>
     <div><strong>IFR</strong><span>{flag(q.ifr_recorded)}</span></div>
     <div><strong>Prüfstatus</strong><span>{q.status==='draft'?'Nicht verifiziert':q.status}</span></div>
    </article>)}</div>}
  </section>
  <p className="panelNote" style={{marginTop:18}}>Lizenzen, Checks, Medicals, Ruhezeiten, Abwesenheiten und Arbeitgeberfreigaben werden vor jeder späteren Einsatzplanung gesondert geprüft. Gehalts- und Vertragswerte werden nicht in dieser allgemeinen Personalansicht ausgegeben.</p>
 </OpsShell>;
}
