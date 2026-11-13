import Link from 'next/link';
import OpsShell from '../../components/ops-shell';
import {requireWorkspace} from '../../lib/workspace';
import './sales.css';

export const dynamic='force-dynamic';

type Customer={
 id:string;display_name:string;segment:string;persona_no:number;
};
type Case={
 id:string;request_id:string;persona_id:string;stage:string;
 quoted_eur:number|string|null;model_cost_eur:number|string|null;
 customer_bid_eur:number|string|null;blocker_code:string;
 created_at:string;last_step_at:string;
};
type Request={
 id:string;departure_icao:string;arrival_icao:string;
 departure_at:string;passengers:number;origin:string;
};
type Message={
 id:string;case_id:string;step:number;speaker:string;
 event_key:string;body:string;created_at:string;
};
type Run={
 id:string;ran_at:string;cases_created:number;cases_advanced:number;
};
const stages:Record<string,string>={
 awaiting_model_price:'Preisgrundlage fehlt',
 indicative_quote:'Unverbindliches Angebot vorbereitet',
 counter_offer:'Kunde verhandelt',
 interested_pending_ops:'Interesse · Operations noch gesperrt',
 declined:'Vom Kunden abgelehnt',
 declined_pricing:'Wegen Modellmarge abgelehnt'
};
const segments:Record<string,string>={
 executive:'Executive',leisure:'Privatreise',events:'Veranstaltung',corporate:'Business'
};
const eur=(v:number|string|null)=>v===null?'Nicht kalkuliert':
 new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR'}).format(Number(v));
const date=(v:string)=>new Date(v).toLocaleString('de-DE',{
 timeZone:'Europe/Berlin',day:'2-digit',month:'2-digit',year:'numeric',
 hour:'2-digit',minute:'2-digit'})+' Uhr';

export default async function SalesAutopilotPage(){
 const {supabase,organization}=await requireWorkspace();
 const [casesResult,customerResult,customerCountResult,requestsResult,runsResult]=
  await Promise.all([
   supabase.from('sim_sales_cases')
    .select('id,request_id,persona_id,stage,quoted_eur,model_cost_eur,customer_bid_eur,blocker_code,created_at,last_step_at')
    .eq('organization_id',organization.id).order('created_at',{ascending:false}).limit(100),
   supabase.from('sim_crm_personas')
    .select('id,display_name,segment,persona_no')
    .eq('organization_id',organization.id).order('persona_no').limit(200),
   supabase.from('sim_crm_personas')
    .select('id',{count:'exact',head:true}).eq('organization_id',organization.id),
   supabase.from('charter_requests')
    .select('id,departure_icao,arrival_icao,departure_at,passengers,origin')
    .eq('organization_id',organization.id).eq('origin','simulation')
    .order('created_at',{ascending:false}).limit(100),
   supabase.from('sim_sales_runs')
    .select('id,ran_at,cases_created,cases_advanced')
    .eq('organization_id',organization.id).order('ran_at',{ascending:false}).limit(8)
  ]);
 const cases=(casesResult.data??[]) as Case[];
 const customers=(customerResult.data??[]) as Customer[];
 const requests=(requestsResult.data??[]) as Request[];
 const runs=(runsResult.data??[]) as Run[];
 const ids=cases.map(x=>x.id);
 const messagesResult=ids.length?await supabase.from('sim_sales_messages')
  .select('id,case_id,step,speaker,event_key,body,created_at')
  .eq('organization_id',organization.id).in('case_id',ids)
  .order('created_at',{ascending:false}).limit(300):null;
 const messages=(messagesResult?.data??[]) as Message[];
 const customerById=new Map(customers.map(x=>[x.id,x]));
 const requestById=new Map(requests.map(x=>[x.id,x]));
 const timeline=new Map<string,Message[]>();
 for(const message of messages){
  const thread=timeline.get(message.case_id)||[];
  thread.push(message);timeline.set(message.case_id,thread);
 }
 for(const conversation of timeline.values())conversation.sort((a,b)=>a.step-b.step);
 const incomplete=Boolean(casesResult.error||customerResult.error||
  customerCountResult.error||requestsResult.error||runsResult.error||messagesResult?.error||
  cases.length===100||customers.length===200||requests.length===100||
  messages.length===300);
 const interested=cases.filter(x=>x.stage==='interested_pending_ops').length;
 const negotiating=cases.filter(x=>x.stage==='counter_offer').length;
 const declined=cases.filter(x=>x.stage==='declined'||x.stage==='declined_pricing').length;
 return <OpsShell active="sales-autopilot">
  <header className="header"><div>
   <span className="eyebrow">AERVELYS · AUTONOMOUS COMMERCIAL / SIM-ONLY</span>
   <h1>Virtuelle Kunden & Sales Autopilot</h1>
   <p>Die fiktive Vertriebsabteilung führt Kundendialoge und simulierte Preisverhandlungen selbstständig.</p>
  </div><span className="state">● Alle 30 Minuten · keine Eingabe erforderlich</span></header>
  <section className="hero">
   <span className="eyebrow">AUTONOMER VERTRIEB</span>
   <h2>Vom Charterwunsch zum eigenständigen Kundenkontakt</h2>
   <p>Aus den bestehenden synthetischen Charteranfragen entstehen eindeutig zugeordnete
    virtuelle Kundenfälle. Sales erstellt unverbindliche Kalkulationshinweise, Kunden
    reagieren mit Interesse, Preiswunsch oder Absage und Sales beantwortet Gegenangebote.
    Alles bleibt innerhalb der Simulation. Kein tatsächlicher Kontakt mit Dritten.</p>
   <div className="meta"><span>Nur interne NPC-Dialoge</span>
    <span>Kein echtes Angebot oder Chartervertrag</span>
    <span>Keine Umgehung der Dispatch-Sperren</span></div>
  </section>
  {incomplete?<p className="emptyState" role="alert">Mindestens eine Datenquelle
   ist nicht vollständig lesbar. Fehlende Kunden und Fälle dürfen nicht als
   tatsächliche Abwesenheit bewertet werden.</p>:null}
  <section className="kpiGrid" aria-label="Autonomer Kundenbetrieb">
   <div className="kpi"><span>Fiktive Kundenprofile</span>
    <strong>{customerCountResult.count??'—'}</strong></div>
   <div className="kpi"><span>Virtuelle Sales-Vorgänge</span><strong>{cases.length}</strong></div>
   <div className="kpi"><span>Kundeninteresse / OPS offen</span><strong>{interested}</strong></div>
   <div className="kpi"><span>Preisverhandlungen offen</span><strong>{negotiating}</strong></div>
   <div className="kpi"><span>Simulierte Absagen</span><strong>{declined}</strong></div>
   <div className="kpi"><span>Bestätigte Charterverträge</span><strong>0</strong></div>
  </section>
  <div className="commandLinks">
   <Link href="/simulation">Nachfragegenerator →</Link>
   <Link href="/pricing">Preisprüfung →</Link>
   <Link href="/dispatch">Dispatch-Sperren →</Link>
   <Link href="/crew-mobility">Autonome Crewplanung →</Link>
  </div>
  <div className="sectionHeader"><div>
   <h2>Verkaufsfälle und simulierte Nachrichten</h2>
   <p>Verhandlungsstatus und tatsächlicher Dispatchstatus bleiben getrennte Fakten.</p>
  </div><span>{cases.length} angezeigte Vorgänge</span></div>
  {cases.length===0?<p className="emptyState">Noch kein Sales-Fall angelegt.
   Der Hintergrunddienst prüft vorhandene SIM-Anfragen automatisch.</p>:
   <section className="salesCases">
    {cases.map(item=>{
     const customer=customerById.get(item.persona_id);
     const request=requestById.get(item.request_id);
     const thread=timeline.get(item.id)||[];
     return <article key={item.id} className="workspacePanel salesCase">
      <div className="panelHeading">
       <h2>{customer?.display_name??'Unbekannter virtueller Kunde'}</h2>
       <span className="salesStage">{stages[item.stage]??item.stage}</span>
      </div>
      <p className="panelNote">{customer?segments[customer.segment]??customer.segment:'CRM-Verknüpfung ungeprüft'}
       {' · '}{request?request.departure_icao+' → '+request.arrival_icao:'Route nicht verfügbar'}
       {request?' · '+request.passengers+' Passagiere':''}
       {request?' · '+date(request.departure_at):''}</p>
      <div className="assessmentDetail">
       <div><span>Unverbindliche Preisindikation</span><strong>{eur(item.quoted_eur)}</strong></div>
       <div><span>Modellkosten</span><strong>{eur(item.model_cost_eur)}</strong></div>
       <div><span>Kunden-Gegenangebot</span><strong>{eur(item.customer_bid_eur)}</strong></div>
       <div><span>Dispatchprüfung</span><strong>{item.blocker_code}</strong></div>
      </div>
      {item.blocker_code&&<p className="scenarioNotice">
       Kein verbindlicher Auftrag: Flugzeug, Crew und Flugsicherheit sind weiterhin
       nicht freigegeben. Originaler Prüfgrund: {item.blocker_code}.
      </p>}
      <div className="salesThread" aria-label="Automatisch erzeugter virtueller Kundendialog">
       {thread.map(message=><div key={message.id} className="salesMessage">
        <div className="salesMessageHead"><strong>{
         message.speaker==='customer'?'Fiktiver Kunde':
         message.speaker==='sales'?'AERVELYS Sales':'Simulation'
        }</strong><small>{date(message.created_at)}</small></div>
        <p>{message.body}</p>
       </div>)}
       {thread.length===0&&<p className="panelNote">Dialoghistorie nicht verfügbar.</p>}
      </div>
     </article>;
    })}
   </section>}
  <div className="sectionHeader"><div><h2>Autonome Hintergrundläufe</h2>
   <p>Das System arbeitet auch ohne geöffnete Webseite; keine Formulare erforderlich.</p>
  </div><span>{runs.length} letzte Läufe</span></div>
  <div className="tableScroll"><table className="dataTable">
   <thead><tr><th>Zeitpunkt</th><th>Neu erfasst</th><th>Automatisch bearbeitet</th></tr></thead>
   <tbody>{runs.map(run=><tr key={run.id}><td>{date(run.ran_at)}</td>
    <td>{run.cases_created}</td><td>{run.cases_advanced}</td></tr>)}</tbody>
  </table></div>
  <p className="panelNote">Die jetzigen NPC-Entscheidungen basieren auf reproduzierbaren Regeln,
   nicht auf einer generativen Sprach-KI. Für realistische unterschiedliche Charaktere,
   Reisepräferenzen und längere Verkaufsgespräche folgt ein eigener Agenten-Ausbau.
   Alle finanziellen und operativen Buchungen sind getrennt gesichert.</p>
 </OpsShell>;
}
