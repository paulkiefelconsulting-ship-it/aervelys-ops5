import Link from 'next/link';
import OpsShell from '../../components/ops-shell';
import {requireWorkspace} from '../../lib/workspace';

export const dynamic='force-dynamic';
type Run={id:string;request_id:string;screening_day:string;status:string;reason:string;aircraft_conflict:boolean;proposed_start_at:string|null;proposed_end_at:string|null};
type Check={id:string;screening_id:string;employee_id:string;crew_role:'PIC'|'SIC';aircraft_type:string;status:string;home_base_matches:boolean;overlap_conflict:boolean;leave_conflict:boolean;blocking_reasons:string[]};
type Employee={id:string;display_name:string;home_base_icao:string|null};
type Request={id:string;departure_icao:string;arrival_icao:string;origin:string};
const reasonLabels:Record<string,string>={
 EMPLOYMENT_NOT_VERIFIED:'Beschäftigung nicht verifiziert',
 TYPE_RATING_NOT_VERIFIED:'Musterberechtigung nicht verifiziert',
 MEDICAL_NOT_VERIFIED:'Medical nicht verifiziert',
 OPERATOR_CHECKS_NOT_VERIFIED:'Lizenz-/Operator-Checks nicht verifiziert',
 CREDENTIAL_SET_NOT_VERIFIED:'Lizenznachweise unvollständig',
 LEAVE_CONFLICT:'Abwesenheitskonflikt',
 DUTY_OVERLAP:'Überschneidender Dienst',
 DUTY_AND_REST_ROSTER_NOT_VERIFIED:'Dienst-/Ruhezeitplan ungeprüft',
 CREW_CURRENT_LOCATION_NOT_VERIFIED:'Aktueller Aufenthaltsort ungeprüft'
};
const time=(v:string|null)=>v?new Date(v).toLocaleString('de-DE',{timeZone:'UTC'})+' UTC':'Zeit unbekannt';

export default async function CrewSchedulingPage(){
 const {supabase,organization}=await requireWorkspace();
 const [runsResult,requestsResult]=await Promise.all([
  supabase.from('crew_screening_runs')
   .select('id,request_id,screening_day,status,reason,aircraft_conflict,proposed_start_at,proposed_end_at')
   .eq('organization_id',organization.id).order('created_at',{ascending:false}).limit(25),
  supabase.from('charter_requests')
   .select('id,departure_icao,arrival_icao,origin')
   .eq('organization_id',organization.id).order('created_at',{ascending:false}).limit(100)
 ]);
 const runs=(runsResult.data??[]) as Run[];
 const runIds=runs.map(r=>r.id);
 const checksResult=runIds.length?await supabase.from('crew_screening_checks')
  .select('id,screening_id,employee_id,crew_role,aircraft_type,status,home_base_matches,overlap_conflict,leave_conflict,blocking_reasons')
  .eq('organization_id',organization.id).in('screening_id',runIds).limit(500):null;
 const checks=(checksResult?.data??[]) as Check[];
 const employeeIds=Array.from(new Set(checks.map(c=>c.employee_id)));
 const employeesResult=employeeIds.length?await supabase.from('employees')
  .select('id,display_name,home_base_icao').eq('organization_id',organization.id)
  .in('id',employeeIds).limit(150):null;
 const staff=new Map(((employeesResult?.data??[]) as Employee[]).map(e=>[e.id,e]));
 const requests=new Map(((requestsResult.data??[]) as Request[]).map(r=>[r.id,r]));
 const failed=runsResult.error||requestsResult.error||checksResult?.error||employeesResult?.error;
 return <OpsShell active="crew-scheduling">
  <header className="header"><div>
   <span className="eyebrow">FLUGBETRIEB · AUTOMATISCHE SICHERHEITSPRÜFUNG</span>
   <h1>Crew Scheduling</h1>
   <p>Passende Crew-Musterprofile, Zeitkonflikte und Gründe für die Sperrung.</p>
  </div><span className="state">● Shadow Mode · keine Zuteilung</span></header>
  <section className="moduleBanner">
   <strong>Alle angezeigten Crews sind für die Disposition gesperrt.</strong>
   <p>Die Prüfung verwendet übernommene Musterrollen und geschützte Nachweise für Medical, Lizenz,
   Checks und Abwesenheiten. Die Homebase ist kein bestätigter aktueller Aufenthaltsort.
   Solange Dienst-/Ruhezeitpläne und betriebliche Freigaben fehlen, darf kein Einsatz beginnen.</p>
  </section>
  <section className="commandLinks">
   <Link href="/dispatch">Aircraft-Dispatch →</Link>
   <Link href="/modules/crew">Personalakten →</Link>
   <Link href="/modules/hr">Abwesenheiten →</Link>
  </section>
  <section className="moduleBanner"><strong>Automatische Neuberechnung</strong>
   <p>Neue Charteranfragen werden beim Anlegen sofort geprüft.
   Der unabhängige Hintergrundjob prüft offene zukünftige Anfragen jeden Tag um 05:25 UTC erneut.
   Es entsteht höchstens ein Prüflauf je Anfrage und UTC-Tag.</p>
  </section>
  {failed?<p className="emptyState" role="alert">Die aktuellen Prüfergebnisse konnten nicht vollständig geladen werden.</p>:
   runs.length===0?<p className="emptyState">Noch keine Crew-Prüfung vorhanden.</p>:
   <div className="assessmentStack">{runs.map(run=>{
    const req=requests.get(run.request_id);
    const profiles=checks.filter(c=>c.screening_id===run.id);
    const pic=profiles.filter(p=>p.crew_role==='PIC').length;
    const sic=profiles.filter(p=>p.crew_role==='SIC').length;
    return <article key={run.id} className="workspacePanel">
     <div className="panelHeading">
      <h2>{req?req.departure_icao+' → '+req.arrival_icao:'Charteranfrage'} · {run.screening_day}</h2>
      <span>GESPERRT</span>
     </div>
     <p className="scenarioNotice">Sperrgrund: {run.reason}. Prüfzeitraum: {time(run.proposed_start_at)}
      {' '}bis {time(run.proposed_end_at)}. {req?.origin==='simulation'?'Rein synthetische Charteranfrage.':''}</p>
     <div className="assessmentDetail">
      <div><span>Passende PIC-Profile</span><strong>{pic}</strong></div>
      <div><span>Passende SIC-Profile</span><strong>{sic}</strong></div>
      <div><span>Aircraft-Zeitkonflikt</span><strong>{run.aircraft_conflict?'Vorhanden':'Keiner nachgewiesen'}</strong></div>
     </div>
     <div className="tableScroll"><table className="dataTable">
      <thead><tr><th>Mitarbeiter</th><th>Rolle</th><th>Muster</th><th>Homebase</th><th>Ergebnis</th><th>Blockierende Prüfungen</th></tr></thead>
      <tbody>{profiles.map(c=>{
       const e=staff.get(c.employee_id);
       return <tr key={c.id}>
        <td>{e?<Link className="staffLink" href={'/staff/'+e.id}>{e.display_name}</Link>:'Unbekannt'}</td>
        <td>{c.crew_role}</td><td>{c.aircraft_type}</td>
        <td>{e?.home_base_icao??'Nicht belegt'}</td>
        <td>Gesperrt</td>
        <td>{c.blocking_reasons.map(b=>reasonLabels[b]??b).join(' · ')}</td>
       </tr>;
      })}</tbody>
     </table></div>
     {profiles.length===0&&<p className="emptyState">Keine passenden Crew-Musterprofile vorhanden.</p>}
    </article>;
   })}</div>}
  <p className="scenarioNotice" style={{marginTop:24}}>
   Diese Seite gibt keine Crew frei und erzeugt keine Flugzeug-/Personalreservierungen.
   Private Medical-, Vertrags- und Gehaltsdetails bleiben außerhalb der Anzeige.
  </p>
 </OpsShell>;
}
