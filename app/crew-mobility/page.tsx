import Link from 'next/link';
import OpsShell from '../../components/ops-shell';
import {requireWorkspace} from '../../lib/workspace';
import {planCrewMobility} from '../../lib/crew-mobility-planner.mjs';
import {projectCrewLocations} from '../../lib/crew-location-ledger.mjs';
import './mobility.css';

export const dynamic='force-dynamic';

type Employee={
 id:string;display_name:string;crew_role:string;
 home_base_icao:string|null;employment_status:string;
};
type DutyBlock={
 id:string;employee_id:string;starts_at:string;ends_at:string;
 kind:string;state:string;location_icao:string|null;
};
const zulu=(v:string)=>new Date(v).toLocaleString('de-DE',{
 timeZone:'UTC',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'
})+' UTC';
const dateOnly=(d:Date)=>d.toISOString().slice(0,10);
const validDay=(value:string)=>/^\d{4}-\d{2}-\d{2}$/.test(value)&&
 Number.isFinite(Date.parse(value+'T00:00:00Z'))&&
 dateOnly(new Date(value+'T00:00:00Z'))===value;
const shift=(day:string,n:number)=>dateOnly(new Date(Date.parse(day+'T00:00:00Z')+n*86_400_000));
const codeLabel:Record<string,string>={
 CURRENT_LOCATION_UNVERIFIED:'Aktueller Crewstandort nicht bestätigt',
 DUTY_HISTORY_OR_REST_RULE_UNVERIFIED:'Lückenlose Diensthistorie und Ruhezeitregel fehlen',
 TRAVEL_ORIGIN_UNKNOWN:'Startort der Anreise fehlt',
 TRANSFER_ROUTE_UNVERIFIED:'Transferstrecke oder Dauer nicht verifiziert',
 TRANSFER_TIME_OR_REST_INSUFFICIENT:'Transfer oder Ruhezeit passt nicht',
 REST_BEFORE_POSITIONING_UNVERIFIED:'Ruhezeit vor Positionierung ungeprüft',
 DUTY_AIRPORT_UNKNOWN:'Einsatzort oder Zielort fehlt',
 DUTY_TIME_INVALID:'Ungültiges Dienstzeitfenster',
 DUTY_OVERLAP:'Dienste überschneiden sich',
 ABSENCE_OR_REST_OVERLAP:'Konflikt mit Abwesenheit oder Ruheblock',
 HOTEL_RATE_OR_AVAILABILITY_UNVERIFIED:'Hotelpreis oder Verfügbarkeit ungeprüft',
 DUTY_KIND_UNKNOWN:'Diensttyp nicht abbildbar'
};
const confirmed=(status:string)=>['confirmed','active','operational','locked'].includes(status);
const pilot=(role:string)=>['PIC','SIC'].includes(role);

export default async function CrewMobilityPage({searchParams}:{searchParams:Promise<{date?:string;weeks?:string}>}){
 const q=await searchParams;
 const day=validDay(q.date??'')?q.date!:dateOnly(new Date());
 const weeks=[2,4,8,12].includes(Number(q.weeks))?Number(q.weeks):4;
 const days=weeks*7;
 const from=new Date(day+'T00:00:00Z').toISOString();
 const until=new Date(Date.parse(from)+days*86_400_000).toISOString();
 const {supabase,organization}=await requireWorkspace();
 const [peopleResult,blocksResult,evidenceResult]=await Promise.all([
  supabase.from('employees')
   .select('id,display_name,crew_role,home_base_icao,employment_status')
   .eq('organization_id',organization.id).order('display_name').limit(150),
  supabase.from('crew_duty_blocks')
   .select('id,employee_id,starts_at,ends_at,kind,state,location_icao')
   .eq('organization_id',organization.id).lt('starts_at',until).gt('ends_at',from)
   .order('starts_at').limit(500),
  supabase.from('crew_location_events')
   .select('id,employee_id,event_type,origin_icao,location_icao,departed_at,occurred_at,recorded_at,verification_state,verified_at,source_reference')
   .eq('organization_id',organization.id).lte('occurred_at',new Date().toISOString())
   .order('occurred_at',{ascending:false}).limit(1000)
 ]);
 const failed=peopleResult.error||blocksResult.error||evidenceResult.error;
 const staff=((peopleResult.data??[]) as Employee[]).filter(p=>pilot(p.crew_role));
 const blocks=(blocksResult.data??[]) as DutyBlock[];
 const byId=new Map(staff.map(x=>[x.id,x]));
 const known=blocks.filter(b=>byId.has(b.employee_id));
 const evidence=(evidenceResult.data??[]) as Array<{
  id:string;employee_id:string;event_type:string;origin_icao:string|null;
  location_icao:string|null;departed_at:string|null;occurred_at:string;
  recorded_at:string;verification_state:string;verified_at:string|null;
  source_reference:string;
 }>;
 const evidenceTruncated=evidence.length===1000;
 const places=projectCrewLocations({
  people:staff.map(p=>({id:p.id,name:p.display_name,role:p.crew_role,homeBaseIcao:p.home_base_icao})),
  events:evidenceTruncated?[]:evidence.map(e=>({
   id:e.id,employeeId:e.employee_id,eventType:e.event_type,
   originIcao:e.origin_icao,locationIcao:e.location_icao,
   departedAt:e.departed_at,occurredAt:e.occurred_at,recordedAt:e.recorded_at,
   verificationState:e.verification_state,verifiedAt:e.verified_at,
   sourceReference:e.source_reference
  })),
  asOf:new Date().toISOString()
 });
 const placeById=new Map(places.map(x=>[x.employeeId,x]));
 // Homebase is NOT current location. No assertions about travel times or credentials.
 // Future data sources must provide verified, timestamped current positions, history,
 // actual travel matrix and accommodation catalog before mobility may be proposed.
 const projected=planCrewMobility({
  people:staff.map(p=>({
   id:p.id,name:p.display_name,role:p.crew_role,homeBaseIcao:p.home_base_icao,
   currentIcao:placeById.get(p.id)?.locationIcao??null,
   availableAt:null,lastDutyEnd:null,
   locationVerified:!evidenceTruncated&&placeById.get(p.id)?.status==='verified',
   historyVerified:false
  })),
  duties:known.filter(b=>confirmed(b.state)).map(b=>({
   id:b.id,employeeId:b.employee_id,kind:b.kind,
   startsAt:b.starts_at,endsAt:b.ends_at,
   fromIcao:b.location_icao,toIcao:null
  })),
  travelRoutes:[],hotels:[]
 });
 const unconfirmed=known.filter(b=>!confirmed(b.state)).length;
 const issues=projected.filter(p=>p.status==='blocked').length;
 return <OpsShell active="crew-mobility">
  <header className="header"><div>
   <span className="eyebrow">AERVELYS · CREW OPERATIONS</span>
   <h1>Crew Mobility & Roster</h1>
   <p>Langfristiger Dienstplan mit Standortketten, Crewtransfers, Hotels und Rückpositionierung.</p>
  </div><span className="state">● Read-only · Keine Crewfreigabe</span></header>
  <section className="moduleBanner">
   <strong>Standorte werden niemals aus der Homebase angenommen.</strong>
   <p>Standortnachweise werden jetzt aus Crew Location Control eingelesen. Eine manuelle
    Ausgangsbestätigung ist jedoch keine Crewfreigabe. Vollständige Diensthistorien,
    Transferzeiten und Hoteltarife fehlen weiterhin. Deshalb bleiben verbindliche
    Reise- und Flugzuteilungen gesperrt. Diese Ansicht löst keine Buchung aus.</p>
  </section>
  <div className="rotationDateBar" style={{marginBottom:20}}>
   <Link href={'/crew-mobility?date='+shift(day,-days)+'&weeks='+weeks}>← Vorheriger Zeitraum</Link>
   <div><span>PLANUNGSZEITRAUM · UTC</span><strong>{day} bis {shift(day,days-1)}</strong></div>
   <Link href={'/crew-mobility?date='+shift(day,days)+'&weeks='+weeks}>Nächster Zeitraum →</Link>
  </div>
  <div className="commandLinks" aria-label="Planungshorizont">
   {[2,4,8,12].map(w=><Link key={w}
    href={'/crew-mobility?date='+day+'&weeks='+w}
    aria-current={weeks===w?'page':undefined}>{w} Wochen</Link>)}
  </div>
  {failed?<p role="alert" className="emptyState">Crewdaten konnten nicht vollständig geladen werden – keine Planungsbewertung.</p>:<>
   <section className="ledgerSummary">
    <div className="ledgerMetric"><span>PIC- und SIC-Profile</span><strong>{staff.length}</strong></div>
    <div className="ledgerMetric"><span>Erfasste Dienstblöcke</span><strong>{known.length}</strong></div>
    <div className="ledgerMetric"><span>Unbestätigte Dienstblöcke</span><strong>{unconfirmed}</strong></div>
    <div className="ledgerMetric"><span>Mobilität nicht freigegeben</span><strong>{issues}</strong></div>
   </section>
   {evidenceTruncated&&<p className="ledgerWarning">Mehr als 1.000 Standortereignisse; der Standortfeed ist unvollständig, daher bleibt die Verfügbarkeit gesperrt.</p>}
   {blocks.length===500&&<p className="ledgerWarning">Es werden maximal 500 Dienstblöcke angezeigt. Aus diesem Ausschnitt darf keine vollständige Verfügbarkeit abgeleitet werden.</p>}
   <section className="workspacePanel">
    <div className="panelHeading"><h2>Dienstplan und Bereitschaften</h2>
     <span>Aus Bestandsdaten · {known.length} Einträge</span></div>
    {known.length===0?<p className="emptyState">In diesem Zeitraum sind noch keine Dienstblöcke für PIC/SIC erfasst.</p>:
     <div className="tableScroll"><table className="dataTable">
      <thead><tr><th>Mitarbeiter</th><th>Zeitraum (UTC)</th><th>Art</th><th>Einsatzort</th><th>Planstatus</th></tr></thead>
      <tbody>{known.map(b=><tr key={b.id}>
       <td><Link className="staffLink" href={'/staff/'+b.employee_id}>{byId.get(b.employee_id)?.display_name}</Link></td>
       <td>{zulu(b.starts_at)} – {zulu(b.ends_at)}</td>
       <td>{b.kind}</td><td>{b.location_icao??'Unbekannt'}</td>
       <td>{b.state}</td>
      </tr>)}</tbody>
     </table></div>}
   </section>
   <div className="sectionHeader"><div><h2>Mobility Control</h2>
    <p>Je Crewmitglied werden Standort, Transfers, Dienstketten und Ruhezeiten geprüft.</p></div>
    <span>{projected.length} Besatzungsprofile</span></div>
   <div className="assessmentStack">
    {projected.map((p)=>{
     const errors=[...new Set(p.issues.map(i=>codeLabel[i.code]??i.code))];
     return <article key={p.employeeId} className="workspacePanel">
      <div className="panelHeading"><h2>
       <Link className="staffLink" href={'/staff/'+p.employeeId}>{p.name}</Link>
       {' · '}{p.role}</h2><span>Disposition gesperrt</span></div>
      <div className="assessmentDetail">
       <div><span>Homebase</span><strong>{p.homeBaseIcao??'Nicht belegt'}</strong></div>
       <div><span>Dokumentierter Standort</span><strong>{placeById.get(p.employeeId)?.locationIcao??'Unbekannt'}</strong></div>
       <div><span>Bestätigte Dienste im Zeitraum</span><strong>{p.dutyCount}</strong></div>
      </div>
      <p className="scenarioNotice">
       {errors.length?errors.join(' · '):'Mobilität vorgeprüft; regulatorische Crewfreigabe weiterhin ausstehend.'}
      </p>
      <p className="panelNote">
       Crewpositionierungen, Hotels und Rückreisen werden erst mit nachgewiesenen
       Standort- und Anbieterinformationen kalkuliert. Keine externen Buchungen.
      </p>
     </article>;
    })}
    {projected.length===0&&<p className="emptyState">Noch keine PIC-/SIC-Personalprofile verfügbar.</p>}
   </div>
  </>}
  <div className="commandLinks">
   <Link href="/crew-locations">Crew Location Control →</Link>
   <Link href="/rotation">Daily Flight Schedule →</Link>
   <Link href="/crew-scheduling">Crew-Screening →</Link>
   <Link href="/duty-rest">Duty / Rest →</Link>
   <Link href="/modules/hr">Abwesenheiten →</Link>
  </div>
  <p className="panelNote">
   Keine Dienstzeit- oder EASA-FTL-Freigabe. Das Modell berechnet nur mögliche
   Reise-, Unterkunfts- und Rotationsketten, wenn die Eingabedaten später gesichert vorliegen.
   Das Alt-OPS und alle operativen Personal-/Flugzeugdaten bleiben unverändert.
  </p>
 </OpsShell>;
}
