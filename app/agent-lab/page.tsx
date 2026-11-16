import Link from 'next/link';
import OpsShell from '../../components/ops-shell';
import {requireWorkspace} from '../../lib/workspace';
import {createCharterCase,advanceCharterCase,AGENT_ENGINE_VERSION} from '../../lib/agent-engine.mjs';

export const dynamic='force-dynamic';
const base='2026-11-16T10:00:00Z';
const at=(minutes:number)=>new Date(Date.parse(base)+minutes*60_000).toISOString();
const examples=[
 {id:'demo-value',name:'Virtueller Geschäftskunde',budgetEur:8500,strategy:'value'},
 {id:'demo-bargain',name:'Preisbewusster Charterkunde',budgetEur:6800,strategy:'bargain'}
] as const;
function demo(example:(typeof examples)[number]){
 let c=createCharterCase({
  id:example.id,createdAt:base,
  request:{from:'EDDB',to:'LIML',departsAt:'2026-11-20T09:00:00Z',passengers:4},
  customer:{id:'customer-'+example.id,displayName:example.name,
   budgetEur:example.budgetEur,strategy:example.strategy}
 });
 for(const step of [
  {minute:0,pricing:null},
  {minute:1,pricing:{estimatedCostEur:5000,suggestedPriceEur:6900}},
  {minute:16,pricing:null},
  {minute:31,pricing:null}
 ])c=advanceCharterCase(c,{now:at(step.minute),pricing:step.pricing}).case;
 return c;
}
const states:Record<string,string>={
 interested_pending_ops:'Kundeninteresse · Operations nicht freigegeben',
 counter_offer:'Gegenangebot',
 declined:'Kundenabsage',
 declined_pricing:'Wirtschaftlich abgelehnt'
};

export default async function AgentLabPage(){
 await requireWorkspace();
 const cases=examples.map(demo);
 return <OpsShell active="agent-lab">
  <header className="header"><div>
   <span className="eyebrow">AERVELYS · EIGENE AGENTEN-ENGINE</span>
   <h1>Agent Lab</h1>
   <p>Nachvollziehbare Entscheidungssimulation ohne Sprachmodell oder externe KI-API.</p>
  </div><span className="state">● Demonstration · keine Live-Aktionen</span></header>
  <section className="hero">
   <span className="eyebrow">ENGINE v{AGENT_ENGINE_VERSION} · ENTWICKLUNGSSTAND</span>
   <h2>Kunden und Vertrieb handeln eigenständig</h2>
   <p>Die folgenden zwei künstlichen Kunden erhalten die gleiche unverbindliche Preisindikation.
    Ihre unterschiedlichen Budgets und Strategien führen zu anderen Entscheidungen.
    Es werden weder Aufträge gebucht noch Nachrichten an reale Personen verschickt.</p>
   <div className="meta">
    <span>0 externe KI-APIs</span><span>0 Buchungen</span>
    <span>Geschützte Testansicht, keine Datenbankänderungen</span>
   </div>
  </section>
  <div className="sectionHeader"><div><h2>Beispielhafte Agentengespräche</h2>
   <p>Fiktiver Zeitverlauf und feste Testdaten; kein Live-Vertriebsstatus.</p></div>
   <span>{cases.length} Testfälle</span></div>
  <div style={{display:'grid',gap:16}}>
   {cases.map(c=><section className="workspacePanel" key={c.id}>
    <div className="panelHeading"><h2>{c.customer.displayName}</h2>
     <span>{states[c.status]??c.status}</span></div>
    <p className="panelNote">EDDB → LIML · 4 Passagiere · nur synthetischer Testflug</p>
    <div className="ledgerSummary">
     <div className="ledgerMetric"><span>Kundenbudget</span><strong>{c.customer.budgetEur.toLocaleString('de-DE')} €</strong></div>
     <div className="ledgerMetric"><span>Preisindikation</span><strong>{c.pricing?.priceEur.toLocaleString('de-DE')??'—'} €</strong></div>
     <div className="ledgerMetric"><span>Dialogereignisse</span><strong>{c.messages.length}</strong></div>
    </div>
    {c.messages.map((msg:{id:string;speaker:string;body:string;occurredAt:string})=>
     <div key={msg.id} style={{padding:'12px 0',borderBottom:'1px solid var(--line, #333)'}}>
      <strong>{msg.speaker==='sales'?'AERVELYS Sales':msg.speaker==='customer'?'Virtueller Kunde':'System'}</strong>
      <small style={{marginLeft:12}}>{new Date(msg.occurredAt).toLocaleTimeString('de-DE',
       {timeZone:'Europe/Berlin',hour:'2-digit',minute:'2-digit'})} Uhr</small>
      <p>{msg.body}</p>
     </div>)}
    <p className="panelNote">Sicherheitsstatus: kein Chartervertrag, keine Crew- oder Flugfreigabe.</p>
   </section>)}
  </div>
  <section className="commandLinks"><Link href="/sales-autopilot">Bestehenden Sales Autopilot ansehen →</Link>
   <Link href="/rotation">Flugplanung und Freigabesperren ansehen →</Link></section>
 </OpsShell>;
}
