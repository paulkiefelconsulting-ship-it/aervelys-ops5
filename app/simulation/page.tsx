import Link from 'next/link';
import OpsShell from '../../components/ops-shell';
import {requireWorkspace} from '../../lib/workspace';

export const dynamic = 'force-dynamic';

export default async function SimulationPage(){
 const {supabase,organization}=await requireWorkspace();
 const [runs,demands,clock]=await Promise.all([
  supabase.from('simulation_market_ticks')
   .select('id,simulation_day,status,generated_at,fleet_total,fleet_available,verified_pic,verified_sic,assessment,request_id')
   .eq('organization_id',organization.id).order('simulation_day',{ascending:false}).limit(30),
  supabase.from('charter_requests')
   .select('id,departure_icao,arrival_icao,departure_at,passengers,status')
   .eq('organization_id',organization.id).eq('origin','simulation')
   .order('created_at',{ascending:false}).limit(30),
  supabase.from('simulation_clock').select('mode,sim_now')
   .eq('organization_id',organization.id).maybeSingle()
 ]);
 const requests=new Map((demands.data??[]).map(r=>[r.id,r]));
 return <OpsShell active="simulation">
  <header className="header"><div>
   <span className="eyebrow">AUTONOMER SIMULATIONSKERN · PHASE 1</span>
   <h1>Simulation Engine</h1>
   <p>Automatische Charter-Nachfrage und Sicherheitsprüfung – ohne manuelle Flugerfassung.</p>
  </div><span className="state">● Marktgenerator aktiv</span></header>
  <section className="hero"><span className="eyebrow">TÄGLICH · 05:15 UTC</span>
   <h2>Automatische simulierte Nachfrage</h2>
   <p>Supabase erzeugt jeden Tag eine ausdrücklich synthetische Charteranfrage und prüft den
    Bestand an verfügbaren Flugzeugen und bereits verifizierten PIC/SIC-Berechtigungen.
    Die Ergebnisse werden automatisch gespeichert – auch wenn du nicht angemeldet bist.</p>
   <div className="meta">
    <span>Automatik: aktiv · regelbasiert, keine generative KI</span>
    <span>Flug-Simulationsuhr: {clock.data?.mode??'nicht verfügbar'}</span>
    <span>Operative Freigaben: gesperrt</span>
   </div>
  </section>
  <div className="sectionHeader"><div><h2>Simulierte Markt-Ereignisse</h2>
   <p>Die Prüfung darf keine echten Buchungen, Flugpläne oder Crew-Zuweisungen auslösen.</p></div>
   <span>{runs.data?.length??0} dokumentierte Läufe</span></div>
  {(runs.error||demands.error||clock.error)?
   <div className="emptyState" role="alert">Datenbankzugriff fehlgeschlagen. Zugriffsrichtlinien prüfen.</div>:
   runs.data?.length===0?<div className="emptyState">Noch kein Simulationslauf vorhanden.</div>:
   <div style={{display:'grid',gap:16}}>
    {(runs.data??[]).map(run=>{
     const demand=run.request_id?requests.get(run.request_id):undefined;
     return <article className="workspacePanel" key={run.id}>
      <div className="panelHeading">
       <h2>{demand?demand.departure_icao+' → '+demand.arrival_icao:'Simulationslauf'}</h2>
       <span>{run.simulation_day} · {run.status==='completed'?'Abgeschlossen':'Prüfung läuft'}</span>
      </div>
      <section className="kpiGrid">
       <div className="kpi"><span>Passagiere</span><strong>{demand?.passengers??'—'}</strong></div>
       <div className="kpi"><span>Flugzeuge</span><strong>{run.fleet_total}</strong></div>
       <div className="kpi"><span>Verfügbar</span><strong>{run.fleet_available}</strong></div>
       <div className="kpi"><span>Geprüfte PIC</span><strong>{run.verified_pic}</strong></div>
       <div className="kpi"><span>Geprüfte SIC</span><strong>{run.verified_sic}</strong></div>
      </section>
      <p className="feedback" style={{marginTop:16}}>{run.assessment??'Bewertung ausstehend'}</p>
      {demand&&<p className="panelNote">Rein synthetischer Charter-Entwurf für {new Date(demand.departure_at).toLocaleString('de-DE',{timeZone:'UTC'})} UTC. Keine reale Kundenanfrage oder Buchung.</p>}
     </article>;
    })}
   </div>}
  <section className="commandLinks"><Link href="/flight-simulator">Virtuelle Flugabläufe ansehen →</Link></section>
  <p className="panelNote" style={{marginTop:24}}>
   Noch nicht eingebaut: generative KI-Agenten, echte Crew-/Medical-/Ruhezeitprüfung,
   Flugfreigaben, operative Positionierungen und tatsächliche Charterumsatzbuchungen.
   <Link href="/modules/sales"> Charteranfragen ansehen</Link>.
  </p>
 </OpsShell>;
}
