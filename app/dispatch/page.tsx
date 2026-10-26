import Link from 'next/link';
import OpsShell from '../../components/ops-shell';
import {requireWorkspace} from '../../lib/workspace';
export const dynamic='force-dynamic';

type Assessment={
 id:string;request_id:string;candidate_registration:string|null;
 candidate_aircraft_type:string|null;candidate_operational_status:string|null;
 candidate_location_icao:string|null;candidate_homebase_icao:string|null;
 pic_type_profiles:number;sic_type_profiles:number;
 review_status:string;blocker_code:string;blocker_detail:string;
 evaluated_at:string;
};
type Demand={id:string;departure_icao:string;arrival_icao:string;passengers:number;departure_at:string;origin:string};
const blockerLabels:Record<string,string>={
 NO_AIRCRAFT:'Kein Flugzeug in der Organisation',
 AIRCRAFT_INACTIVE:'Flugzeug nicht einsatzbereit',
 POSITION_UNVERIFIED:'Aktuelle Position nicht bestätigt',
 NO_TYPE_ROLE_PAIR:'PIC/SIC-Musterprofile nicht ausreichend',
 COMPLIANCE_CHECKS_NOT_IMPLEMENTED:'Sicherheitsprüfungen noch unvollständig'
};
export default async function DispatchPage(){
 const {supabase,organization}=await requireWorkspace();
 const [evals,requests]=await Promise.all([
  supabase.from('charter_assessments').select('*')
   .eq('organization_id',organization.id).order('evaluated_at',{ascending:false}).limit(40),
  supabase.from('charter_requests')
   .select('id,departure_icao,arrival_icao,passengers,departure_at,origin')
   .eq('organization_id',organization.id).order('created_at',{ascending:false}).limit(100)
 ]);
 const byId=new Map(((requests.data??[]) as Demand[]).map(x=>[x.id,x]));
 const items=(evals.data??[]) as Assessment[];
 return <OpsShell active="dispatch">
  <header className="header"><div><span className="eyebrow">OPERATIONS · SCHATTENPRÜFUNG</span>
   <h1>Dispatch Prüfung</h1><p>Automatische Vorprüfung jeder Charteranfrage – ohne operative Zuteilung.</p>
  </div><span className="state">● Keine Flugfreigabe</span></header>
  <section className="moduleBanner"><strong>Regelbasierte Prüfung, keine autonome Flugdisposition</strong>
   <p>Die Software wählt einen möglichen Prüfkandidaten aus der Flotte. PIC/SIC-Zahlen sind nur
    hinterlegte Musterprofile, keine gültigen Lizenzen oder garantierte Verfügbarkeit.
    Flugbetrieb bleibt gesperrt, bis alle Sicherheitskontrollen implementiert und geprüft sind.</p>
  </section>
  <section className="commandLinks"><Link href="/pricing">Kalkulation ansehen →</Link>
   <Link href="/simulation">Marktgenerator ansehen →</Link></section>
  {(evals.error||requests.error)?
   <p className="emptyState" role="alert">Prüfungen konnten nicht geladen werden.</p>:
   items.length===0?<p className="emptyState">Noch keine Charteranfragen bewertet.</p>:
   <section className="assessmentStack">{items.map(a=>{
    const req=byId.get(a.request_id);
    return <article key={a.id} className="workspacePanel">
     <div className="panelHeading"><h2>{req?req.departure_icao+' → '+req.arrival_icao:'Charteranfrage'}</h2>
      <span>GESPERT · {a.blocker_code}</span></div>
     <div className="assessmentDetail">
      <div><span>Prüfkandidat</span><strong>{a.candidate_registration??'Keiner'}</strong></div>
      <div><span>Flugzeugmuster</span><strong>{a.candidate_aircraft_type??'Nicht verfügbar'}</strong></div>
      <div><span>Betriebsstatus</span><strong>{a.candidate_operational_status??'Unbekannt'}</strong></div>
      <div><span>Homebase</span><strong>{a.candidate_homebase_icao??'Unbekannt'}</strong></div>
      <div><span>Standort (verifiziert)</span><strong>{a.candidate_location_icao??'Nicht bekannt'}</strong></div>
      <div><span>PIC/SIC-Musterprofile</span><strong>{a.pic_type_profiles} / {a.sic_type_profiles}</strong></div>
     </div>
     <p className="feedback"><strong>{blockerLabels[a.blocker_code]??'Gesperrt'}.</strong> {a.blocker_detail}</p>
     <p className="panelNote">Keine Crew-Reservierung, keine Aircraft-Positionierung, keine Freigabe.
      {req?.origin==='simulation'?' Anfrage ist synthetisch.':''}</p>
    </article>;
   })}</section>}
 </OpsShell>;
}
