import Link from 'next/link';
import OpsShell from '../../components/ops-shell';
import {requireWorkspace} from '../../lib/workspace';

export const dynamic='force-dynamic';
type Eval={
 id:string;request_id:string;illustrative_revenue_eur:number|string|null;
 illustrative_cost_eur:number|string|null;illustrative_margin_eur:number|string|null;
 assumed_block_hours:number|string|null;review_status:string;pricing_model:string;
 blocker_code:string;candidate_registration:string|null;
};
type Request={id:string;departure_icao:string;arrival_icao:string;passengers:number;origin:string};
const euro=(n:number|string|null)=>n==null?'Kein Modellwert':new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR'}).format(Number(n));
export default async function PricingPage(){
 const {supabase,organization}=await requireWorkspace();
 const [evals,requests]=await Promise.all([
  supabase.from('charter_assessments')
   .select('id,request_id,illustrative_revenue_eur,illustrative_cost_eur,illustrative_margin_eur,assumed_block_hours,review_status,pricing_model,blocker_code,candidate_registration')
   .eq('organization_id',organization.id).order('evaluated_at',{ascending:false}).limit(50),
  supabase.from('charter_requests').select('id,departure_icao,arrival_icao,passengers,origin')
   .eq('organization_id',organization.id).order('created_at',{ascending:false}).limit(100)
 ]);
 const byId=new Map(((requests.data??[]) as Request[]).map(x=>[x.id,x]));
 const items=(evals.data??[]) as Eval[];
 return <OpsShell active="pricing">
  <header className="header"><div><span className="eyebrow">COMMERCIAL · SIMULATIONSRECHNUNG</span>
    <h1>Charter Kalkulation</h1>
    <p>Automatisch berechnete Beispielerlöse, Kosten und Margen – kein verbindliches Kundenangebot.</p>
  </div><span className="state">● Fiktive Modellpreise</span></header>
  <section className="moduleBanner"><strong>Rechenmodell: fictional_scenario_v1</strong>
   <p>Basis 1.200 € + 3.200 € je angenommener Blockstunde + 180 € je Passagier.
    Modellkosten: 500 € + 2.100 € je Blockstunde + 85 € je Passagier.
    Blockzeiten sind feste Beispielannahmen für wenige hinterlegte Routen – keine
    validierten Flugleistungen, Marktpreise oder Angebote. Andere Routen bleiben ohne Kalkulation.</p>
  </section>
  <section className="commandLinks"><Link href="/dispatch">Dispatch-Sperren prüfen →</Link>
   <Link href="/modules/sales">Charteranfragen öffnen →</Link></section>
  {(evals.error||requests.error)?<p className="emptyState" role="alert">Kalkulationen konnten nicht geladen werden.</p>:
   items.length===0?<p className="emptyState">Es gibt noch keine kalkulierten Charteranfragen.</p>:
   <section className="assessmentStack">{items.map(x=>{
    const req=byId.get(x.request_id);
    return <article key={x.id} className="workspacePanel">
     <div className="panelHeading"><h2>{req?req.departure_icao+' → '+req.arrival_icao:'Charteranfrage'}</h2>
      <span>Nur Simulation · {x.review_status==='blocked'?'Gesperrt':'Prüfung offen'}</span></div>
     <div className="assessmentDetail">
      <div><span>Fiktiver Modellerlös</span><strong>{euro(x.illustrative_revenue_eur)}</strong></div>
      <div><span>Fiktive Modellkosten</span><strong>{euro(x.illustrative_cost_eur)}</strong></div>
      <div><span>Rechnerische Marge</span><strong>{euro(x.illustrative_margin_eur)}</strong></div>
      <div><span>Angenommene Blockstunden</span><strong>{x.assumed_block_hours??'Unbekannt'}</strong></div>
      <div><span>Prüfkandidat</span><strong>{x.candidate_registration??'Nicht zugeordnet'}</strong></div>
      <div><span>Passagiere</span><strong>{req?.passengers??'—'}</strong></div>
     </div>
     <p className="scenarioNotice">Keine Buchung, Rechnung, Banktransaktion oder Kundenmitteilung.
      {req?.origin==='simulation'?' Synthetische Nachfrage.':''} Sicherheitsblock: {x.blocker_code}.</p>
    </article>;
   })}</section>}
 </OpsShell>;
}
