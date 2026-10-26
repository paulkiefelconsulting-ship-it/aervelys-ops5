import Link from 'next/link';
import OpsShell from '../../components/ops-shell';
import {requireWorkspace} from '../../lib/workspace';

export const dynamic='force-dynamic';
type Outcome={id:string;shadow_flight_id:string;completed_at:string;model_revenue_eur:number|string|null;model_cost_eur:number|string|null;model_margin_eur:number|string|null};
type Flight={id:string;registration_snapshot:string;departure_icao:string;arrival_icao:string;departure_at:string;status:string};
type Leg={id:string;from_icao:string;to_icao:string;arrived_at:string|null;fictional_cost_eur:number|string|null};
type Journal={id:string;source_kind:string;shadow_outcome_id:string|null;positioning_leg_id:string|null};
const eur=(v:number|string|null)=>v==null?'Ohne Modellwert':new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR'}).format(Number(v));
const date=(v:string)=>new Date(v).toLocaleString('de-DE',{timeZone:'UTC',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})+' UTC';

export default async function EconomicsPage(){
 const {supabase,organization}=await requireWorkspace();
 const [outcomeResult,legResult,flightResult,journalResult]=await Promise.all([
  supabase.from('shadow_flight_outcomes').select('id,shadow_flight_id,completed_at,model_revenue_eur,model_cost_eur,model_margin_eur')
   .eq('organization_id',organization.id).order('completed_at',{ascending:false}).limit(80),
  supabase.from('shadow_positioning_legs').select('id,from_icao,to_icao,arrived_at,fictional_cost_eur')
   .eq('organization_id',organization.id).eq('status','completed').order('arrived_at',{ascending:false}).limit(80),
  supabase.from('shadow_flights').select('id,registration_snapshot,departure_icao,arrival_icao,departure_at,status')
   .eq('organization_id',organization.id).order('departure_at',{ascending:false}).limit(150),
  supabase.from('sim_journals').select('id,source_kind,shadow_outcome_id,positioning_leg_id')
   .eq('organization_id',organization.id)
   .in('source_kind',['shadow_charter_completion','shadow_positioning_completion'])
   .order('posted_at',{ascending:false}).limit(300)
 ]);
 const outcomes=(outcomeResult.data??[]) as Outcome[];
 const legs=(legResult.data??[]) as Leg[];
 const flights=(flightResult.data??[]) as Flight[];
 const journals=(journalResult.data??[]) as Journal[];
 const flightsById=new Map(flights.map(f=>[f.id,f]));
 const bookedFlights=new Set(journals.map(j=>j.shadow_outcome_id).filter((s):s is string=>s!==null));
 const bookedLegs=new Set(journals.map(j=>j.positioning_leg_id).filter((s):s is string=>s!==null));
 const bookedOutcomes=outcomes.filter(o=>bookedFlights.has(o.id));
 const bookedFerries=legs.filter(l=>bookedLegs.has(l.id));
 const revenue=bookedOutcomes.reduce((v,o)=>v+Number(o.model_revenue_eur??0),0);
 const flightCosts=bookedOutcomes.reduce((v,o)=>v+Number(o.model_cost_eur??0),0);
 const ferryCosts=bookedFerries.reduce((v,l)=>v+Number(l.fictional_cost_eur??0),0);
 const nextFlight=flights.filter(f=>f.status==='planned').sort((a,b)=>Date.parse(a.departure_at)-Date.parse(b.departure_at))[0];
 const error=outcomeResult.error||legResult.error||flightResult.error||journalResult.error;
 return <OpsShell active="economics">
  <header className="header"><div>
   <span className="eyebrow">FINANZEN · AUTONOMER SCHATTENABSCHLUSS</span>
   <h1>Virtuelle Flugwirtschaft</h1>
   <p>Fiktive Erlöse und Kosten, die erst nach abgeschlossenen Was-wäre-wenn-Flügen verbucht werden.</p>
  </div><span className="state">● Ausschließlich Simulation</span></header>
  <section className="moduleBanner"><strong>Keine tatsächliche Forderung und kein Zahlungsverkehr.</strong>
   <p>Nur abgeschlossene virtuelle Charterflüge erhalten fiktive Erlös- und Kostenbuchungen.
   Virtuelle Überführungen erzeugen ausschließlich Modellkosten nach der simulierten Landung.
   Geplante oder blockierte Flüge bleiben ungebucht. Ein unabhängiger Datenbankauftrag verarbeitet
   neue Abschlüsse stündlich um Minute 10; Doppelbuchungen sind gesperrt.</p></section>
  <section className="commandLinks">
   <Link href="/finance-ledger">Soll-/Haben-Journal →</Link>
   <Link href="/flight-simulator">Virtuelle Flugabläufe →</Link>
   <Link href="/positioning">Virtuelle Positionierung →</Link>
  </section>
  {error?<div className="emptyState" role="alert">Die Simulationsabschlüsse konnten nicht vollständig geladen werden.</div>:<>
   <div className="ledgerSummary">
    <div className="ledgerMetric"><span>Gebuchte virtuelle Charters (angezeigt)</span><strong>{bookedOutcomes.length}</strong></div>
    <div className="ledgerMetric"><span>Fiktiver Erlös (gebucht, angezeigt)</span><strong>{eur(revenue)}</strong></div>
    <div className="ledgerMetric"><span>Fiktive Flug- und Positionierungskosten</span><strong>{eur(flightCosts+ferryCosts)}</strong></div>
    <div className="ledgerMetric"><span>Rechnerisches Modell-Flugergebnis</span><strong>{eur(revenue-flightCosts-ferryCosts)}</strong></div>
   </div>
   {(outcomes.length===80||legs.length===80||journals.length===300)&&
    <p className="ledgerWarning">Die Ansicht ist auf die jüngsten Datensätze begrenzt. Ihre Summen sind keine vollständigen historischen Unternehmenszahlen.</p>}
   {nextFlight&&<section className="moduleBanner"><strong>Nächster virtueller Charterentwurf</strong>
    <p>{nextFlight.departure_icao} → {nextFlight.arrival_icao} · {nextFlight.registration_snapshot} ·
    {' '}{date(nextFlight.departure_at)}. Für einen geplanten Flug wird noch kein Modellumsatz gebucht.</p>
   </section>}
   <div className="sectionHeader"><div><h2>Virtuelle Charterabschlüsse</h2>
    <p>Rein hypothetische Erfolgsrechnungen aus abgeschlossenen Flugszenarien.</p>
   </div><span>{outcomes.length} angezeigt</span></div>
   {outcomes.length===0?<p className="emptyState">
    Noch kein virtueller Charterflug abgeschlossen. Es wurden daher noch keine fiktiven Chartererlöse gebucht.</p>:
    <div className="assessmentStack">{outcomes.map(o=>{
     const f=flightsById.get(o.shadow_flight_id);
     return <article className="workspacePanel" key={o.id}>
      <div className="panelHeading"><h2>{f?f.departure_icao+' → '+f.arrival_icao:'Abgeschlossener Shadow-Flug'}</h2>
       <span>{bookedFlights.has(o.id)?'Im Simulations-Ledger gebucht':'Modellbuchung ausstehend'}</span></div>
      <p className="panelNote">{f?.registration_snapshot??'Unbekanntes Flugzeug'} · Virtuelle Ankunft: {date(o.completed_at)}</p>
      <div className="assessmentDetail">
       <div><span>Modellerlös</span><strong>{eur(o.model_revenue_eur)}</strong></div>
       <div><span>Modellkosten</span><strong>{eur(o.model_cost_eur)}</strong></div>
       <div><span>Modellmarge</span><strong>{eur(o.model_margin_eur)}</strong></div>
      </div>
     </article>;
    })}</div>}
   <div className="sectionHeader"><div><h2>Virtuelle Überführungsabschlüsse</h2>
    <p>Nur nach abgeschlossener virtueller Positionierung entstehen fiktive Kostenbuchungen.</p>
   </div><span>{legs.length} angezeigt</span></div>
   {legs.length===0?<p className="emptyState">Noch keine virtuelle Positionierung abgeschlossen.</p>:
    <div className="assessmentStack">{legs.map(l=><article className="workspacePanel" key={l.id}>
     <div className="panelHeading"><h2>{l.from_icao} → {l.to_icao}</h2>
      <span>{bookedLegs.has(l.id)?'Im Simulations-Ledger gebucht':'Modellbuchung ausstehend'}</span></div>
     <p className="panelNote">Virtuelle Ankunft: {l.arrived_at?date(l.arrived_at):'Unbekannt'}</p>
     <div className="assessmentDetail"><div><span>Fiktive Positionierungskosten</span><strong>{eur(l.fictional_cost_eur)}</strong></div></div>
    </article>)}</div>}
  </>}
  <p className="scenarioNotice" style={{marginTop:24}}>
   Alle Beträge sind erfundene Szenariowerte, keine Rechnungen, tatsächlich erzielten Umsätze,
   Banktransaktionen oder realen Verbindlichkeiten. Der operative Flug- und Crew-Einsatz bleibt gesperrt.
  </p>
 </OpsShell>;
}
