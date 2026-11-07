import Link from 'next/link';
import OpsShell from '../../components/ops-shell';
import {requireWorkspace} from '../../lib/workspace';
import {assignShadowCrew} from './actions';
import './shadow-crew.css';

export const dynamic='force-dynamic';

type Flight={id:string;registration_snapshot:string;departure_icao:string;arrival_icao:string;departure_at:string;arrival_at:string;status:string;};
type Person={id:string;display_name:string;crew_role:string;home_base_icao:string|null;employment_status:string};
type Assignment={id:string;shadow_flight_id:string;employee_id:string;crew_role:string;assigned_at:string};
type Movement={id:string;source_kind:string;source_id:string;employee_id:string;status:string;from_icao:string;to_icao:string;departed_at:string;arrived_at:string;reason:string};
type Initial={employee_id:string;location_icao:string;occurred_at:string;};
const fmt=(s:string)=>new Date(s).toLocaleString('de-DE',{timeZone:'Europe/Berlin',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
const notices:Record<string,string>={
 assigned:'Die PIC-/SIC-Person wurde ausschließlich dem virtuellen Szenario zugeordnet.',
 duplicate:'Dieser Sitz ist bereits vergeben oder die Crew ist schon im Szenario eingesetzt.',
 invalid:'Szenario oder Crewrolle ungültig. Nur zukünftige geplante virtuelle Flüge können besetzt werden.',
 blocked:'Zuordnung abgelehnt. Möglich sind ein Zeitkonflikt, eine fehlende Berechtigung oder ein anderer Crew-Schutz.'
};
const readable:Record<string,string>={
 completed_virtual:'In der Simulation angekommen',
 blocked_no_location:'Ausgangsstandort fehlt',
 blocked_wrong_airport:'Crew nicht am Abflugplatz',
 blocked_stale_location:'Letzter Standortnachweis zu alt',
 blocked_early_assignment:'Crew erst nach Abflug zugewiesen',
 blocked_time_window:'Mindestvorlauf fehlt'
};
export default async function ShadowCrewPage({searchParams}:{searchParams:Promise<{notice?:string}>}){
 const q=await searchParams;
 const {supabase,organization}=await requireWorkspace();
 const [flightsR,employeesR,assignmentsR,movementsR,checkinsR]=await Promise.all([
  supabase.from('shadow_flights')
   .select('id,registration_snapshot,departure_icao,arrival_icao,departure_at,arrival_at,status')
   .eq('organization_id',organization.id).order('departure_at',{ascending:false}).limit(100),
  supabase.from('employees')
   .select('id,display_name,crew_role,home_base_icao,employment_status')
   .eq('organization_id',organization.id).order('display_name').limit(150),
  supabase.from('shadow_crew_assignments')
   .select('id,shadow_flight_id,employee_id,crew_role,assigned_at')
   .eq('organization_id',organization.id).limit(300),
  supabase.from('shadow_crew_movements')
   .select('id,source_kind,source_id,employee_id,status,from_icao,to_icao,departed_at,arrived_at,reason')
   .eq('organization_id',organization.id).order('arrived_at',{ascending:false}).limit(300),
  supabase.from('crew_location_events')
   .select('employee_id,location_icao,occurred_at')
   .eq('organization_id',organization.id).eq('event_type','check_in')
   .eq('verification_state','verified').limit(150)
 ]);
 const failed=flightsR.error||employeesR.error||assignmentsR.error||movementsR.error||checkinsR.error;
 const flights=(flightsR.data??[]) as Flight[];
 const staff=((employeesR.data??[]) as Person[]).filter(p=>['PIC','SIC'].includes(p.crew_role));
 const assignments=(assignmentsR.data??[]) as Assignment[];
 const movements=(movementsR.data??[]) as Movement[];
 const checkins=(checkinsR.data??[]) as Initial[];
 const personById=new Map(staff.map(x=>[x.id,x]));
 const initial=new Map(checkins.map(c=>[c.employee_id,c.location_icao]));
 const lastSimulated=new Map<string,Movement>();
 for(const m of movements){
  if(!lastSimulated.has(m.employee_id))lastSimulated.set(m.employee_id,m);
 }
 const place=(id:string)=>{
  const last=lastSimulated.get(id);
  if(last)return last.status==='completed_virtual'?last.to_icao:'Ungeklärt';
  return initial.get(id)??'Nicht bestätigt';
 };
 const canStaff=(f:Flight)=>f.status==='planned'&&new Date(f.departure_at).getTime()>Date.now()+600000;
 const nPlanned=flights.filter(f=>f.status==='planned').length;
 const assignedCount=assignments.length;
 const blockedCount=movements.filter(m=>m.status!=='completed_virtual').length;
 return <OpsShell active="shadow-crew">
  <header className="header"><div>
   <span className="eyebrow">AERVELYS · AUTONOME SIMULATION</span>
   <h1>Virtual Crew Movement Control</h1>
   <p>PIC-/SIC-Szenariobesetzung und automatische Positionsprüfung nach virtuellen Charter- und Ferryflügen.</p>
  </div><span className="state">● Shadow World · keine Crewfreigabe</span></header>
  <section className="moduleBanner"><strong>Zwei strikt getrennte Welten</strong>
   <p>Dieser Bereich nutzt ausschließlich hypothetische Flugabläufe. Er kann eine virtuelle Crewzuordnung
    und spätere simulierte Ankunft dokumentieren, aber niemals eine echte MSFS-Landung, Fluglizenz,
    Dienstzeitfreigabe oder operative Crewposition bestätigen. Der Ausgangsstandort muss zuvor
    in Crew Location Control ausdrücklich bestätigt worden sein.</p>
  </section>
  <div className="commandLinks">
   <Link href="/crew-locations">Crew-Ausgangsstandorte →</Link>
   <Link href="/flight-simulator">Virtuelle Flugabläufe →</Link>
   <Link href="/positioning">Virtuelle Ferryflüge →</Link>
   <Link href="/crew-travel">Automatische Crewpositionierung →</Link>
   <Link href="/crew-mobility">Crew Mobility & Roster →</Link>
  </div>
  {q.notice&&notices[q.notice]&&<p className="scenarioNotice" role="status">{notices[q.notice]}</p>}
  {failed?<p className="emptyState" role="alert">Szenario-Crewing konnte nicht vollständig geladen werden. Keine Dispositionsbewertung.</p>:<>
   <section className="ledgerSummary">
    <div className="ledgerMetric"><span>Geplante Schattenflüge</span><strong>{nPlanned}</strong></div>
    <div className="ledgerMetric"><span>PIC-/SIC-Profile</span><strong>{staff.length}</strong></div>
    <div className="ledgerMetric"><span>Virtuelle Crewzuweisungen</span><strong>{assignedCount}</strong></div>
    <div className="ledgerMetric"><span>Bewegungen mit Konflikt</span><strong>{blockedCount}</strong></div>
   </section>
   <section className="workspacePanel">
    <div className="panelHeading"><h2>Simulierte Crewstandorte</h2><span>Nur Szenario · keine Livepositionen</span></div>
    {staff.length===0?<p className="emptyState">Keine PIC-/SIC-Profile vorhanden.</p>:
     <div className="tableScroll"><table className="dataTable">
      <thead><tr><th>Mitarbeiter</th><th>Rolle</th><th>Homebase</th><th>Letzter virtueller Standort</th><th>Personalstatus</th></tr></thead>
      <tbody>{staff.map(p=><tr key={p.id}>
       <td><Link href={'/staff/'+p.id} className="staffLink">{p.display_name}</Link></td>
       <td>{p.crew_role}</td><td>{p.home_base_icao??'—'}</td>
       <td>{place(p.id)}</td><td>{p.employment_status==='draft'?'Personalakte im Entwurf':p.employment_status}</td>
      </tr>)}</tbody>
     </table></div>}
   </section>
   <div className="sectionHeader"><div><h2>Flüge und Szenariobesetzung</h2>
    <p>Eine PIC- und eine SIC-Zuordnung pro virtuellem Flug; Rollen- und Zeitkonflikte werden datenbankseitig geprüft.</p>
   </div><span>{flights.length} Flugszenarien</span></div>
   {flights.length===0?<p className="emptyState">Noch keine automatisch erzeugten virtuellen Charterflüge vorhanden.</p>:
    <div className="assessmentStack">{flights.map(f=>{
     const manifest=assignments.filter(a=>a.shadow_flight_id===f.id);
     return <article className="workspacePanel" key={f.id}>
      <div className="panelHeading">
       <h2>{f.departure_icao} → {f.arrival_icao} · {f.registration_snapshot}</h2>
       <span>{f.status==='completed'?'Szenario abgeschlossen':f.status==='planned'?'Szenario geplant':f.status}</span>
      </div>
      <p className="panelNote">Start {fmt(f.departure_at)} · Landung {fmt(f.arrival_at)} (Berlin-Zeit)</p>
      <div className="shadowCrewSeating">
       {(['PIC','SIC'] as const).map(role=>{
        const assigned=manifest.find(a=>a.crew_role===role);
        return <div className="shadowCrewSeat" key={role}>
         <strong>{role==='PIC'?'Captain / PIC':'First Officer / SIC'}</strong>
         {assigned?<p>{personById.get(assigned.employee_id)?.display_name??'Mitarbeiterprofil nicht lesbar'} · virtueller Einsatz</p>:
          canStaff(f)?<form action={assignShadowCrew} className="shadowCrewForm">
           <input type="hidden" name="flight_id" value={f.id}/>
           <input type="hidden" name="role" value={role}/>
           <select name="employee_id" aria-label={role+' auswählen'} defaultValue="" required>
            <option value="" disabled>Virtuelle Crew auswählen</option>
            {staff.filter(p=>p.crew_role===role).map(p=>
             <option key={p.id} value={p.id}>{p.display_name} · {place(p.id)}</option>)}
           </select>
           <button type="submit" className="signoutButton">Im Szenario zuordnen</button>
          </form>:<p>Kein virtueller Crew-Eintrag; nachträgliches Crewing gesperrt.</p>}
        </div>;
       })}
      </div>
      {manifest.length>0&&<p className="scenarioNotice">Zuordnung nur für die fiktive Unternehmenssimulation.
       Kein tatsächlicher Piloteneinsatz und kein automatischer Standortwechsel vor der virtuellen Landung.</p>}
     </article>;
    })}</div>}
   <div className="sectionHeader"><div><h2>Automatische Crewbewegungen</h2>
    <p>Append-only-Ergebnisse aus tatsächlich abgeschlossenen, hypothetischen Flügen. Konflikte bleiben sichtbar.</p>
   </div><span>{movements.length} Ergebnisse</span></div>
   {movements.length===0?<p className="emptyState">Noch keine Crewbewegungen aus abgeschlossenen Szenarien vorhanden.
    Erst eine vor Abflug festgelegte Besetzung kann beim virtuellen Flugabschluss verarbeitet werden.</p>:
    <div className="workspacePanel"><div className="tableScroll"><table className="dataTable">
     <thead><tr><th>Simulierte Landung</th><th>Crew</th><th>Typ</th><th>Route</th><th>Ergebnis</th></tr></thead>
     <tbody>{movements.map(m=><tr key={m.id}>
      <td>{fmt(m.arrived_at)}</td><td>{personById.get(m.employee_id)?.display_name??'Unbekannt'}</td>
      <td>{m.source_kind==='ferry'?'Ferry':'Charter'}</td><td>{m.from_icao} → {m.to_icao}</td>
      <td title={m.reason}>{readable[m.status]??m.status}</td>
     </tr>)}</tbody>
    </table></div></div>}
  </>}
  <p className="panelNote">Das ist noch kein autonomes Dienstplanungs- oder FTL-System. Nicht geprüfte
   Lizenzen, Medicals, aktuelle Standorte und gesetzliche Crew-Ruhezeiten bleiben separate
   Sperrgründe für den operativen Dispatch. Schattenflüge werden nicht in den realen MSFS-Flugnachweis geschrieben.</p>
 </OpsShell>;
}
