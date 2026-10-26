import Link from 'next/link';
import OpsShell from '../../components/ops-shell';
import {requireWorkspace} from '../../lib/workspace';

export const dynamic='force-dynamic';

type Flight={
 id:string;registration_snapshot:string;departure_icao:string;arrival_icao:string;
 departure_at:string;arrival_at:string;assumed_block_hours:number|string;
 passengers:number;status:string;model_revenue_eur:number|string|null;
 model_cost_eur:number|string|null;
};
type State={
 aircraft_id:string;registration_snapshot:string;hypothetical_location_icao:string;
 accumulated_hypothetical_hours:number|string;phase:string;active_shadow_flight_id:string|null;
};
type Event={id:string;shadow_flight_id:string;event_type:string;event_at:string;narrative:string};
type Outcome={
 shadow_flight_id:string;model_revenue_eur:number|string|null;
 model_cost_eur:number|string|null;model_margin_eur:number|string|null;
};
const eur=(n:number|string|null)=>n===null?'Nicht kalkuliert':
 new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR'}).format(Number(n));
const utc=(t:string)=>new Date(t).toLocaleString('de-DE',{
 timeZone:'UTC',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})+' UTC';
const phase:Record<string,string>={
 planned:'Virtuell geplant',in_air:'Virtuell im Flug',completed:'Virtuell gelandet',
 blocked_positioning:'Positionskonflikt',blocked_busy:'Virtuelles Flugzeug belegt',
 blocked_maintenance:'Virtuell technisch gesperrt'
};
const eventNames:Record<string,string>={
 created:'Szenario angelegt',departed:'Virtueller Start',arrived:'Virtuelle Landung',
 blocked_positioning:'Positionierung fehlt',blocked_busy:'Virtuelle Doppelbelegung',
 blocked_maintenance:'Wartungsgrenze überschritten'
};

export default async function FlightSimulatorPage(){
 const {supabase,organization}=await requireWorkspace();
 const [flightsResult,statesResult]=await Promise.all([
  supabase.from('shadow_flights')
   .select('id,registration_snapshot,departure_icao,arrival_icao,departure_at,arrival_at,assumed_block_hours,passengers,status,model_revenue_eur,model_cost_eur')
   .eq('organization_id',organization.id).order('departure_at',{ascending:false}).limit(40),
  supabase.from('shadow_aircraft_states')
   .select('aircraft_id,registration_snapshot,hypothetical_location_icao,accumulated_hypothetical_hours,phase,active_shadow_flight_id')
   .eq('organization_id',organization.id).order('registration_snapshot')
 ]);
 const flights=(flightsResult.data??[]) as Flight[];
 const states=(statesResult.data??[]) as State[];
 const ids=flights.map(f=>f.id);
 const [eventsResult,outcomesResult]=await Promise.all([
  ids.length?supabase.from('shadow_flight_events')
   .select('id,shadow_flight_id,event_type,event_at,narrative')
   .eq('organization_id',organization.id).in('shadow_flight_id',ids)
   .order('event_at',{ascending:true}).limit(250):Promise.resolve(null),
  ids.length?supabase.from('shadow_flight_outcomes')
   .select('shadow_flight_id,model_revenue_eur,model_cost_eur,model_margin_eur')
   .eq('organization_id',organization.id).in('shadow_flight_id',ids)
   .limit(40):Promise.resolve(null)
 ]);
 const events=(eventsResult?.data??[]) as Event[];
 const outcomes=new Map(((outcomesResult?.data??[]) as Outcome[]).map(x=>[x.shadow_flight_id,x]));
 const error=flightsResult.error||statesResult.error||eventsResult?.error||outcomesResult?.error;
 return <OpsShell active="flight-simulator">
  <header className="header"><div>
   <span className="eyebrow">AUTONOME SIMULATION · ISOLIERTE SZENARIEN</span>
   <h1>Virtuelle Flugabläufe</h1>
   <p>Aus synthetischer Charter-Nachfrage entstehen automatisch Was-wäre-wenn-Flüge.</p>
  </div><span className="state">● Stündlicher Schattenlauf</span></header>
  <section className="moduleBanner">
   <strong>Keine operative Flugfreigabe und keine echte Flugbewegung.</strong>
   <p>Dieser Bereich ist ein eigenständiges Testuniversum. Die Szenarien verwenden
    angenommene Flugzeiten und einen hypothetischen Ausgangsort je Flugzeug.
    Der reale Flugzeugstandort, die Einsatzberechtigung der Piloten, Flugstunden im
    operativen Stammsatz, Flugpläne und Finanzen werden dadurch nicht verändert.
    Der Ablauf wird serverseitig stündlich verarbeitet, auch ohne offenen Browser.</p>
  </section>
  <section className="commandLinks">
   <Link href="/positioning">Positionierungen und Sperrgründe →</Link>
   <Link href="/maintenance">Technische Simulationsfreigabe →</Link>
   <Link href="/simulation">Automatische Charter-Nachfrage →</Link>
   <Link href="/crew-scheduling">Crew-Sicherheitsprüfung →</Link>
   <Link href="/finance-ledger">Simulationsjournal →</Link>
   <Link href="/economics">Fiktive Flugabschlüsse →</Link>
  </section>
  {error?<div className="emptyState" role="alert">Die hypothetischen Simulationsdaten konnten nicht vollständig geladen werden.</div>:<>
   <section className="workspacePanel" style={{marginBottom:22}}>
    <div className="panelHeading"><h2>Hypothetische Flottenpositionen</h2>
     <span>Getrennt von operativen Standorten</span></div>
    {states.length===0?<p className="emptyState">Noch keine simulierten Flugzeugzustände vorhanden.</p>:
     <div className="tableScroll"><table className="shadowPositionTable">
      <thead><tr><th>Flugzeug</th><th>Virtueller Standort</th><th>Status</th><th>Virtuelle Blockstunden</th></tr></thead>
      <tbody>{states.map(s=><tr key={s.aircraft_id}>
       <td>{s.registration_snapshot}</td>
       <td>{s.hypothetical_location_icao}</td>
       <td>{s.phase==='in_air'?'Virtuell unterwegs':s.phase==='positioning'?'Virtuell in Positionierung':'Virtuell geparkt'}</td>
       <td>{Number(s.accumulated_hypothetical_hours).toFixed(2)} h</td>
      </tr>)}</tbody>
     </table></div>}
   </section>
   <div className="sectionHeader"><div><h2>Flugszenarien</h2>
    <p>Automatische Phasen: geplant, virtuell gestartet, virtuell gelandet oder wegen Konflikt blockiert.</p>
   </div><span>{flights.length} Szenarien angezeigt</span></div>
   {flights.length===0?<p className="emptyState">Noch kein Szenario verfügbar. Der nächste Hintergrundlauf verarbeitet passende synthetische Anfragen.</p>:
    <div className="assessmentStack">{flights.map(f=>{
     const timeline=events.filter(e=>e.shadow_flight_id===f.id);
     const result=outcomes.get(f.id);
     return <article className="workspacePanel" key={f.id}>
      <div className="shadowRoute">
       <div><h2>{f.departure_icao} → {f.arrival_icao}</h2>
        <p>{f.registration_snapshot} · {f.passengers} simulierte Passagiere</p></div>
       <span className="state">{phase[f.status]??'Nur Simulation'}</span>
      </div>
      <div className="shadowMetrics">
       <div className="shadowMetric"><span>Geplanter virtueller Start</span><strong>{utc(f.departure_at)}</strong></div>
       <div className="shadowMetric"><span>Geplante virtuelle Landung</span><strong>{utc(f.arrival_at)}</strong></div>
       <div className="shadowMetric"><span>Angenommene Blockzeit</span><strong>{Number(f.assumed_block_hours).toFixed(2)} h</strong></div>
       <div className="shadowMetric"><span>Modellmarge (nur Szenario)</span>
        <strong>{result?eur(result.model_margin_eur):'Nicht abgeschlossen'}</strong></div>
      </div>
      <div className="shadowEvents">{timeline.map(e=><div className="shadowEvent" key={e.id}>
       <strong>{eventNames[e.event_type]??e.event_type}</strong>
       {utc(e.event_at)}
      </div>)}</div>
      {(f.status==='blocked_positioning'||f.status==='blocked_busy'||f.status==='blocked_maintenance')&&
       <p className="feedback">Szenario nicht durchgeführt:
        {f.status==='blocked_positioning'
         ?' Der hypothetische Standort passt nicht zum Abflugort.'
         :f.status==='blocked_maintenance'
          ?' Die fiktive Wartungsgrenze lässt die geplante Blockzeit nicht zu.'
          :' Das Flugzeug war im virtuellen Szenario bereits belegt.'}</p>}
      {result&&<p className="scenarioNotice">Hypothetischer Erlös {eur(result.model_revenue_eur)},
       Modellkosten {eur(result.model_cost_eur)}, rechnerische Marge {eur(result.model_margin_eur)}.
       Kein realer oder verbuchter Umsatz.</p>}
     </article>;
    })}</div>}
  </>}
  <p className="panelNote" style={{marginTop:24}}>
   Der Einsatz realer Crews bleibt vollständig gesperrt; der Regelsatz zur Crew-Autorisierung,
   Wartungslogik und simulierte Charter-Doppelbuchhaltung werden
   getrennt entwickelt. Das ist noch keine generative KI-Agentensteuerung.
  </p>
 </OpsShell>;
}
