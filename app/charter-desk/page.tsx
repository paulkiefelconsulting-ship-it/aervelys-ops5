import Link from 'next/link';
import OpsShell from '../../components/ops-shell';
import {requireWorkspace} from '../../lib/workspace';
import {screenAircraftForCharter} from '../../lib/aircraft-screening.mjs';
import './charter-desk.css';

export const dynamic='force-dynamic';
type Charter={id:string;departure_icao:string;arrival_icao:string;departure_at:string;passengers:number;status:string;origin:string;created_at:string};
type Sale={id:string;request_id:string;persona_id:string;stage:string;quoted_eur:number|string|null;customer_bid_eur:number|string|null;model_cost_eur:number|string|null;last_step_at:string};
type Customer={id:string;display_name:string;segment:string};
type Review={id:string;request_id:string;candidate_registration:string|null;blocker_code:string;blocker_detail:string;evaluated_at:string};
type Task={source_sales_case_id:string;state:string;updated_at:string};
type Dialogue={case_id:string;speaker:string;body:string;created_at:string;step:number};
type Aircraft={id:string;registration:string;aircraft_type:string;current_icao:string|null;operational_status:string};
type Reservation={aircraft_id:string;starts_at:string;ends_at:string;state:string};
type Screening={id:string;registration:string;type:string;currentIcao:string|null;status:'blocked'|'review';issues:Array<{code:string;label:string;kind:string}>};
type CrewRun={id:string;screening_day:string;candidate_aircraft_id:string|null;proposed_start_at:string|null;proposed_end_at:string|null;status:string;reason:string;created_at:string};
type CrewCheck={id:string;employee_id:string;crew_role:string;aircraft_type:string;status:string;blocking_reasons:string[];rating_verified:boolean;medical_verified:boolean;operator_checks_verified:boolean;duty_roster_verified:boolean;location_verified:boolean;overlap_conflict:boolean;leave_conflict:boolean};
type CrewEmployee={id:string;display_name:string};
const stageLabel:Record<string,string>={
 awaiting_model_price:'Preisprüfung',indicative_quote:'Angebot vorbereitet',
 counter_offer:'In Verhandlung',interested_pending_ops:'Interesse · OPS offen',
 declined:'Abgesagt',declined_pricing:'Preislich abgelehnt'
};
const opsLabel:Record<string,string>={
 NO_AIRCRAFT:'Kein Flugzeug',AIRCRAFT_INACTIVE:'Flugzeug inaktiv',
 POSITION_UNVERIFIED:'Position ungeprüft',NO_TYPE_ROLE_PAIR:'Crewprofil fehlt',
 COMPLIANCE_CHECKS_NOT_IMPLEMENTED:'Prüfungen unvollständig'
};
const date=(v:string)=>new Date(v).toLocaleString('de-DE',{timeZone:'Europe/Berlin',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
const eur=(v:number|string|null)=>v===null?'—':new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR'}).format(Number(v));
export default async function CharterDesk({searchParams}:{searchParams:Promise<{case?:string}>}){
 const {supabase,organization}=await requireWorkspace();
 const {case:requested}=await searchParams;
 const org=organization.id;
 const [requestsResult,salesResult,personsResult,reviewsResult,tasksResult,fleetResult,holdsResult]=await Promise.all([
  supabase.from('charter_requests').select('id,departure_icao,arrival_icao,departure_at,passengers,status,origin,created_at')
   .eq('organization_id',org).order('created_at',{ascending:false}).limit(60),
  supabase.from('sim_sales_cases').select('id,request_id,persona_id,stage,quoted_eur,customer_bid_eur,model_cost_eur,last_step_at')
   .eq('organization_id',org).order('last_step_at',{ascending:false}).limit(150),
  supabase.from('sim_crm_personas').select('id,display_name,segment')
   .eq('organization_id',org).limit(200),
  supabase.from('charter_assessments').select('id,request_id,candidate_registration,blocker_code,blocker_detail,evaluated_at')
   .eq('organization_id',org).order('evaluated_at',{ascending:false}).limit(150),
  supabase.from('agent_runtime_tasks').select('source_sales_case_id,state,updated_at')
   .eq('organization_id',org).order('updated_at',{ascending:false}).limit(150),
  supabase.from('aircraft').select('id,registration,aircraft_type,current_icao,operational_status')
   .eq('organization_id',org).order('registration').limit(100),
  supabase.from('resource_reservations').select('aircraft_id,starts_at,ends_at,state')
   .eq('organization_id',org).order('starts_at',{ascending:false}).limit(500)
 ]);
 const failed=Boolean(requestsResult.error||salesResult.error||personsResult.error||reviewsResult.error||tasksResult.error||fleetResult.error||holdsResult.error);
 const requests=(requestsResult.data??[]) as Charter[];
 const sales=(salesResult.data??[]) as Sale[];
 const persons=(personsResult.data??[]) as Customer[];
 const reviews=(reviewsResult.data??[]) as Review[];
 const tasks=(tasksResult.data??[]) as Task[];
 const fleet=(fleetResult.data??[]) as Aircraft[];
 const reservations=(holdsResult.data??[]) as Reservation[];
 const salesByRequest=new Map<string,Sale>();
 for(const s of sales)if(!salesByRequest.has(s.request_id))salesByRequest.set(s.request_id,s);
 const personById=new Map(persons.map(p=>[p.id,p]));
 const reviewByRequest=new Map<string,Review>();
 for(const r of reviews)if(!reviewByRequest.has(r.request_id))reviewByRequest.set(r.request_id,r);
 const taskBySale=new Map<string,Task>();
 for(const task of tasks)if(!taskBySale.has(task.source_sales_case_id))taskBySale.set(task.source_sales_case_id,task);
 // Only allow the chosen case from the user's own organization-scoped result set.
 const selected=requests.find(r=>r.id===requested)??requests[0];
 const selectedSale=selected?salesByRequest.get(selected.id):undefined;
 const selectedReview=selected?reviewByRequest.get(selected.id):undefined;
 const selectedCustomer=selectedSale?personById.get(selectedSale.persona_id):undefined;
 const selectedTask=selectedSale?taskBySale.get(selectedSale.id):undefined;
 const screeningComplete=!fleetResult.error&&!holdsResult.error&&fleet.length<100&&reservations.length<500;
 const candidates=(selected?screenAircraftForCharter({request:selected,aircraft:fleet,reservations,dataComplete:screeningComplete}):[]) as Screening[];
 // Crew evidence is a persisted snapshot, not a fresh duty or license approval.
 const crewRunResult=selected?await supabase.from('crew_screening_runs')
  .select('id,screening_day,candidate_aircraft_id,proposed_start_at,proposed_end_at,status,reason,created_at')
  .eq('organization_id',org).eq('request_id',selected.id)
  .order('created_at',{ascending:false}).limit(1):null;
 const crewRun=((crewRunResult?.data??[]) as CrewRun[])[0];
 const crewChecksResult=crewRun?await supabase.from('crew_screening_checks')
  .select('id,employee_id,crew_role,aircraft_type,status,blocking_reasons,rating_verified,medical_verified,operator_checks_verified,duty_roster_verified,location_verified,overlap_conflict,leave_conflict')
  .eq('organization_id',org).eq('screening_id',crewRun.id).limit(150):null;
 const crewChecks=(crewChecksResult?.data??[]) as CrewCheck[];
 const employeeIds=[...new Set(crewChecks.map(c=>c.employee_id))];
 const crewNamesResult=employeeIds.length?await supabase.from('employees')
  .select('id,display_name').eq('organization_id',org).in('id',employeeIds).limit(150):null;
 const crewNames=new Map(((crewNamesResult?.data??[]) as CrewEmployee[]).map(p=>[p.id,p.display_name]));
 const crewIncomplete=Boolean(crewRunResult?.error||crewChecksResult?.error||crewNamesResult?.error||
  crewChecks.length===150||employeeIds.length===150);
 const dialogueResult=selectedSale?await supabase.from('sim_sales_messages')
  .select('case_id,speaker,body,created_at,step').eq('organization_id',org)
  .eq('case_id',selectedSale.id).order('step',{ascending:true}).limit(40):null;
 const dialogue=(dialogueResult?.data??[]) as Dialogue[];
 const incomplete=failed||crewIncomplete||Boolean(dialogueResult?.error)||requests.length===60||sales.length===150||reviews.length===150||persons.length===200||tasks.length===150||fleet.length===100||reservations.length===500;
 const withSales=requests.filter(r=>salesByRequest.has(r.id)).length;
 const pending=requests.filter(r=>salesByRequest.get(r.id)?.stage==='interested_pending_ops').length;
 const declined=requests.filter(r=>['declined','declined_pricing'].includes(salesByRequest.get(r.id)?.stage??'')).length;
 return <OpsShell active="charter-desk">
  <header className="header commandHeading"><div><span className="eyebrow">COMMERCIAL / FLIGHT OPERATIONS</span>
   <h1>Charter Desk</h1><p>Eine gemeinsame Ansicht vom fiktiven Charterwunsch bis zur OPS-Prüfung.</p></div>
   <span className="state">● Nur Simulation</span></header>
  <section className="deskMetrics">
   <div><span>Aktuelle Anfragen</span><strong>{requestsResult.error?'—':requests.length+(requests.length===60?'+':'')}</strong></div>
   <div><span>Mit Sales-Fall</span><strong>{failed?'—':withSales}</strong></div>
   <div><span>OPS noch offen</span><strong>{failed?'—':pending}</strong></div>
   <div><span>Abgesagt</span><strong>{failed?'—':declined}</strong></div>
  </section>
  {incomplete&&<p className="deskWarning" role="status">Einige Datensätze sind unvollständig oder auf die jüngsten Einträge begrenzt. Die Zahlen sind eine Ansicht, keine vollständige Unternehmensauswertung.</p>}
  <section className="deskLayout">
   <div className="deskList">
    <div className="deskPanelTitle"><h2>Chartervorgänge</h2><span>Neueste zuerst</span></div>
    {requests.length===0?<p className="commandEmpty">Noch keine Charteranfragen erfasst.</p>:requests.map(r=>{
     const sale=salesByRequest.get(r.id);
     const customer=sale?personById.get(sale.persona_id):undefined;
     const review=reviewByRequest.get(r.id);
     const active=selected?.id===r.id;
     return <Link key={r.id} className={'deskRequest'+(active?' deskRequestSelected':'')}
       href={'/charter-desk?case='+encodeURIComponent(r.id)}>
      <div className="deskRequestTitle"><strong>{r.departure_icao} <span>→</span> {r.arrival_icao}</strong>
       <span className={'deskStage '+(sale?.stage==='interested_pending_ops'?'deskStageOpen':'')}>{sale?stageLabel[sale.stage]??sale.stage:'Anfrage erfasst'}</span></div>
      <div className="deskRequestMeta"><span>{customer?.display_name??(r.origin==='simulation'?'Virtueller Kunde · noch nicht zugeordnet':'Kunde nicht zugeordnet')}</span><span>{date(r.departure_at)} · {r.passengers} PAX</span></div>
      <div className="deskRequestFoot"><span>{sale?'Indikation '+eur(sale.quoted_eur):'Sales noch ohne Fall'}</span><span>{review?'OPS: '+(opsLabel[review.blocker_code]??review.blocker_code):'OPS noch ohne Prüfung'}</span></div>
     </Link>;
    })}
   </div>
   <aside className="deskDetail">
    {selected?<><div className="deskPanelTitle"><h2>Vorgangsakte</h2><span>{selected.origin==='simulation'?'Fiktive Anfrage':'Entwurf'}</span></div>
     <div className="deskDetailHero"><span className="eyebrow">CHARTER REQUEST</span><h3>{selected.departure_icao} <span>→</span> {selected.arrival_icao}</h3>
      <p>{date(selected.departure_at)} Uhr · {selected.passengers} Passagiere</p></div>
     <div className="deskFacts">
      <div><span>Kunde</span><strong>{selectedCustomer?.display_name??'Noch nicht zugeordnet'}</strong></div>
      <div><span>Sales-Status</span><strong>{selectedSale?stageLabel[selectedSale.stage]??selectedSale.stage:'Noch kein Sales-Fall'}</strong></div>
      <div><span>Angebot (unverbindlich)</span><strong>{selectedSale?eur(selectedSale.quoted_eur):'—'}</strong></div>
      <div><span>Gegenangebot</span><strong>{selectedSale?eur(selectedSale.customer_bid_eur):'—'}</strong></div>
      <div><span>Prüfflugzeug</span><strong>{selectedReview?.candidate_registration??'Nicht zugeordnet'}</strong></div>
      <div><span>Agentenstatus</span><strong>{selectedTask?.state??'Kein Agentenfall'}</strong></div>
     </div>
     <div className="deskReview"><strong>OPS / Safety</strong><p>{selectedReview?
      (opsLabel[selectedReview.blocker_code]??selectedReview.blocker_code)+': '+selectedReview.blocker_detail:
      'Keine gesicherte Dispatch-Prüfung für diesen Vorgang vorhanden.'}</p>
      <small>Keine Flugfreigabe, keine Crew-Buchung und keine externe Angebotszustellung.</small></div>
     <div className="deskPanelTitle"><h2>Aircraft Pre-Screen</h2><span>Unverbindliche Vorprüfung</span></div>
     <p className="deskEmpty">Die folgenden Hinweise werden für alle Flugzeuge aus deiner Flotte automatisch gegen den aktuellen Anfrageort und dokumentierte Sperren geprüft. Sie sind keine operative Zuteilung.</p>
     {(fleetResult.error||holdsResult.error)?<p className="deskWarning" role="alert">Flotte oder Reservierungen können nicht vollständig geladen werden. Eine Aircraft-Einschätzung ist derzeit nicht möglich.</p>:
      <div className="deskAircraftGrid">
       {candidates.map(candidate=><article className="deskAircraftCard" key={candidate.id}>
        <div className="deskAircraftHead"><strong>{candidate.registration}</strong><span className={candidate.status==='blocked'?'deskAircraftBlocked':'deskAircraftReview'}>{candidate.status==='blocked'?'Gesperrt':'Prüfung erforderlich'}</span></div>
        <p>{candidate.type} · Position: {candidate.currentIcao??'unbekannt'}</p>
        <ul>{candidate.issues.map(issue=><li key={issue.code}>{issue.label}</li>)}</ul>
       </article>)}
       {!candidates.length&&<p className="deskEmpty">Keine Flugzeuge im Bestand.</p>}
      </div>}
     <p className="deskEmpty">Die Vorprüfung schätzt weder Flugzeit noch Reichweite oder Passagierkapazität. PIC/SIC, Crewruhe, operative Freigaben und Flughafeneignung bleiben offen.</p>
     <section className="deskCrewSection" aria-label="Crew-Screening">
      <div className="deskPanelTitle"><h2>Crew Evidence</h2><span>Kein Crew-Release</span></div>
      <p className="deskEmpty">Gespeicherte PIC-/SIC-Prüfung zum Charterauftrag. Ergebnisse sind eine Momentaufnahme; Musterberechtigung, Medical, Einsatzort und Ruhezeiten müssen zum tatsächlichen Flug neu geprüft werden.</p>
      {crewIncomplete?<p className="deskWarning" role="alert">Crew-Prüfdaten unvollständig oder nicht abrufbar. Keine Crew-Eignung ableitbar.</p>:
       !crewRun?<p className="deskWarning">Für diesen Auftrag liegt noch kein Crew-Screening vor.</p>:<>
        <div className="deskCrewRun">
         <div><span>Prüftag</span><strong>{crewRun.screening_day}</strong></div>
         <div><span>Ergebnis</span><strong>{crewRun.status}</strong></div>
         <div><span>Prüfzeitpunkt</span><strong>{date(crewRun.created_at)}</strong></div>
         <div><span>Prüfgrund</span><strong>{crewRun.reason}</strong></div>
        </div>
        <div className="deskCrewRows">
         {crewChecks.map(check=><article key={check.id} className="deskCrewRow">
          <div className="deskCrewRowTop"><strong>{crewNames.get(check.employee_id)??'Mitarbeiter nicht auflösbar'}</strong>
           <span>{check.crew_role} · {check.aircraft_type}</span></div>
          <p>Prüfstatus: {check.status} · Muster: {check.rating_verified?'Verifiziert (Snapshot)':'Nicht verifiziert'} · Medical: {check.medical_verified?'Verifiziert (Snapshot)':'Nicht verifiziert'}</p>
          <p>Operator-Checks: {check.operator_checks_verified?'Verifiziert (Snapshot)':'Offen'} · Roster: {check.duty_roster_verified?'Verifiziert (Snapshot)':'Offen'} · Standort: {check.location_verified?'Verifiziert (Snapshot)':'Offen'}</p>
          {(check.overlap_conflict||check.leave_conflict)&&<p>Konflikte: {check.overlap_conflict?'Dienstüberschneidung ':''}{check.leave_conflict?'Abwesenheit':''}</p>}
          <div className="deskCrewBlockers">{(check.blocking_reasons??[]).map(reason=><span key={reason}>{reason.replaceAll('_',' ')}</span>)}</div>
         </article>)}
         {crewChecks.length===0&&<p className="deskEmpty">Keine geprüften Crewprofile für diesen Auftrag hinterlegt.</p>}
        </div>
       </>}
      <p className="deskEmpty">Diese Prüfung plant keinen Mitarbeiter ein und ändert keine Dienstpläne, Verträge oder Flugfreigaben. <Link href="/crew-scheduling">Alle Crew-Screenings ansehen →</Link></p>
     </section>
     <div className="deskPanelTitle"><h2>Virtuelle Korrespondenz</h2><span>{dialogue.length} Nachrichten</span></div>
     {dialogueResult?.error?<p className="deskEmpty">Nachrichten nicht lesbar.</p>:
      dialogue.length? <div className="deskTimeline">{dialogue.map((d,i)=><article key={d.step+'-'+i}>
       <div><strong>{d.speaker==='customer'?'Fiktiver Kunde':d.speaker==='sales'?'AERVELYS Sales':'Simulation'}</strong><small>{date(d.created_at)}</small></div>
       <p>{d.body}</p></article>)}</div>:
      <p className="deskEmpty">Noch keine simulierten Nachrichten vorhanden.</p>}
     <div className="commandLinks"><Link href="/sales-autopilot">Sales Autopilot →</Link><Link href="/dispatch">Dispatchprüfung →</Link><Link href="/agent-control">Agent Control →</Link></div>
    </>:<p className="deskEmpty">Wähle einen Vorgang aus der Liste.</p>}
   </aside>
  </section>
 </OpsShell>;
}
