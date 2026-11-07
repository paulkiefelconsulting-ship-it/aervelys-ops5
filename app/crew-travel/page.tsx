import Link from 'next/link';
import OpsShell from '../../components/ops-shell';
import {requireWorkspace} from '../../lib/workspace';
import {proposeShadowCrewTravel} from '../../lib/shadow-crew-travel.mjs';
import {addShadowCrewRoute} from './actions';
import './crew-travel.css';

export const dynamic='force-dynamic';
type Staff={id:string;display_name:string;crew_role:string;employment_status:string};
type Flight={id:string;aircraft_id:string;status:string;registration_snapshot:string;departure_icao:string;arrival_icao:string;departure_at:string;arrival_at:string};
type Aircraft={id:string;aircraft_type:string};
type Assignment={id:string;shadow_flight_id:string;employee_id:string;crew_role:string};
type Anchor={employee_id:string;event_type:string;verification_state:string;source_reference:string;occurred_at:string;location_icao:string|null};
type Movement={id:string;employee_id:string;status:string;departed_at:string;arrived_at:string;from_icao:string;to_icao:string};
type Route={id:string;from_icao:string;to_icao:string;mode:'shuttle'|'rail'|'airline';duration_minutes:number;estimated_cost_eur:number|string;simulation_only:boolean;scenario_note:string};
type Ferry={shadow_flight_id:string;status:string;proposed_departure_at:string|null;proposed_arrival_at:string|null;from_icao:string;to_icao:string};

const when=(s:string)=>new Date(s).toLocaleString('de-DE',{timeZone:'Europe/Berlin',
 day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})+' Uhr';
const eur=(n:number)=>new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR'}).format(n);
const modes:Record<string,string>={shuttle:'Shuttle / Taxi',rail:'Bahn',airline:'Linienflug'};
const issues:Record<string,string>={
 LOCATION_NOT_ATTESTED:'Startstandort noch nicht bestätigt',
 LOCATION_EVIDENCE_STALE:'Letzter Standortnachweis zu alt',
 MOVEMENT_CHAIN_UNVERIFIED:'Crewbewegung ungeklärt',
 OTHER_ASSIGNMENT_UNKNOWN:'Vorherige Crewbindung nicht vollständig dokumentiert',
 PRIOR_OR_OVERLAPPING_ASSIGNMENT:'Vorheriger oder paralleler Crewauftrag',
 TRAVEL_ROUTE_MISSING:'Kein hinterlegter Reiseweg zum Abflugplatz',
 TRAVEL_OR_REST_TIME_INSUFFICIENT:'Anreise oder Ruhezeit reicht nicht aus',
 CREW_PAIR_UNAVAILABLE:'Kein geeigneter PIC/SIC-Vorschlag',
 FLIGHT_WINDOW_INVALID:'Ungültige Flugzeiten',
 FERRY_BLOCKED:'Vorgeschaltete Ferrypositionierung blockiert',
 MULTIPLE_FERRY_LEGS_UNSUPPORTED:'Mehrere Ferry-Segmente noch nicht prüfbar',
 FERRY_TIMELINE_INVALID:'Ferryflug und Charter zeitlich/geografisch unvereinbar',
 SCENARIO_TOO_CLOSE_OR_PAST:'Flug bereits gestartet oder zu kurzfristig',
 LONGITUDE_EDAZ_FORBIDDEN:'Longitude darf EDAZ nicht nutzen',
 PHENOM_CHARTER_BLOCKED:'Phenom 300E ist nicht für Charter freigegeben'
};
const notices:Record<string,string>={
 added:'Neue virtuelle Reiseannahme gespeichert – es wurde kein Ticket gebucht.',
 exists:'Die identische Reiseannahme existiert bereits.',
 invalid:'Route, Preis, Dauer oder Erläuterung sind ungültig.',
 failed:'Speichern abgelehnt. Die bestehenden Reiseannahmen bleiben unverändert.'
};

export default async function CrewTravelPage({searchParams}:{searchParams:Promise<{notice?:string}>}){
 const q=await searchParams;
 const {supabase,organization}=await requireWorkspace();
 const [routesR,staffR,flightsR,aircraftR,assignmentsR,checkinsR,movementsR,ferriesR]=await Promise.all([
  supabase.from('shadow_crew_travel_options')
   .select('id,from_icao,to_icao,mode,duration_minutes,estimated_cost_eur,simulation_only,scenario_note')
   .eq('organization_id',organization.id).order('created_at',{ascending:false}).limit(400),
  supabase.from('employees').select('id,display_name,crew_role,employment_status')
   .eq('organization_id',organization.id).order('display_name').limit(150),
  supabase.from('shadow_flights')
   .select('id,aircraft_id,status,registration_snapshot,departure_icao,arrival_icao,departure_at,arrival_at')
   .eq('organization_id',organization.id).order('departure_at').limit(120),
  supabase.from('aircraft').select('id,aircraft_type')
   .eq('organization_id',organization.id).limit(100),
  supabase.from('shadow_crew_assignments')
   .select('id,shadow_flight_id,employee_id,crew_role')
   .eq('organization_id',organization.id).limit(500),
  supabase.from('crew_location_events')
   .select('employee_id,event_type,verification_state,source_reference,occurred_at,location_icao')
   .eq('organization_id',organization.id).order('occurred_at').limit(500),
  supabase.from('shadow_crew_movements')
   .select('id,employee_id,status,departed_at,arrived_at,from_icao,to_icao')
   .eq('organization_id',organization.id).order('arrived_at').limit(500),
  supabase.from('shadow_positioning_legs')
   .select('shadow_flight_id,status,proposed_departure_at,proposed_arrival_at,from_icao,to_icao')
   .eq('organization_id',organization.id).limit(200)
 ]);
 const failed=routesR.error||staffR.error||flightsR.error||aircraftR.error||
   assignmentsR.error||checkinsR.error||movementsR.error||ferriesR.error;
 const staff=((staffR.data??[]) as Staff[]).filter(p=>p.crew_role==='PIC'||p.crew_role==='SIC');
 const routes=(routesR.data??[]) as Route[];
 const flights=(flightsR.data??[]) as Flight[];
 const aircraft=(aircraftR.data??[]) as Aircraft[];
 const assignments=(assignmentsR.data??[]) as Assignment[];
 const checkins=(checkinsR.data??[]) as Anchor[];
 const movements=(movementsR.data??[]) as Movement[];
 const ferries=(ferriesR.data??[]) as Ferry[];
 const exceeded=routes.length===400||flights.length===120||assignments.length===500||
  checkins.length===500||movements.length===500||ferries.length===200;
 const planeById=new Map(aircraft.map(a=>[a.id,a.aircraft_type]));
 const plans=failed||exceeded?[]:proposeShadowCrewTravel({
  people:staff.map(p=>({id:p.id,name:p.display_name,role:p.crew_role as 'PIC'|'SIC'})),
  flights:flights.map(f=>({
   id:f.id,status:f.status,departureIcao:f.departure_icao,arrivalIcao:f.arrival_icao,
   departureAt:f.departure_at,arrivalAt:f.arrival_at,
   aircraftType:planeById.get(f.aircraft_id)??''
  })),
  assignments:assignments.map(a=>({shadowFlightId:a.shadow_flight_id,
   employeeId:a.employee_id,role:a.crew_role as 'PIC'|'SIC'})),
  checkins:checkins.map(a=>({employeeId:a.employee_id,eventType:a.event_type,
   verificationState:a.verification_state,sourceReference:a.source_reference,
   occurredAt:a.occurred_at,locationIcao:a.location_icao})),
  movements:movements.map(m=>({id:m.id,employeeId:m.employee_id,status:m.status,
   departedAt:m.departed_at,arrivedAt:m.arrived_at,fromIcao:m.from_icao,toIcao:m.to_icao})),
  routes:routes.map(r=>({id:r.id,fromIcao:r.from_icao,toIcao:r.to_icao,mode:r.mode,
   durationMinutes:r.duration_minutes,costEur:Number(r.estimated_cost_eur),simulationOnly:r.simulation_only})),
  positioningLegs:ferries.map(f=>({shadowFlightId:f.shadow_flight_id,status:f.status,
   departureAt:f.proposed_departure_at,arrivalAt:f.proposed_arrival_at,
   fromIcao:f.from_icao,toIcao:f.to_icao})),
  asOf:new Date().toISOString()
 });
 const ready=plans.filter(p=>p.status==='scenario_proposal');
 return <OpsShell active="crew-travel">
  <header className="header"><div>
   <span className="eyebrow">AERVELYS · VIRTUAL CREW DISPATCH</span>
   <h1>Automatic Crew Positioning</h1>
   <p>Reisewege für Captain und First Officer, Standorte, Anschlüsse, Kosten und Mindest-Ruhefenster.</p>
  </div><span className="state">● Automatische Szenariovorschläge</span></header>
  <section className="moduleBanner"><strong>Keine echten Tickets und keine operative Crewfreigabe</strong>
   <p>Die KI-freie Dispositionslogik ermittelt aus selbst hinterlegten fiktiven Reiseoptionen die
    günstigste zeitlich passende Positionierung. Linienflug-, Bahn- und Shuttlezeiten sind
    Simulationsannahmen, keine aktuelle Verfügbarkeit oder bestätigten Buchungen.
    Als Planungsgrenze dienen vorerst 11 Stunden simulierte Ruhe nach einem abgeschlossenen
    Szenariodienst, zuzüglich 30 Minuten Release. Das ersetzt ausdrücklich keine EASA-FTL-Prüfung.</p>
  </section>
  <div className="commandLinks">
   <Link href="/shadow-crew">Virtuelle Crewzuweisung →</Link>
   <Link href="/crew-locations">Ausgangsstandorte →</Link>
   <Link href="/crew-mobility">Dienstplanung →</Link>
   <Link href="/rotation">Flottenumlauf →</Link>
  </div>
  {q.notice&&notices[q.notice]&&<p className="scenarioNotice" role="status">{notices[q.notice]}</p>}
  <section className="workspacePanel">
   <div className="panelHeading"><h2>Reiseannahme erfassen</h2><span>Owner-Katalog · nur Simulation</span></div>
   <p className="panelNote">Jede Richtung ist eine eigenständige Option. Beispielsweise benötigt EDAZ → EDDB
    eine andere Route als EDDB → EDAZ. Alle Angaben sind geschätzte Werte für das Rollenspiel.</p>
   <form action={addShadowCrewRoute} className="crewTravelForm">
    <label>Von (ICAO)<input name="from_icao" required pattern="[A-Za-z0-9]{4}" minLength={4} maxLength={4} placeholder="EDAZ"/></label>
    <label>Nach (ICAO)<input name="to_icao" required pattern="[A-Za-z0-9]{4}" minLength={4} maxLength={4} placeholder="EDDB"/></label>
    <label>Verkehrsmittel<select name="mode" required defaultValue="shuttle">
     <option value="shuttle">Shuttle / Taxi</option>
     <option value="rail">Bahn</option><option value="airline">Linienflug</option>
    </select></label>
    <label>Reisezeit (Min.)<input name="duration_minutes" type="number" min="5" max="4320" required placeholder="45"/></label>
    <label>Simulationskosten (€)<input name="estimated_cost_eur" type="number" min="0" max="100000" step="0.01" required placeholder="85.00"/></label>
    <label className="crewTravelNote">Grundlage der Annahme<input name="scenario_note" required minLength={3} maxLength={400}
     placeholder="z. B. fiktiver Shuttle-Transfer zwischen den Airports"/></label>
    <button className="signoutButton" type="submit">Reiseannahme speichern</button>
   </form>
  </section>
  {failed?<div className="emptyState" role="alert">Crew-, Flug- oder Routendaten nicht vollständig abrufbar. Keine Berechnung.</div>:<>
   {exceeded&&<p className="ledgerWarning" role="alert">Ein Datenlimit wurde erreicht. Die Disposition bleibt gesperrt, bis alle Standort-, Flug- und Reiseinformationen vollständig paginiert sind.</p>}
   <section className="ledgerSummary">
    <div className="ledgerMetric"><span>Crewprofile (PIC/SIC)</span><strong>{staff.length}</strong></div>
    <div className="ledgerMetric"><span>Hinterlegte Reisestrecken</span><strong>{routes.length}</strong></div>
    <div className="ledgerMetric"><span>Geplante Szenarioflüge</span><strong>{flights.filter(f=>f.status==='planned').length}</strong></div>
    <div className="ledgerMetric"><span>Automatische Reisevorschläge</span><strong>{ready.length}</strong></div>
   </section>
   <section className="workspacePanel">
    <div className="panelHeading"><h2>Reisekatalog</h2><span>Keine gebuchten Tickets · {routes.length} Optionen</span></div>
    {routes.length===0?<p className="emptyState">Noch keine virtuellen Reisewege hinterlegt. Lege eine Verbindung an; die Vorschläge werden danach automatisch neu berechnet.</p>:
     <div className="tableScroll"><table className="dataTable">
      <thead><tr><th>Strecke</th><th>Verkehrsmittel</th><th>Dauer</th><th>Simulationskosten</th><th>Notiz</th></tr></thead>
      <tbody>{routes.map(r=><tr key={r.id}><td>{r.from_icao} → {r.to_icao}</td>
       <td>{modes[r.mode]??r.mode}</td><td>{r.duration_minutes} Min.</td>
       <td>{eur(Number(r.estimated_cost_eur))}</td><td>{r.scenario_note}</td></tr>)}</tbody>
     </table></div>}
   </section>
   <div className="sectionHeader"><div><h2>Automatische PIC-/SIC-Positionierung</h2>
    <p>Rangfolge nach Kosten, mit maximal einer Verbindung und 45 Minuten Anschlusszeit. Kein Auftrag wird dadurch angenommen.</p></div>
    <span>{plans.length} Szenarien geprüft</span></div>
   {plans.length===0?<p className="emptyState">Noch keine disponierbaren Flugentwürfe. Bei neuen virtuellen Charteranfragen werden hier automatisch Reisevorschläge berechnet.</p>:
    <div className="assessmentStack">{plans.map(plan=>{
     const flight=flights.find(f=>f.id===plan.flightId);
     if(!flight)return null;
     return <article className="workspacePanel" key={plan.flightId}>
      <div className="panelHeading"><h2>{flight.departure_icao} → {flight.arrival_icao} · {flight.registration_snapshot}</h2>
       <span>{plan.status==='scenario_proposal'?'Reisevorschlag vorhanden':'Nicht disponierbar'}</span></div>
      <p className="panelNote">Virtueller Abflug {when(flight.departure_at)} · Crew-Report {plan.reportAt?when(plan.reportAt):'ungeklärt'}
       {plan.ferry?' · Ferryflug startet vorher':''}</p>
      {plan.status==='scenario_proposal'&&plan.pic&&plan.sic?
       <div className="crewTravelPair">
        {[plan.pic,plan.sic].map(p=><div key={p.id} className="crewTravelPerson">
         <strong>{p.role} · {p.name}</strong>
         <p>Start {p.fromIcao} → Crew-Report {p.toIcao}</p>
         <p>{p.travelMinutes} Minuten Reise · {eur(p.costEur??0)} Modellkosten</p>
         {p.steps?.length?<ol>{p.steps.map((step,i)=><li key={step.routeId+'-'+i}>
          {modes[step.mode]??step.mode}: {step.fromIcao} → {step.toIcao}, {when(step.startsAt)}–{when(step.endsAt)} · {eur(step.costEur)}
         </li>)}</ol>:<p>Kein Transfer nötig, Crew bereits am Einsatzort.</p>}
        </div>)}
        <p className="crewTravelTotal">Gesamte simulierte Reisekosten: <strong>{eur(plan.estimatedCostEur??0)}</strong></p>
       </div>:
       <p className="scenarioNotice">{issues[plan.issue??'']??plan.issue??'Keine passende Crew verfügbar.'}
        {plan.issues?.length?(' · Weitere Gründe: '+[...new Set(plan.issues)].map(i=>issues[i]??i).join('; ')):''}</p>}
      <p className="panelNote">Nur wirtschaftliche Simulation – keine Typzulassung, kein Medical-Check,
       keine Ticketbuchung und kein tatsächlicher Crewtransfer. Bestehende Crewzuweisungen
       werden nicht automatisch verändert.</p>
     </article>;
    })}</div>}
  </>}
 </OpsShell>;
}
