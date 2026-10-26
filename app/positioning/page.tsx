import Link from 'next/link';
import OpsShell from '../../components/ops-shell';
import {requireWorkspace} from '../../lib/workspace';

export const dynamic='force-dynamic';

type Leg={
 id:string;shadow_flight_id:string;aircraft_id:string;from_icao:string;to_icao:string;
 proposed_departure_at:string|null;proposed_arrival_at:string|null;
 departed_at:string|null;arrived_at:string|null;assumed_block_hours:string|number|null;
 fictional_cost_eur:string|number|null;status:string;reason:string;
};
type Event={id:string;leg_id:string;event_type:string;event_at:string;narrative:string};
type Flight={id:string;departure_icao:string;arrival_icao:string;departure_at:string;status:string;registration_snapshot:string};
type State={aircraft_id:string;registration_snapshot:string;hypothetical_location_icao:string;phase:string;accumulated_hypothetical_hours:number|string};
const euro=(n:number|string|null)=>n===null?'Nicht berechnet':
 new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR'}).format(Number(n));
const dateTime=(t:string|null)=>t?new Date(t).toLocaleString('de-DE',{
 timeZone:'UTC',day:'2-digit',month:'2-digit',year:'numeric',
 hour:'2-digit',minute:'2-digit'})+' UTC':'Nicht planbar';
const labels:Record<string,string>={
 planned:'Virtuell geplant',enroute:'Virtuell unterwegs',
 completed:'Virtuell abgeschlossen',blocked_route:'Streckenmodell fehlt',
 blocked_time:'Zeitfenster reicht nicht',blocked_busy:'Doppelbelegung / Positionsänderung'
};
const eventLabels:Record<string,string>={
 planned:'Positionierung angelegt',departed:'Virtueller Start',arrived:'Virtuelle Landung',
 blocked_route:'Fehlendes Streckenmodell',blocked_time:'Zeitfenster blockiert',
 blocked_busy:'Konflikt'
};

export default async function PositioningPage(){
 const {supabase,organization}=await requireWorkspace();
 const [legsResult,flightsResult,statesResult]=await Promise.all([
  supabase.from('shadow_positioning_legs')
   .select('id,shadow_flight_id,aircraft_id,from_icao,to_icao,proposed_departure_at,proposed_arrival_at,departed_at,arrived_at,assumed_block_hours,fictional_cost_eur,status,reason')
   .eq('organization_id',organization.id).order('created_at',{ascending:false}).limit(50),
  supabase.from('shadow_flights')
   .select('id,departure_icao,arrival_icao,departure_at,status,registration_snapshot')
   .eq('organization_id',organization.id).order('departure_at',{ascending:false}).limit(100),
  supabase.from('shadow_aircraft_states')
   .select('aircraft_id,registration_snapshot,hypothetical_location_icao,phase,accumulated_hypothetical_hours')
   .eq('organization_id',organization.id).order('registration_snapshot').limit(100)
 ]);
 const legs=(legsResult.data??[]) as Leg[];
 const ids=legs.map(x=>x.id);
 const eventsResult=ids.length?await supabase.from('shadow_positioning_events')
  .select('id,leg_id,event_type,event_at,narrative')
  .eq('organization_id',organization.id).in('leg_id',ids)
  .order('event_at',{ascending:true}).limit(200):null;
 const events=(eventsResult?.data??[]) as Event[];
 const flights=new Map(((flightsResult.data??[]) as Flight[]).map(f=>[f.id,f]));
 const states=new Map(((statesResult.data??[]) as State[]).map(s=>[s.aircraft_id,s]));
 const error=legsResult.error||flightsResult.error||statesResult.error||eventsResult?.error;
 return <OpsShell active="positioning">
  <header className="header"><div>
   <span className="eyebrow">AUTONOME SIMULATION · WAS-WÄRE-WENN-SZENARIEN</span>
   <h1>Virtuelle Positionierung</h1>
   <p>Die Simulation bringt Flugzeuge zu geplanten Abflugorten – ohne erfundene Standortwechsel.</p>
  </div><span className="state">● Integriert in den stündlichen Simulationslauf</span></header>
  <section className="moduleBanner">
   <strong>Isolierte virtuelle Überführungsflüge – keine echte Flug- oder Personalplanung.</strong>
   <p>Bei einem passenden künftigen Charterflug prüft das System den letzten hypothetischen
   Standort des Flugzeugs, modelliert eine unverbindliche Überführung mit zwei Stunden
   Zeitpuffer und kontrolliert verfügbare Zeitfenster. Wenn das Streckenmodell fehlt,
   Zeit nicht ausreicht oder eine andere Mission kollidiert, wird die Positionierung
   blockiert. Crew-, Wetter- und Wartungsfreigaben sind nicht Bestandteil dieser Simulation.</p>
  </section>
  <section className="commandLinks">
   <Link href="/flight-simulator">Virtuelle Charterflüge →</Link>
   <Link href="/crew-scheduling">Crew-Sicherheitsprüfung →</Link>
   <Link href="/simulation">Automatische Nachfrage →</Link>
   <Link href="/economics">Fiktive Positionierungskosten →</Link>
  </section>
  {error?<p className="emptyState" role="alert">Die Positionierungsdaten konnten nicht vollständig geladen werden.</p>:<>
   <section className="workspacePanel" style={{marginBottom:20}}>
    <div className="panelHeading"><h2>Virtuelle Flugzeugstandorte</h2>
     <span>Keine realen Standorte</span></div>
    <div className="tableScroll"><table className="shadowPositionTable">
     <thead><tr><th>Flugzeug</th><th>Hypothetischer Standort</th><th>Phase</th><th>Virtuelle Gesamtstunden</th></tr></thead>
     <tbody>{Array.from(states.values()).map(s=><tr key={s.aircraft_id}>
      <td>{s.registration_snapshot}</td><td>{s.hypothetical_location_icao}</td>
      <td>{s.phase==='positioning'?'Virtuelle Überführung unterwegs':
       s.phase==='in_air'?'Virtueller Charterflug':'Geparkt'}</td>
      <td>{Number(s.accumulated_hypothetical_hours).toFixed(2)} h</td>
     </tr>)}</tbody>
    </table></div>
   </section>
   <div className="sectionHeader"><div><h2>Positionierungsaufträge</h2>
    <p>Entstehen nur bei Bedarf aus späteren synthetischen Charterszenarien.</p>
   </div><span>{legs.length} Einträge</span></div>
   {legs.length===0?<div className="emptyState">
     Noch keine virtuelle Positionierung nötig. Aktuell beginnt das geplante Charterszenario
     am angenommenen Heimatstandort des Flugzeugs.
    </div>:
    <div className="assessmentStack">{legs.map(leg=>{
     const parent=flights.get(leg.shadow_flight_id);
     const eventRows=events.filter(e=>e.leg_id===leg.id);
     return <article key={leg.id} className="workspacePanel">
      <div className="shadowRoute"><div>
       <h2>{leg.from_icao} → {leg.to_icao}</h2>
       <p>{parent?.registration_snapshot??states.get(leg.aircraft_id)?.registration_snapshot??'Flugzeug'}
        {' '}· Vorlauf für geplanten Charterflug {parent?.departure_icao??leg.to_icao} → {parent?.arrival_icao??'—'}</p>
      </div><span className="state">● {labels[leg.status]??leg.status}</span></div>
      <div className="shadowMetrics">
       <div className="shadowMetric"><span>Virtueller Abflug</span><strong>{dateTime(leg.proposed_departure_at)}</strong></div>
       <div className="shadowMetric"><span>Virtuelle Ankunft</span><strong>{dateTime(leg.proposed_arrival_at)}</strong></div>
       <div className="shadowMetric"><span>Angenommene Flugzeit</span>
        <strong>{leg.assumed_block_hours===null?'Nicht verfügbar':Number(leg.assumed_block_hours).toFixed(2)+' h'}</strong></div>
       <div className="shadowMetric"><span>Fiktive Überführungskosten</span><strong>{euro(leg.fictional_cost_eur)}</strong></div>
      </div>
      <p className="scenarioNotice">{leg.reason} Kosten sind nur Modellwerte und werden weder
       dem Finanz-Ledger belastet noch vom Simulationskonto abgebucht.</p>
      <div className="shadowEvents">{eventRows.map(e=><div key={e.id} className="shadowEvent">
       <strong>{eventLabels[e.event_type]??e.event_type}</strong>{dateTime(e.event_at)}
      </div>)}</div>
     </article>;
    })}</div>}
  </>}
  <p className="panelNote" style={{marginTop:24}}>
   Flugzeugstatus, operativer Standort, Crew-Roster und Bankkonten bleiben unverändert.
   Die Streckenannahmen sind fiktiv und keine Navigation oder Aircraft-Performance-Daten.
  </p>
 </OpsShell>;
}
