import Link from 'next/link';
import OpsShell from '../../components/ops-shell';
import {requireWorkspace} from '../../lib/workspace';
import {projectCrewLocations} from '../../lib/crew-location-ledger.mjs';
import {recordInitialCrewLocation} from './actions';

export const dynamic='force-dynamic';
type Employee={id:string;display_name:string;crew_role:string;home_base_icao:string|null};
type Event={
 id:string;employee_id:string;event_type:string;
 origin_icao:string|null;location_icao:string|null;departed_at:string|null;
 occurred_at:string;recorded_at:string;
 verification_state:string;verified_at:string|null;source_reference:string;
};
const moment=(value:string|null)=>value?new Date(value).toLocaleString('de-DE',{
 timeZone:'UTC',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'
})+' UTC':'—';
const typeNames:Record<string,string>={
 check_in:'Standortbestätigung',
 flight_arrival:'Flug abgeschlossen',
 transfer_arrival:'Crewtransfer abgeschlossen',
 location_unknown:'Standort ungeklärt'
};
const statusNames:Record<string,string>={
 verified:'Simulierter Standort belegt',
 stale:'Nachweis veraltet',
 blocked:'Standortkette ungeklärt',
 unknown:'Kein gültiger Nachweis'
};
const notices:Record<string,string>={
 created:'Der virtuelle Anfangsstandort wurde unveränderlich erfasst.',
 already:'Für diese Person existiert bereits eine Ausgangsbestätigung. Ein neuer Standort braucht eine dokumentierte Bewegung.',
 invalid:'Mitarbeiter oder ICAO-Flugplatz ungültig.',
 unavailable:'Der Standort konnte nicht geschrieben werden. Die bestehende Historie bleibt unverändert.'
};
export default async function CrewLocationsPage({searchParams}:{searchParams:Promise<{notice?:string}>}){
 const q=await searchParams;
 const {supabase,organization}=await requireWorkspace();
 const now=new Date().toISOString();
 const [staffR,eventsR]=await Promise.all([
  supabase.from('employees').select('id,display_name,crew_role,home_base_icao')
   .eq('organization_id',organization.id).order('display_name').limit(150),
  supabase.from('crew_location_events')
   .select('id,employee_id,event_type,origin_icao,location_icao,departed_at,occurred_at,recorded_at,verification_state,verified_at,source_reference')
   .eq('organization_id',organization.id).lte('occurred_at',now)
   .order('occurred_at',{ascending:false}).limit(1000)
 ]);
 const failed=Boolean(staffR.error);
 const ledgerUnavailable=Boolean(eventsR.error);
 const staff=((staffR.data??[]) as Employee[]).filter(p=>p.crew_role==='PIC'||p.crew_role==='SIC');
 const entries=ledgerUnavailable?[]:(eventsR.data??[]) as Event[];
 const truncated=entries.length===1000;
 const checkedIn=new Set(entries.filter(e=>e.event_type==='check_in'&&e.verification_state==='verified').map(e=>e.employee_id));
 const eligible=staff.filter(p=>!checkedIn.has(p.id));
 // If the source was truncated the complete ordered position chain cannot
 // be validated. Fail closed for ALL crew, not only a guessed subset.
 const locations=projectCrewLocations({
  people:staff.map(p=>({id:p.id,name:p.display_name,role:p.crew_role,
   homeBaseIcao:p.home_base_icao})),
  events:truncated?[]:entries.map(e=>({
   id:e.id,employeeId:e.employee_id,eventType:e.event_type,
   originIcao:e.origin_icao,locationIcao:e.location_icao,
   departedAt:e.departed_at,occurredAt:e.occurred_at,recordedAt:e.recorded_at,
   verificationState:e.verification_state,verifiedAt:e.verified_at,
   sourceReference:e.source_reference
  })),
  asOf:now,maxAgeMinutes:7*24*60
 });
 const verified=ledgerUnavailable||truncated?0:locations.filter(p=>p.status==='verified').length;
 return <OpsShell active="crew-locations">
  <header className="header"><div>
   <span className="eyebrow">AERVELYS · PERSONNEL TRACKING / SIMULATION</span>
   <h1>Crew Location Control</h1>
   <p>Nachweisbare Pilotenstandorte mit zeitlicher Einsatzhistorie – ohne automatische Ortswechsel.</p>
  </div><span className="state">● Evidenzjournal · geschützter Anfangs-Check-in</span></header>
  <section className="moduleBanner"><strong>Standortnachweis ≠ Crew-Einsatzfreigabe</strong>
   <p>Hier werden ausschließlich dokumentierte Ankünfte, Transfers und bestätigte Standorte
    innerhalb unserer virtuellen Airline bewertet. Ein geplanter Flug oder der Heimatflugplatz
    ist kein Aufenthaltsnachweis. Für die spätere Disposition werden zusätzlich gültige
    Qualifikationen, Dienst-/Ruhezeiten, Wartung und Performance geprüft.</p>
  </section>
  {q.notice&&notices[q.notice]&&<p className="scenarioNotice" role="status">{notices[q.notice]}</p>}
  {!failed&&!ledgerUnavailable&&!truncated&&eligible.length>0&&<section className="workspacePanel">
   <div className="panelHeading"><h2>Virtuellen Ausgangsstandort bestätigen</h2>
    <span>Einmaliger Inhaber-Check-in</span></div>
   <p className="panelNote">Wähle nur einen bewusst festgelegten Anfangsstandort der Simulation.
    Eine Homebase wird niemals automatisch als aktueller Standort eingetragen.
    Anschließende Ortswechsel erfordern einen belegten Flug oder Crewtransfer.
    Dies ist keine reale Positionsmessung oder Piloteneinsatzfreigabe.</p>
   <form action={recordInitialCrewLocation} style={{display:'flex',gap:12,flexWrap:'wrap',alignItems:'end',marginTop:16}}>
    <label style={{display:'grid',gap:7,minWidth:220,flex:'1'}}>
     <span style={{fontSize:12}}>Crewmitglied</span>
     <select name="employee_id" required defaultValue=""
      style={{background:'#102138',color:'#eef4ff',border:'1px solid #48617b',borderRadius:8,padding:11}}>
      <option value="" disabled>Bitte auswählen</option>
      {eligible.map(p=><option key={p.id} value={p.id}>{p.display_name} · {p.crew_role}</option>)}
     </select>
    </label>
    <label style={{display:'grid',gap:7,minWidth:155}}>
     <span style={{fontSize:12}}>Standort (ICAO)</span>
     <input name="location_icao" required maxLength={4} minLength={4}
      pattern="[A-Za-z0-9]{4}" placeholder="z. B. EDAZ" autoCapitalize="characters"
      style={{background:'#102138',color:'#eef4ff',border:'1px solid #48617b',borderRadius:8,padding:11}}/>
    </label>
    <button className="signoutButton" type="submit" style={{minHeight:41}}>Einmalig bestätigen</button>
   </form>
  </section>}
  {(ledgerUnavailable||truncated)&&<p className="ledgerWarning" role="alert">
   {truncated?'Mehr als 1.000 Standortereignisse: Historie nicht vollständig geladen. Alle Einsatzfreigaben bleiben gesperrt.':
    'Das Standortjournal ist noch nicht verfügbar. Die vorbereitete Datenbankmigration muss im neuen OPS-5.0-Projekt eingespielt und geprüft werden.'}
  </p>}
  {failed?<p role="alert" className="emptyState">Personalstammdaten nicht abrufbar – keine Standortbestimmung.</p>:<>
   <section className="ledgerSummary">
    <div className="ledgerMetric"><span>PIC-/SIC-Profile</span><strong>{staff.length}</strong></div>
    <div className="ledgerMetric"><span>Geladene Journalereignisse</span><strong>{entries.length}</strong></div>
    <div className="ledgerMetric"><span>Aktuelle Standortnachweise</span><strong>{verified}</strong></div>
    <div className="ledgerMetric"><span>Ungeklärt / veraltet</span><strong>{staff.length-verified}</strong></div>
   </section>
   <section className="workspacePanel">
    <div className="panelHeading"><h2>Crew Location Register</h2><span>Max. 7 Tage alter Nachweis · UTC</span></div>
    {staff.length===0?<p className="emptyState">Noch keine PIC-/SIC-Mitarbeiter vorhanden.</p>:
     <div className="tableScroll"><table className="dataTable">
      <thead><tr><th>Mitarbeiter</th><th>Funktion</th><th>Homebase</th><th>Verifizierter Standort</th><th>Letzter Nachweis</th><th>Ergebnis</th></tr></thead>
      <tbody>{locations.map(p=><tr key={p.employeeId}>
       <td><Link href={'/staff/'+p.employeeId} className="staffLink">{p.name}</Link></td>
       <td>{p.role}</td><td>{p.homeBaseIcao??'—'}</td>
       <td><strong>{!ledgerUnavailable&&!truncated?p.locationIcao??'Unbekannt':'Unbekannt'}</strong></td>
       <td>{!ledgerUnavailable&&!truncated?moment(p.verifiedAt):'—'}</td>
       <td>{ledgerUnavailable||truncated?'Gesperrt':statusNames[p.status]??p.status}</td>
      </tr>)}</tbody>
     </table></div>}
   </section>
   <div className="sectionHeader"><div><h2>Standort- und Transferhistorie</h2>
    <p>Unveränderliche Nachweise, keine von der KI erfundenen Flugbewegungen.</p>
   </div><span>{Math.min(40,entries.length)} zuletzt angezeigt</span></div>
   {entries.length===0?<p className="emptyState">Noch keine Standortereignisse vorhanden.</p>:
    <div className="workspacePanel"><div className="tableScroll"><table className="dataTable">
     <thead><tr><th>Zeitpunkt</th><th>Mitarbeiter</th><th>Ereignis</th><th>Bewegung</th><th>Verifizierung</th><th>Referenz</th></tr></thead>
     <tbody>{entries.slice(0,40).map(e=><tr key={e.id}>
      <td>{moment(e.occurred_at)}</td>
      <td>{staff.find(p=>p.id===e.employee_id)?.display_name??'Mitarbeiterakte'}</td>
      <td>{typeNames[e.event_type]??e.event_type}</td>
      <td>{e.origin_icao?e.origin_icao+' → ':''}{e.location_icao??'Unbekannt'}</td>
      <td>{e.verification_state}</td>
      <td>{e.source_reference}</td>
     </tr>)}</tbody></table></div></div>}
  </>}
  <div className="commandLinks">
   <Link href="/shadow-crew">Simulierte Crewbewegungen →</Link>
   <Link href="/crew-mobility">Crew Mobility & Roster →</Link>
   <Link href="/crew-scheduling">Crew Scheduling →</Link>
   <Link href="/rotation">Daily Flight Schedule →</Link>
  </div>
  <p className="panelNote">Nur einmalige, manuell bestätigte Ausgangspositionen werden hier ins geschützte Journal geschrieben.
   Ein Pilot darf dadurch weder automatisch fliegen noch eine Ortsänderung erhalten.
   Spätere Transfers und Ankünfte benötigen eine gesonderte verifizierte Ereignisquelle.
   Alle Angaben gelten ausschließlich für die AERVELYS-Simulation.</p>
 </OpsShell>;
}
