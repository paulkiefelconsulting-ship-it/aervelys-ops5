import Link from 'next/link';
import OpsShell from '../../components/ops-shell';
import {requireWorkspace} from '../../lib/workspace';
import {proposeShadowCrewTravel} from '../../lib/shadow-crew-travel.mjs';
import {proposeShadowCrewDispatch} from '../../lib/shadow-crew-dispatch.mjs';
import {addShadowCrewRoute} from './actions';
import {scheduleShadowCrewTransfer} from './schedule-transfer';
import './crew-travel.css';

export const dynamic='force-dynamic';
type Staff={id:string;display_name:string;crew_role:string;employment_status:string};
type Flight={id:string;aircraft_id:string;status:string;registration_snapshot:string;departure_icao:string;arrival_icao:string;departure_at:string;arrival_at:string};
type Aircraft={id:string;aircraft_type:string};
type Assignment={id:string;shadow_flight_id:string;employee_id:string;crew_role:string};
type Anchor={employee_id:string;event_type:string;verification_state:string;source_reference:string;occurred_at:string;location_icao:string|null};
type Movement={id:string;employee_id:string;source_kind:string;status:string;departed_at:string;arrived_at:string;from_icao:string;to_icao:string};
type Route={id:string;from_icao:string;to_icao:string;mode:'shuttle'|'rail'|'airline';duration_minutes:number;estimated_cost_eur:number|string;simulation_only:boolean;scenario_note:string};
type Ferry={shadow_flight_id:string;status:string;proposed_departure_at:string|null;proposed_arrival_at:string|null;from_icao:string;to_icao:string};
type Transfer={id:string;shadow_flight_id:string;employee_id:string;from_icao:string;to_icao:string;
 starts_at:string;ends_at:string;estimated_cost_eur:number|string;state:string;state_reason:string};
type Expense={transfer_id:string;amount_eur:number|string};

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
const dispatchIssues:Record<string,string>={
 NO_CONFLICT_FREE_CREW_PAIR:'Kein konfliktfreies PIC-/SIC-Paar über alle geplanten Flüge',
 CONFLICTING_SAVED_CREW_ASSIGNMENTS:'Pilot bereits mehrfach fest zugeordnet – bestehende Zuordnungen überprüfen',
 DUPLICATE_SAVED_CREW_ASSIGNMENT:'Mehrdeutige vorhandene PIC-/SIC-Zuordnung',
 SCENARIO_NOT_READY:'Einzelflug noch nicht prüfbar'
};
const notices:Record<string,string>={
 added:'Neue virtuelle Reiseannahme gespeichert – es wurde kein Ticket gebucht.',
 exists:'Die identische Reiseannahme existiert bereits.',
 invalid:'Route, Preis, Dauer oder Erläuterung sind ungültig.',
 failed:'Speichern abgelehnt. Die bestehenden Reiseannahmen bleiben unverändert.',
 invalid_transfer:'Ungültige Positionierung. Der Auftrag wurde nicht erstellt.',
 assign_first:'Crew muss zuerst dem virtuellen Flug zugeordnet werden.',
 transfer_exists:'Für diese Person und diesen Flug wurde bereits ein Transfer angelegt.',
 transfer_blocked:'Reiseauftrag von der Datenbank abgelehnt: Standort, Zeiten, Kosten oder Crewbindung prüfen.',
 transfer_scheduled:'Virtueller Crewtransfer eingeplant. Der Simulator verarbeitet Abflug und Ankunft automatisch.'
};

export default async function CrewTravelPage({searchParams}:{searchParams:Promise<{notice?:string}>}){
 const q=await searchParams;
 const {supabase,organization}=await requireWorkspace();
 const [routesR,staffR,flightsR,aircraftR,assignmentsR,checkinsR,movementsR,ferriesR,transfersR,expensesR]=await Promise.all([
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
   .select('id,employee_id,source_kind,status,departed_at,arrived_at,from_icao,to_icao')
   .eq('organization_id',organization.id).order('arrived_at').limit(500),
  supabase.from('shadow_positioning_legs')
   .select('shadow_flight_id,status,proposed_departure_at,proposed_arrival_at,from_icao,to_icao')
   .eq('organization_id',organization.id).limit(200),
  supabase.from('shadow_crew_transfer_orders')
   .select('id,shadow_flight_id,employee_id,from_icao,to_icao,starts_at,ends_at,estimated_cost_eur,state,state_reason')
   .eq('organization_id',organization.id).order('starts_at',{ascending:false}).limit(300),
  supabase.from('shadow_crew_travel_expenses')
   .select('transfer_id,amount_eur')
   .eq('organization_id',organization.id).limit(300)
 ]);
 const failed=routesR.error||staffR.error||flightsR.error||aircraftR.error||
   assignmentsR.error||checkinsR.error||movementsR.error||ferriesR.error||transfersR.error||expensesR.error;
 const staff=((staffR.data??[]) as Staff[]).filter(p=>p.crew_role==='PIC'||p.crew_role==='SIC');
 const routes=(routesR.data??[]) as Route[];
 const flights=(flightsR.data??[]) as Flight[];
 const aircraft=(aircraftR.data??[]) as Aircraft[];
 const assignments=(assignmentsR.data??[]) as Assignment[];
 const checkins=(checkinsR.data??[]) as Anchor[];
 const movements=(movementsR.data??[]) as Movement[];
 const ferries=(ferriesR.data??[]) as Ferry[];
 const transfers=(transfersR.data??[]) as Transfer[];
 const expenses=(expensesR.data??[]) as Expense[];
 const exceeded=routes.length===400||flights.length===120||assignments.length===500||
  checkins.length===500||movements.length===500||ferries.length===200||
  transfers.length===300||expenses.length===300;
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
  movements:movements.map(m=>({id:m.id,employeeId:m.employee_id,sourceKind:m.source_kind,status:m.status,
   departedAt:m.departed_at,arrivedAt:m.arrived_at,fromIcao:m.from_icao,toIcao:m.to_icao})),
  routes:routes.map(r=>({id:r.id,fromIcao:r.from_icao,toIcao:r.to_icao,mode:r.mode,
   durationMinutes:r.duration_minutes,costEur:Number(r.estimated_cost_eur),simulationOnly:r.simulation_only})),
  positioningLegs:ferries.map(f=>({shadowFlightId:f.shadow_flight_id,status:f.status,
   departureAt:f.proposed_departure_at,arrivalAt:f.proposed_arrival_at,
   fromIcao:f.from_icao,toIcao:f.to_icao})),
  asOf:new Date().toISOString()
 });
 const ready=plans.filter(p=>p.status==='scenario_proposal');
 const coordinated=failed||exceeded?[]:proposeShadowCrewDispatch({
  flights:flights.map(f=>({id:f.id,status:f.status,departureIcao:f.departure_icao,
   arrivalIcao:f.arrival_icao,departureAt:f.departure_at,arrivalAt:f.arrival_at})),
  plans,
  assignments:assignments.map(a=>({shadowFlightId:a.shadow_flight_id,employeeId:a.employee_id,
   role:a.crew_role as 'PIC'|'SIC'})),
  minimumRestMinutes:690
 });
 const coordinatedReady=coordinated.filter(p=>p.status==='proposal');
 const staffById=new Map(staff.map(s=>[s.id,s.display_name]));
 const transferByKey=new Map(transfers.map(t=>[t.shadow_flight_id+':'+t.employee_id,t]));
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
    <div className="ledgerMetric"><span>Einzelflug-Reisevorschläge</span><strong>{ready.length}</strong></div>
    <div className="ledgerMetric"><span>Konfliktfreie Crewpaare</span><strong>{coordinatedReady.length}</strong></div>
    <div className="ledgerMetric"><span>Virtuelle Transferaufträge</span><strong>{transfers.length}</strong></div>
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
   <section className="workspacePanel" aria-label="Übergreifende Crew-Dispositionsvorschläge">
    <div className="panelHeading"><h2>Koordinierte Crewvorschläge</h2>
     <span>{coordinatedReady.length} von {coordinated.length} Flugentwürfen mit vorläufigem Crew-Paar</span></div>
    <p className="panelNote">Die neue übergreifende Planung vergleicht alle künftigen SIM-Flüge,
     respektiert bereits gespeicherte PIC-/SIC-Zuweisungen und vermeidet zeitliche sowie
     geografische Konflikte. Ein späterer Einsatz derselben Crew ist nur mit passendem
     Ziel-/Ausgangsflugplatz und konservativem Ruhepuffer als <strong>Szenario</strong> zulässig.
     Sie optimiert in Abflugreihenfolge nach hinterlegten Reisekosten; das ist keine
     global optimale Dienstplanung und ersetzt keine Lizenz- oder Ruhezeitfreigabe.</p>
    {coordinated.length===0?<p className="emptyState">Noch kein vollständiger,
     zukünftiger SIM-Flugentwurf für die gemeinsame Crewprüfung vorhanden.</p>:
     <div className="tableScroll"><table className="dataTable">
      <thead><tr><th>Flug / Route</th><th>Abflug</th><th>PIC (Vorschlag)</th>
       <th>SIC (Vorschlag)</th><th>Modellkosten</th><th>Prüfstatus</th></tr></thead>
      <tbody>{coordinated.map(item=><tr key={item.flightId}>
       <td>{item.from} → {item.to}<br/>
        <small>{flights.find(f=>f.id===item.flightId)?.registration_snapshot??'SIM-Flug'}</small></td>
       <td>{when(item.departureAt)}</td>
       <td>{item.pic?.name??'—'}</td><td>{item.sic?.name??'—'}</td>
       <td>{item.costEur===null?'—':eur(item.costEur)}</td>
       <td>{item.status==='proposal'?
        'Vorschlag · '+(item.lockedSeats?'bestehende Sitze berücksichtigt':'keine Zuweisung gespeichert'):
        dispatchIssues[item.reason??'']??issues[item.reason??'']??item.reason??'Gesperrt'}</td>
      </tr>)}</tbody>
     </table></div>}
    <p className="scenarioNotice">Kein automatisches Crewing oder Ticketkauf:
     die Ergebnisse bleiben lesende Vorschläge. Verbindliche virtuelle
     Zuweisungen erfolgen weiterhin nur in <Link href="/shadow-crew">Virtual Crew Control</Link>
     und virtuelle Reiseaufträge nur nach Bestätigung.</p>
   </section>
   <div className="sectionHeader"><div><h2>Automatische PIC-/SIC-Positionierung</h2>
    <p>Einzelprüfung pro Flug. Erst die koordinierte Übersicht darüber berücksichtigt konkurrierende Charter-Szenarien. Kein Auftrag wird dadurch angenommen.</p></div>
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
         </li>)}</ol>:<p>{p.locationEvidence==='ground'?
          'Bereits am Einsatzort durch abgeschlossenen virtuellen Crewtransfer. Keine neue Anreise erforderlich.':
          'Kein Transfer nötig, Crew bereits am Einsatzort.'}</p>}
         {p.steps?.length?(()=>{
          const assigned=assignments.some(a=>a.shadow_flight_id===plan.flightId&&a.employee_id===p.id&&a.crew_role===p.role);
          const prior=transferByKey.get(plan.flightId+':'+p.id);
          if(prior)return <p className="scenarioNotice">Virtueller Reiseauftrag: {prior.state}</p>;
          if(!assigned)return <p className="panelNote">Vor einer simulierten Transferbuchung unter Virtual Crew Control dem Flug zuweisen.</p>;
          return <form action={scheduleShadowCrewTransfer} className="crewTravelOrder">
           <input type="hidden" name="flight_id" value={plan.flightId}/>
           <input type="hidden" name="employee_id" value={p.id}/>
           <input type="hidden" name="from_icao" value={p.fromIcao}/>
           <input type="hidden" name="to_icao" value={p.toIcao}/>
           <input type="hidden" name="starts_at" value={p.startsAt}/>
           <input type="hidden" name="ends_at" value={p.steps[p.steps.length-1].endsAt}/>
           <input type="hidden" name="report_at" value={p.reportAt}/>
           <input type="hidden" name="cost_eur" value={p.costEur}/>
           <input type="hidden" name="itinerary" value={JSON.stringify(p.steps)}/>
           <button className="signoutButton" type="submit">Virtuellen Transfer einplanen</button>
          </form>;
         })():null}
        </div>)}
        <p className="crewTravelTotal">Gesamte simulierte Reisekosten: <strong>{eur(plan.estimatedCostEur??0)}</strong></p>
       </div>:
       <p className="scenarioNotice">{issues[plan.issue??'']??plan.issue??'Keine passende Crew verfügbar.'}
        {plan.issues?.length?(' · Weitere Gründe: '+[...new Set(plan.issues)].map(i=>issues[i]??i).join('; ')):''}</p>}
      <p className="panelNote">Reiseaufträge werden ausschließlich nach ausdrücklicher Bestätigung
       innerhalb der Simulation aktiviert. Der 5-Minuten-Simulationslauf verarbeitet dann
       Abflug und Ankunft; alle Kosten bleiben fiktiv, Crewqualifikationen ungeprüft.</p>
     </article>;
    })}</div>}
   <div className="sectionHeader"><div><h2>Virtuelle Reiseaufträge und Modellkosten</h2>
    <p>Automatischer Statuswechsel durch den Simulationsdienst; keine echte Hotel- oder Ticketbuchung.</p>
   </div><span>{transfers.length} Reiseaufträge</span></div>
   {transfers.length===0?<p className="emptyState">Noch kein Transfer bestätigt. Die Katalogoptionen sind Vorschläge und buchen nichts automatisch.</p>:
    <div className="workspacePanel"><div className="tableScroll"><table className="dataTable">
     <thead><tr><th>Crew</th><th>Virtuelle Route</th><th>Abfahrt</th><th>Ankunft</th><th>Status</th><th>Modellkosten</th></tr></thead>
     <tbody>{transfers.map(t=><tr key={t.id}>
      <td>{staffById.get(t.employee_id)??'Personalakte'}</td>
      <td>{t.from_icao} → {t.to_icao}</td>
      <td>{when(t.starts_at)}</td><td>{when(t.ends_at)}</td>
      <td title={t.state_reason}>{t.state}</td>
      <td>{eur(Number(t.estimated_cost_eur))}
       {expenses.some(x=>x.transfer_id===t.id)?' · simuliert gebucht':' · vorgemerkt'}</td>
     </tr>)}</tbody></table></div></div>}
   <p className="panelNote">Als Aufwand in der fiktiven Simulation gilt eine Reise erst nach
    protokollierter Ankunft. Es wird kein reales Geld bewegt.</p>
  </>}
 </OpsShell>;
}
