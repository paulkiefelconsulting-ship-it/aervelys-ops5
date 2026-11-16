import Link from 'next/link';
import OpsShell from '../../components/ops-shell';
import {requireWorkspace} from '../../lib/workspace';

export const dynamic='force-dynamic';

type Task={
 id:string;source_sales_case_id:string;agent_role:string;state:string;
 revision:number;observed_sales_stage:string|null;next_run_at:string;
 updated_at:string;last_decision_at:string|null;
};
type Event={
 id:string;task_id:string;sequence_no:number;event_key:string;
 actor:string;body:string;occurred_at:string;
 simulation_only:boolean;external_delivery:boolean;
};
type Sale={id:string;persona_id:string;request_id:string};
type Persona={id:string;display_name:string};
type Request={id:string;departure_icao:string;arrival_icao:string};
const displayDate=(date:string)=>new Date(date).toLocaleString('de-DE',{
 timeZone:'Europe/Berlin',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'
})+' Uhr';
const labels:Record<string,string>={
 queued:'Neu',waiting_sales:'Wartet auf Vertrieb',
 awaiting_ops_evidence:'OPS-Nachweise ausstehend',
 closed_declined:'Nach Kundenabsage abgeschlossen'
};

export default async function AgentControlPage(){
 const {supabase,organization}=await requireWorkspace();
 const [taskResult,eventResult]=await Promise.all([
  supabase.from('agent_runtime_tasks')
   .select('id,source_sales_case_id,agent_role,state,revision,observed_sales_stage,next_run_at,updated_at,last_decision_at')
   .eq('organization_id',organization.id).order('updated_at',{ascending:false}).limit(100),
  supabase.from('agent_runtime_events')
   .select('id,task_id,sequence_no,event_key,actor,body,occurred_at,simulation_only,external_delivery')
   .eq('organization_id',organization.id).order('occurred_at',{ascending:false}).limit(100)
 ]);
 const tasks=(taskResult.data??[]) as Task[];
 const events=(eventResult.data??[]) as Event[];
 const salesIds=[...new Set(tasks.map(t=>t.source_sales_case_id))];
 const salesResult=salesIds.length?await supabase.from('sim_sales_cases')
  .select('id,persona_id,request_id').eq('organization_id',organization.id)
  .in('id',salesIds):null;
 const sales=(salesResult?.data??[]) as Sale[];
 const personaIds=[...new Set(sales.map(s=>s.persona_id))];
 const requestIds=[...new Set(sales.map(s=>s.request_id))];
 const [personaResult,requestResult]=await Promise.all([
  personaIds.length?supabase.from('sim_crm_personas').select('id,display_name')
   .eq('organization_id',organization.id).in('id',personaIds):null,
  requestIds.length?supabase.from('charter_requests')
   .select('id,departure_icao,arrival_icao').eq('organization_id',organization.id)
   .in('id',requestIds):null
 ]);
 const personas=new Map(((personaResult?.data??[]) as Persona[]).map(p=>[p.id,p]));
 const requests=new Map(((requestResult?.data??[]) as Request[]).map(r=>[r.id,r]));
 const caseById=new Map(sales.map(s=>[s.id,s]));
 const failed=Boolean(taskResult.error||eventResult.error||salesResult?.error||
  personaResult?.error||requestResult?.error);
 const counts={ops:tasks.filter(t=>t.state==='awaiting_ops_evidence').length,
  waiting:tasks.filter(t=>t.state==='waiting_sales').length,
  closed:tasks.filter(t=>t.state==='closed_declined').length};
 return <OpsShell active="agent-control">
  <header className="header"><div>
   <span className="eyebrow">AERVELYS · EIGENE AGENTEN · SIMULATION ONLY</span>
   <h1>Agent Control</h1>
   <p>Gespeicherte autonome Entscheidungen und Aufgaben aus dem aktuellen Unternehmensbestand.</p>
  </div><span className="state">● Datenbank-Worker: 10-Minuten-Plan</span></header>
  <section className="hero">
   <span className="eyebrow">PERSISTENTE OPS-LIAISON · V1</span>
   <h2>Eigene Agentensteuerung ohne KI-API</h2>
   <p>Der regelbasierte Agent beobachtet fiktive Sales-Fälle und dokumentiert,
    ob ein Kunde abgesagt hat oder ob Operations weitere Nachweise benötigt.
    Der bestehende Sales-Autopilot bleibt zuständig für Kundengespräche;
    dieser Agent schreibt weder dort hinein noch erteilt er Flugfreigaben.</p>
   <div className="meta"><span>Keine externe Sprach-KI</span>
    <span>Keine Kundenkontaktaufnahme</span>
    <span>Keine Charterbuchung</span></div>
  </section>
  {failed&&<p className="emptyState" role="alert">Ein Teil der Agenten-Daten ist nicht vollständig lesbar. Bitte Datenbankfreigaben überprüfen.</p>}
  <section className="kpiGrid" aria-label="Agentenfortschritt">
   <div className="kpi"><span>Erfasste Agentenfälle</span><strong>{taskResult.error?'—':tasks.length}</strong></div>
   <div className="kpi"><span>OPS-Nachweise ausstehend</span><strong>{taskResult.error?'—':counts.ops}</strong></div>
   <div className="kpi"><span>Sales-Bearbeitung offen</span><strong>{taskResult.error?'—':counts.waiting}</strong></div>
   <div className="kpi"><span>Abgeschlossen / abgelehnt</span><strong>{taskResult.error?'—':counts.closed}</strong></div>
   <div className="kpi"><span>Agentenereignisse</span><strong>{eventResult.error?'—':events.length}</strong></div>
  </section>
  <div className="sectionHeader"><div><h2>Aktuelle Agentenaufgaben</h2>
   <p>Keine automatische operative Freigabe. Alle Fälle stammen aus der bestehenden Simulation.</p></div>
   <span>{tasks.length} angezeigt</span></div>
  <div className="tableScroll"><table className="dataTable">
   <thead><tr><th>Kunde / Flug</th><th>Agent</th><th>Bearbeitungsstand</th><th>Letzte Entscheidung</th></tr></thead>
   <tbody>
    {tasks.map(task=>{
     const sale=caseById.get(task.source_sales_case_id);
     const customer=sale?personas.get(sale.persona_id):null;
     const request=sale?requests.get(sale.request_id):null;
     return <tr key={task.id}>
      <td><strong>{customer?.display_name??'Virtueller Kunde'}</strong>
       <div>{request?request.departure_icao+' → '+request.arrival_icao:'Route nicht verfügbar'}</div></td>
      <td>OPS Liaison</td>
      <td>{labels[task.state]??task.state}</td>
      <td>{task.last_decision_at?displayDate(task.last_decision_at):'Noch keine'}</td>
     </tr>;
    })}
   </tbody></table>
   {!failed&&!tasks.length&&<p className="emptyState">Noch keine Agentenaufgaben. Der geplante Hintergrundlauf verarbeitet fiktive Vertriebsfälle.</p>}
  </div>
  <div className="sectionHeader"><div><h2>Nachvollziehbare Entscheidungen</h2>
   <p>Revisionsnummern und Zeitstempel aus dem serverseitigen Ereignisjournal.</p></div>
   <span>{events.length} angezeigt</span></div>
  <div style={{display:'grid',gap:12}}>
   {events.map(event=><div className="workspacePanel" key={event.id}>
    <div className="panelHeading"><h2>{event.event_key}</h2>
     <span>{displayDate(event.occurred_at)}</span></div>
    <p>{event.body}</p>
    <p className="panelNote">Agent: {event.actor} · Revision {event.sequence_no}
     {' · '}{event.simulation_only?'Simulation':'Nicht als Simulation gekennzeichnet'}
     {' · '}{event.external_delivery?'Externe Zustellung':'Keine externe Zustellung'}</p>
   </div>)}
  </div>
  {(tasks.length>=100||events.length>=100)&&<p className="scenarioNotice">
   Es werden höchstens 100 Einträge je Bereich angezeigt. Die vollständige Historie bleibt in der Datenbank.
  </p>}
  <div className="commandLinks">
   <Link href="/agent-lab">Agenten-Engine testen →</Link>
   <Link href="/sales-autopilot">Bestehenden Vertrieb ansehen →</Link>
   <Link href="/dispatch">Operations-Sperren prüfen →</Link>
  </div>
 </OpsShell>;
}
