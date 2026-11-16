import Link from 'next/link';
import {redirect} from 'next/navigation';
import OpsShell from '../components/ops-shell';
import {isSupabaseConfigured} from '../lib/supabase/config';
import {createClient} from '../lib/supabase/server';

export const dynamic='force-dynamic';
type Request={id:string;departure_icao:string;arrival_icao:string;departure_at:string;passengers:number;status:string|null;origin:string|null};
type Fleet={registration:string;aircraft_type:string;operational_status:string};
type Task={id:string;state:string};
const fmt=(date:string)=>new Date(date).toLocaleString('de-DE',{timeZone:'Europe/Berlin',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
export default async function HomePage(){
 if(!isSupabaseConfigured())redirect('/login?error=setup');
 const supabase=await createClient();
 const {data:auth,error:authError}=await supabase.auth.getUser();
 if(authError||!auth.user)redirect('/login');
 const {data:organization,error:orgError}=await supabase.from('organizations')
  .select('id,name,currency').eq('owner_user_id',auth.user.id).maybeSingle();
 if(!organization||orgError)return <OpsShell active="overview"><div className="emptyState">Kein freigegebener Unternehmenszugang gefunden.</div></OpsShell>;
 const id=organization.id;
 const [fleetResult,requestsResult,agentResult,crewResult]=await Promise.all([
  supabase.from('aircraft').select('registration,aircraft_type,operational_status').eq('organization_id',id).order('registration'),
  supabase.from('charter_requests').select('id,departure_icao,arrival_icao,departure_at,passengers,status,origin')
    .eq('organization_id',id).order('created_at',{ascending:false}).limit(6),
  supabase.from('agent_runtime_tasks').select('id,state').eq('organization_id',id).limit(250),
  supabase.from('employees').select('id',{count:'exact',head:true}).eq('organization_id',id)
 ]);
 const fleet=(fleetResult.data??[]) as Fleet[];
 const requests=(requestsResult.data??[]) as Request[];
 const tasks=(agentResult.data??[]) as Task[];
 const failed=Boolean(fleetResult.error||requestsResult.error||agentResult.error||crewResult.error);
 const opsPending=tasks.filter(t=>t.state==='awaiting_ops_evidence').length;
 const metric=[{label:'Flotte',value:fleetResult.error?'—':String(fleet.length),sub:'Flugzeuge im Register',href:'/fleet'},
  {label:'Charteranfragen',value:requestsResult.error?'—':String(requests.length)+(requests.length===6?'+':''),sub:'Zuletzt erfasste Anfragen',href:'/sales-autopilot'},
  {label:'Crew',value:crewResult.error?'—':String(crewResult.count??0),sub:'Personalakten',href:'/modules/crew'},
  {label:'OPS-Prüfungen',value:agentResult.error?'—':String(opsPending),sub:'Nachweise ausstehend',href:'/agent-control'}];
 return <OpsShell active="overview">
  <header className="header commandHeading"><div><span className="eyebrow">AERVELYS / BUSINESS AVIATION</span>
   <h1>Command Center</h1>
   <p>{organization.name} · Unternehmensübersicht und virtuelle Operations</p></div>
   <span className="state">● Simulationsbetrieb</span></header>
  {failed&&<p className="feedback" role="alert">Ein Teil der aktuellen Kennzahlen ist nicht verfügbar. Bestehende Daten wurden nicht verändert.</p>}
  <section className="commandMetrics" aria-label="Kernkennzahlen">
   {metric.map(m=><Link key={m.label} href={m.href} className="commandMetric">
    <span>{m.label}</span><strong>{m.value}</strong><small>{m.sub}</small></Link>)}
  </section>
  <section className="commandMain">
   <div className="commandPrimary">
    <div className="commandPanel">
     <div className="commandPanelHead"><div><span className="eyebrow">COMMERCIAL</span><h2>Charter Pipeline</h2></div><Link href="/sales-autopilot">Alle Vorgänge ansehen →</Link></div>
     {requestsResult.error?<p className="emptyState">Charterdaten derzeit nicht verfügbar.</p>:
      requests.length===0?<p className="commandEmpty">Noch keine Charteranfragen vorhanden.</p>:
      <div className="commandRequestList">
       {requests.map(r=><div className="commandRequest" key={r.id}>
        <div className="commandRoute"><strong>{r.departure_icao} <span>→</span> {r.arrival_icao}</strong>
         <small>{r.origin==='simulation'?'Fiktiver Kunde':'Anfrage'} · {r.passengers} PAX</small></div>
        <div className="commandRequestSide"><span>{fmt(r.departure_at)}</span><small>{r.status??'Entwurf'}</small></div>
       </div>)}
      </div>}
    </div>
    <div className="commandPanel">
     <div className="commandPanelHead"><div><span className="eyebrow">AIRCRAFT</span><h2>Fleet Snapshot</h2></div><Link href="/fleet">Flotte verwalten →</Link></div>
     <div className="fleetPills">{fleet.map(a=><Link href="/fleet" title={a.aircraft_type} key={a.registration} className="fleetPill">
      <strong>{a.registration}</strong><small>{a.aircraft_type}</small></Link>)}</div>
     <p className="commandNote">Statusangaben beziehen sich auf die Simulation; kein reales Lufttüchtigkeitszeugnis oder operative Flugfreigabe.</p>
    </div>
   </div>
   <aside className="commandAside">
    <div className="commandPanel">
     <span className="eyebrow">WORKFLOW</span><h2>Automatisierter Ablauf</h2>
     <ol className="commandSteps">
      <li><span>01</span><div><strong>Kundenanfrage</strong><small>Virtuelle Geschäftskunden</small></div></li>
      <li><span>02</span><div><strong>Sales & Angebot</strong><small>Kalkulation und interne Simulation</small></div></li>
      <li><span>03</span><div><strong>Operations & Crew</strong><small>Prüfung, keine Flugfreigabe</small></div></li>
      <li><span>04</span><div><strong>Virtueller Flug</strong><small>Simuliertes Flugereignis</small></div></li>
     </ol>
     <Link className="commandAction" href="/agent-control">Agent Control öffnen →</Link>
    </div>
    <div className="commandPanel">
     <span className="eyebrow">QUICK ACCESS</span><h2>Arbeitsbereiche</h2>
     <div className="commandQuick"><Link href="/rotation">Flottenrotation <span>↗</span></Link>
      <Link href="/dispatch">Dispatch <span>↗</span></Link>
      <Link href="/crew-mobility">Crew Planning <span>↗</span></Link>
      <Link href="/finance-ledger">Finance <span>↗</span></Link></div>
    </div>
   </aside>
  </section>
 </OpsShell>;
}
