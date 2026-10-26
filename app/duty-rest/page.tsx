import Link from 'next/link';
import OpsShell from '../../components/ops-shell';
import {requireWorkspace} from '../../lib/workspace';

export const dynamic='force-dynamic';

type DutyReview={
 id:string;screening_id:string;employee_id:string;proposed_start_at:string|null;
 proposed_end_at:string|null;last_recorded_duty_end:string|null;
 next_recorded_duty_start:string|null;observed_7d_hours:string|number;
 observed_28d_hours:string|number;overlapping_confirmed_blocks:number;
 leave_conflict:boolean;roster_complete:boolean;status:string;
 policy_code:string;blockers:string[];checked_at:string;
};
type Employee={id:string;display_name:string;crew_role:string;home_base_icao:string};
type Run={id:string;request_id:string;screening_day:string};
type Charter={id:string;departure_icao:string;arrival_icao:string;departure_at:string;origin:string};
type Block={id:string;employee_id:string;starts_at:string;ends_at:string;kind:string;state:string;location_icao:string|null};
const blockerText:Record<string,string>={
 ROSTER_COMPLETENESS_UNVERIFIED:'Vollständigkeit des Dienstplans unbekannt',
 PLANNED_DUTY_WINDOW_UNKNOWN:'Geplantes Dienstzeitfenster fehlt',
 PREVIOUS_DUTY_HISTORY_NOT_ESTABLISHED:'Vorherige Diensthistorie nicht nachgewiesen',
 ILLUSTRATIVE_DUTY_WINDOW_GT_14H:'Testgrenze: geplanter Dienst über 14 Stunden',
 ILLUSTRATIVE_REST_GAP_LT_11H:'Testgrenze: Ruhezeit vor dem Flug unter 11 Stunden',
 ILLUSTRATIVE_FOLLOWING_REST_GAP_LT_11H:'Testgrenze: Ruhezeit nach dem Flug unter 11 Stunden',
 ILLUSTRATIVE_7D_DUTY_GT_60H:'Testgrenze: mehr als 60 Stunden in 7 Tagen',
 ILLUSTRATIVE_28D_DUTY_GT_190H:'Testgrenze: mehr als 190 Stunden in 28 Tagen',
 CONFIRMED_DUTY_OR_REST_OVERLAP:'Überschneidung mit bestätigtem Dienst- oder Ruheblock',
 ABSENCE_OVERLAP:'Genehmigte oder beantragte Abwesenheit überschneidet sich'
};
const time=(value:string|null)=>value?new Date(value).toLocaleString('de-DE',{
 timeZone:'UTC',day:'2-digit',month:'2-digit',year:'numeric',
 hour:'2-digit',minute:'2-digit'})+' UTC':'Nicht belegt';

export default async function DutyRestPage(){
 const {supabase,organization}=await requireWorkspace();
 const [reviewsResult,runsResult,blocksResult]=await Promise.all([
  supabase.from('crew_duty_reviews')
   .select('id,screening_id,employee_id,proposed_start_at,proposed_end_at,last_recorded_duty_end,next_recorded_duty_start,observed_7d_hours,observed_28d_hours,overlapping_confirmed_blocks,leave_conflict,roster_complete,status,policy_code,blockers,checked_at')
   .eq('organization_id',organization.id).order('checked_at',{ascending:false}).limit(150),
  supabase.from('crew_screening_runs').select('id,request_id,screening_day')
   .eq('organization_id',organization.id).order('created_at',{ascending:false}).limit(100),
  supabase.from('crew_duty_blocks')
   .select('id,employee_id,starts_at,ends_at,kind,state,location_icao')
   .eq('organization_id',organization.id).order('starts_at',{ascending:false}).limit(100)
 ]);
 const reviews=(reviewsResult.data??[]) as DutyReview[];
 const runs=(runsResult.data??[]) as Run[];
 const blocks=(blocksResult.data??[]) as Block[];
 const employeeIds=Array.from(new Set([
  ...reviews.map(x=>x.employee_id),...blocks.map(x=>x.employee_id)
 ]));
 const requestIds=Array.from(new Set(runs.map(x=>x.request_id)));
 const [employeesResult,chartersResult]=await Promise.all([
  employeeIds.length?supabase.from('employees')
   .select('id,display_name,crew_role,home_base_icao')
   .eq('organization_id',organization.id).in('id',employeeIds).limit(200):Promise.resolve(null),
  requestIds.length?supabase.from('charter_requests')
   .select('id,departure_icao,arrival_icao,departure_at,origin')
   .eq('organization_id',organization.id).in('id',requestIds).limit(200):Promise.resolve(null)
 ]);
 const employees=new Map(((employeesResult?.data??[]) as Employee[]).map(x=>[x.id,x]));
 const runsById=new Map(runs.map(x=>[x.id,x]));
 const charters=new Map(((chartersResult?.data??[]) as Charter[]).map(x=>[x.id,x]));
 const conflicts=reviews.filter(x=>x.overlapping_confirmed_blocks>0||x.leave_conflict).length;
 const restWarnings=reviews.filter(x=>x.blockers.some(b=>b.includes('REST_GAP'))).length;
 const failed=reviewsResult.error||runsResult.error||blocksResult.error||
  employeesResult?.error||chartersResult?.error;
 return <OpsShell active="duty-rest">
  <header className="header"><div>
   <span className="eyebrow">CREW MANAGEMENT · AUTOMATISCHE VORPRÜFUNG</span>
   <h1>Dienst- und Ruhezeitprüfung</h1>
   <p>Erfasste Dienstblöcke, Abwesenheiten, Rollstunden und nachvollziehbare Sicherheitssperren.</p>
  </div><span className="state">● Shadow Mode · keine Crewfreigabe</span></header>
  <section className="moduleBanner">
   <strong>Konservatives Testmodell – keine luftfahrtrechtliche Einsatzfreigabe.</strong>
   <p>Für jedes neu erzeugte Crew-Screening wird automatisch eine separate, unveränderliche
    Zeitbewertung gespeichert. Das System betrachtet bestätigte Dienstblöcke und beantragte
    oder genehmigte Abwesenheiten. Unvollständige Diensthistorien führen immer zur Sperre.
    Die Grenzwerte sind illustrative Annahmen und entsprechen keiner vollständigen
    EU-OPS- oder EASA-FTL-Regelprüfung.</p>
  </section>
  <section className="commandLinks">
   <Link href="/crew-scheduling">Crew Scheduling →</Link>
   <Link href="/modules/crew">Mitarbeiterprofile →</Link>
   <Link href="/modules/hr">Abwesenheitsverwaltung →</Link>
   <Link href="/dispatch">Dispatch-Prüfungen →</Link>
  </section>
  {failed?<p className="emptyState" role="alert">
   Die Dienst- und Ruhezeitdaten konnten nicht vollständig geladen werden.
  </p>:<>
   <section className="ledgerSummary">
    <div className="ledgerMetric"><span>Angezeigte Einzelprüfungen</span><strong>{reviews.length}</strong></div>
    <div className="ledgerMetric"><span>Dienst- oder Urlaubskonflikte</span><strong>{conflicts}</strong></div>
    <div className="ledgerMetric"><span>Hinweise auf zu geringe Modellruhezeit</span><strong>{restWarnings}</strong></div>
    <div className="ledgerMetric"><span>Operativ freigegeben</span><strong>0</strong></div>
   </section>
   {reviews.length===150&&<p className="ledgerWarning">Nur die neuesten 150 Prüfungen werden angezeigt.</p>}
   <section className="moduleBanner">
    <strong>Rechenregeln in dieser Entwicklungsstufe</strong>
    <p>Beispielgrenzen: 11 Stunden Ruhe zwischen erfassten Diensten, maximal 14 Stunden
     für das modellierte Dienstfenster, 60 erfasste Stunden in 7 Tagen und 190 Stunden
     in 28 Tagen. Berücksichtigt werden bestätigte Flug-, Positionierungs-, Briefing-
     und Bereitschaftsblöcke. Ohne verifizierte, lückenlose Historie bleibt der
     Prüfstatus auch dann gesperrt, wenn keine Überschneidung erkennbar ist.</p>
   </section>
   <div className="sectionHeader"><div><h2>Crew-Prüfungen</h2>
    <p>Historische Prüfschnappschüsse – neue Charterprüfungen erzeugen neue Ergebnisse.</p>
   </div><span>{reviews.length} Ergebnisse</span></div>
   {reviews.length===0?<p className="emptyState">
    Noch keine Zeitprüfungen vorhanden. Sie entstehen mit dem nächsten Crew-Screening.
   </p>:<div className="assessmentStack">{reviews.map(x=>{
    const employee=employees.get(x.employee_id);
    const screening=runsById.get(x.screening_id);
    const charter=screening?charters.get(screening.request_id):undefined;
    return <article className="workspacePanel" key={x.id}>
     <div className="panelHeading">
      <h2>{employee?<Link href={'/staff/'+employee.id}>{employee.display_name}</Link>:'Personalprofil'}</h2>
      <span>GESPERRT · {screening?.screening_day??'Prüftag unbekannt'}</span>
     </div>
     <p className="panelNote">
      {employee?.crew_role??'Pilot'} · Homebase {employee?.home_base_icao??'unbekannt'} ·
      {' '}{charter?charter.departure_icao+' → '+charter.arrival_icao:'Charteranfrage'} ·
      {' '}{time(x.proposed_start_at)} – {time(x.proposed_end_at)}
     </p>
     <div className="assessmentDetail">
      <div><span>Erfasste Dienststunden / 7 Tage</span>
       <strong>{Number(x.observed_7d_hours).toFixed(2)} h</strong></div>
      <div><span>Erfasste Dienststunden / 28 Tage</span>
       <strong>{Number(x.observed_28d_hours).toFixed(2)} h</strong></div>
      <div><span>Bestätigte Zeitüberschneidungen</span>
       <strong>{x.overlapping_confirmed_blocks}</strong></div>
      <div><span>Letztes erfasstes Dienstende</span><strong>{time(x.last_recorded_duty_end)}</strong></div>
      <div><span>Nächster erfasster Dienstbeginn</span><strong>{time(x.next_recorded_duty_start)}</strong></div>
      <div><span>Abwesenheitskonflikt</span><strong>{x.leave_conflict?'Ja':'Nicht nachgewiesen'}</strong></div>
     </div>
     <p className="scenarioNotice">Sperrgründe: {x.blockers.map(b=>blockerText[b]??b).join(' · ')}</p>
    </article>;
   })}</div>}
   <div className="sectionHeader"><div><h2>Hinterlegte Dienst- und Ruheblöcke</h2>
    <p>Nur bestätigte Blöcke werden bei der Konfliktprüfung als verbindlich berücksichtigt.</p>
   </div><span>{blocks.length} angezeigt</span></div>
   {blocks.length===0?<p className="emptyState">
    Noch keine vollständigen, bestätigten Dienstblöcke übernommen. Keine freien Zeitfenster
    dürfen daraus abgeleitet werden.
   </p>:<div className="workspacePanel"><div className="tableScroll"><table className="dataTable">
    <thead><tr><th>Mitarbeiter</th><th>Art</th><th>Beginn (UTC)</th><th>Ende (UTC)</th><th>Status</th></tr></thead>
    <tbody>{blocks.map(b=><tr key={b.id}>
     <td>{employees.get(b.employee_id)?.display_name??'Unbekannt'}</td>
     <td>{b.kind}</td><td>{time(b.starts_at)}</td><td>{time(b.ends_at)}</td>
     <td>{b.state}</td>
    </tr>)}</tbody>
   </table></div></div>}
  </>}
  <p className="scenarioNotice" style={{marginTop:20}}>
   Die Prüfung verwendet ausschließlich vorhandene Arbeitszeit- und Abwesenheitsdaten.
   Sie erzeugt keine realen Flugaufträge, bucht keine Crews und zeigt keine medizinischen
   Personalakten oder Gehaltsdaten an. Kein fehlender Nachweis wird als gültig angenommen.
  </p>
 </OpsShell>;
}
