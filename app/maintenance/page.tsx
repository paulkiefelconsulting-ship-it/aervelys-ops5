import Link from 'next/link';
import OpsShell from '../../components/ops-shell';
import {requireWorkspace} from '../../lib/workspace';

export const dynamic='force-dynamic';
type AircraftState={
 aircraft_id:string;registration_snapshot:string;aircraft_type_snapshot:string;
 status:'clear'|'grounded';interval_hours:number|string;
 last_service_at_hours:number|string;due_at_hours:number|string;
 service_duration_hours:number|string;grounded_at:string|null;
 scheduled_release_at:string|null;service_count:number;updated_at:string;
};
type VirtualState={aircraft_id:string;hypothetical_location_icao:string;
 accumulated_hypothetical_hours:number|string;phase:string};
type Event={id:string;aircraft_id:string;event_type:string;event_at:string;
 hours_at_event:number|string;next_due_at_hours:number|string;narrative:string};
type Fleet={id:string;operational_status:string;current_icao:string|null};
const num=(x:string|number)=>Number(x).toLocaleString('de-DE',{minimumFractionDigits:2,maximumFractionDigits:2});
const utc=(x:string|null)=>x?new Date(x).toLocaleString('de-DE',{
 timeZone:'UTC',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})+' UTC':'Nicht festgelegt';
const labels:Record<string,string>={grounded:'Virtuell gesperrt',clear:'Virtuell verfügbar'};

export default async function MaintenancePage(){
 const {supabase,organization}=await requireWorkspace();
 const [maintenanceResult,virtualResult,eventsResult,fleetResult]=await Promise.all([
  supabase.from('shadow_maintenance_states')
   .select('aircraft_id,registration_snapshot,aircraft_type_snapshot,status,interval_hours,last_service_at_hours,due_at_hours,service_duration_hours,grounded_at,scheduled_release_at,service_count,updated_at')
   .eq('organization_id',organization.id).order('registration_snapshot').limit(50),
  supabase.from('shadow_aircraft_states')
   .select('aircraft_id,hypothetical_location_icao,accumulated_hypothetical_hours,phase')
   .eq('organization_id',organization.id).limit(50),
  supabase.from('shadow_maintenance_events')
   .select('id,aircraft_id,event_type,event_at,hours_at_event,next_due_at_hours,narrative')
   .eq('organization_id',organization.id).order('event_at',{ascending:false}).limit(60),
  supabase.from('aircraft').select('id,operational_status,current_icao')
   .eq('organization_id',organization.id).limit(50)
 ]);
 const maintenance=(maintenanceResult.data??[]) as AircraftState[];
 const virtualStates=new Map(((virtualResult.data??[]) as VirtualState[]).map(x=>[x.aircraft_id,x]));
 const fleet=new Map(((fleetResult.data??[]) as Fleet[]).map(x=>[x.id,x]));
 const events=(eventsResult.data??[]) as Event[];
 const error=maintenanceResult.error||virtualResult.error||eventsResult.error||fleetResult.error;
 const grounded=maintenance.filter(x=>x.status==='grounded').length;
 const nearThreshold=maintenance.filter(x=>{
  const hours=Number(virtualStates.get(x.aircraft_id)?.accumulated_hypothetical_hours??0);
  return x.status==='clear'&&Number(x.due_at_hours)-hours<=5;
 }).length;
 return <OpsShell active="maintenance">
  <header className="header"><div>
   <span className="eyebrow">TECHNICAL OPERATIONS · ISOLIERTE SIMULATION</span>
   <h1>Maintenance & Technical</h1>
   <p>Automatischer Stundenmonitor, technische Sperren und fiktive Wartungszyklen.</p>
  </div><span className="state">● Simulierte technische Prüfung</span></header>
  <section className="moduleBanner">
   <strong>Keine echte Wartungsfreigabe oder Lufttüchtigkeitsprüfung.</strong>
   <p>Die Regeln gelten ausschließlich für die autonomen Was-wäre-wenn-Flüge:
    Jede Maschine besitzt ein selbstständiges Modellstundenintervall. Werden
    fiktive Grenzen erreicht, wird sie virtuell gesperrt; nach einer
    angenommenen Wartungsdauer kann sie im Simulationsuniversum wieder fliegen.
    Reale Wartungsdokumentation, Flugzeugstandorte, Flugstunden und Freigaben
    werden weder ergänzt noch verändert.</p>
  </section>
  <section className="commandLinks">
   <Link href="/modules/fleet">Flottenregister →</Link>
   <Link href="/flight-simulator">Virtuelle Flüge →</Link>
   <Link href="/positioning">Virtuelle Überführungen →</Link>
   <Link href="/dispatch">Operative Dispatch-Sperren →</Link>
  </section>
  {error?<p className="emptyState" role="alert">Die simulierten Wartungsdaten konnten nicht vollständig geladen werden.</p>:<>
   <div className="ledgerSummary">
    <div className="ledgerMetric"><span>Überwachte Maschinen</span><strong>{maintenance.length}</strong></div>
    <div className="ledgerMetric"><span>Virtuell gesperrt</span><strong>{grounded}</strong></div>
    <div className="ledgerMetric"><span>Bis 5 Modellstunden zur Grenze</span><strong>{nearThreshold}</strong></div>
    <div className="ledgerMetric"><span>Simulierte Wartungsereignisse (angezeigt)</span><strong>{events.length}</strong></div>
   </div>
   <section className="moduleBanner"><strong>Aktuell verwendetes Testregelwerk</strong>
    <p>Alle fünf Flugzeugtypen: eine fiktive technische Inspektion nach jeweils
     20,00 Modellflugstunden und eine fiktive Standzeit von 12 Stunden.
     Bereits bei der Startprüfung werden Flüge oder Überführungen blockiert,
     deren angenommene Blockzeit das verbleibende Intervall überschreiten würde.
     Diese Werte sind **keine Herstellerintervalle** oder verbindlichen Wartungsprogramme.</p>
   </section>
   <div className="sectionHeader"><div><h2>Technische Simulationszustände</h2>
    <p>Die virtuelle Flugstundenhistorie ist ausdrücklich getrennt von den operativen Flugzeugstammdaten.</p>
   </div><span>{maintenance.length} Flugzeuge</span></div>
   {maintenance.length===0?<div className="emptyState">
    Noch keine virtuellen Wartungszustände erzeugt. Der stündliche Simulationslauf legt
    sie für bekannte Flugzeugtypen automatisch an.</div>:
    <div className="assessmentStack">{maintenance.map(m=>{
     const v=virtualStates.get(m.aircraft_id);
     const actual=fleet.get(m.aircraft_id);
     const hours=Number(v?.accumulated_hypothetical_hours??0);
     const left=Math.max(0,Number(m.due_at_hours)-hours);
     return <article className="workspacePanel" key={m.aircraft_id}>
      <div className="panelHeading">
       <h2>{m.registration_snapshot} · {m.aircraft_type_snapshot}</h2>
       <span>{labels[m.status]??m.status}</span>
      </div>
      <div className="assessmentDetail">
       <div><span>Hypothetischer Standort</span><strong>{v?.hypothetical_location_icao??'Unbekannt'}</strong></div>
       <div><span>Simulierte Gesamtflugstunden</span><strong>{num(hours)} h</strong></div>
       <div><span>Nächste Modellwartung bei</span><strong>{num(m.due_at_hours)} h</strong></div>
       <div><span>Verbleibende Modellflugstunden</span><strong>{num(left)} h</strong></div>
       <div><span>Abgeschlossene fiktive Wartungen</span><strong>{m.service_count}</strong></div>
       <div><span>Virtuelle Verfügbarkeit ab</span><strong>{utc(m.scheduled_release_at)}</strong></div>
      </div>
      <p className="panelNote">
       Echter Stammdatensatz bleibt unverändert: {actual?.operational_status??'Unbekannt'}.
       Tatsächlicher Standort: {actual?.current_icao??'nicht bestätigt'}.
       {m.status==='grounded'?' Diese Maschine darf keinen virtuellen Flug beginnen.':''}
      </p>
     </article>;
    })}</div>}
   <div className="sectionHeader"><div><h2>Virtuelle Wartungsereignisse</h2>
    <p>Unveränderliche Historie automatisch erkannter Grenzwerte und abgeschlossener Modellwartungen.</p>
   </div><span>{events.length} Einträge</span></div>
   {events.length===0?<p className="emptyState">
    Noch keine Modellwartung fällig. Im laufenden System hat bislang keines der
    Flugzeuge die angenommene Wartungsgrenze erreicht.</p>:
    <div className="workspacePanel"><div className="tableScroll"><table className="dataTable">
     <thead><tr><th>Zeit</th><th>Flugzeug</th><th>Ereignis</th><th>Modellstunden</th><th>Nächste Grenze</th></tr></thead>
     <tbody>{events.map(e=>{
      const m=maintenance.find(x=>x.aircraft_id===e.aircraft_id);
      return <tr key={e.id}>
       <td>{utc(e.event_at)}</td><td>{m?.registration_snapshot??'Unbekannt'}</td>
       <td>{e.event_type==='grounded'?'Virtuell gesperrt':'Modellwartung abgeschlossen'}</td>
       <td>{num(e.hours_at_event)} h</td><td>{num(e.next_due_at_hours)} h</td>
      </tr>;
     })}</tbody>
    </table></div></div>}
  </>}
  <p className="scenarioNotice" style={{marginTop:24}}>
   Die Wartungsautomatik läuft innerhalb der bereits aktiven stündlichen Shadow-Flight-Engine
   und benötigt keine Eingabe pro Flug. Sie verwendet keine echten technischen
   Flugzeugakten, keine Wartungsorganisation und keine regulatorischen Freigaben.
  </p>
 </OpsShell>;
}
