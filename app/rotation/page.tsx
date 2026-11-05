import Link from 'next/link';
import OpsShell from '../../components/ops-shell';
import {requireWorkspace} from '../../lib/workspace';
import {proposeRotations} from '../../lib/rotation-planner.mjs';
import './rotation.css';

export const dynamic='force-dynamic';
type Fleet={id:string;registration:string;aircraft_type:string;home_base_icao:string|null;current_icao:string|null;operational_status:string};
type Flight={id:string;aircraft_id:string|null;departure_icao:string;arrival_icao:string;departure_at:string;arrival_at:string;status:string};
type Hold={id:string;aircraft_id:string;reservation_kind:string;starts_at:string;ends_at:string;state:string};
type Employee={id:string;display_name:string;crew_role:string;employment_status:string;home_base_icao:string|null};
type Inquiry={id:string;departure_icao:string;arrival_icao:string;departure_at:string;passengers:number;status:string};
const utc=(value:string)=>new Date(value).toLocaleString('de-DE',{timeZone:'UTC',hour:'2-digit',minute:'2-digit'});
const dt=(value:string)=>new Date(value).toLocaleString('de-DE',{timeZone:'UTC',day:'2-digit',month:'2-digit',year:'numeric'});
const dayString=(date:Date)=>date.toISOString().slice(0,10);
const shift=(day:string,delta:number)=>dayString(new Date(Date.parse(day+'T00:00:00Z')+delta*86_400_000));
const isDate=(x:string)=>/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(x+'T00:00:00Z'))&&dayString(new Date(x+'T00:00:00Z'))===x;
const minute=(value:string,start:number)=>Math.floor((Date.parse(value)-start)/60_000);
const width=(a:string,b:string,start:number)=>{
 const from=Math.max(0,minute(a,start)),until=Math.min(1440,minute(b,start));
 return {left:(from/1440*100)+'%',width:(Math.max(0,until-from)/1440*100)+'%'};
};

export default async function RotationPage({searchParams}:{searchParams:Promise<{date?:string}>}){
 const q=await searchParams;
 const requested=q.date??'';
 const day=isDate(requested)?requested:dayString(new Date());
 const dayStart=Date.parse(day+'T00:00:00Z'),dayEnd=dayStart+86_400_000;
 const start=new Date(dayStart).toISOString(),end=new Date(dayEnd).toISOString();
 const {supabase,organization}=await requireWorkspace();
 const [fleetR,flightsR,holdsR,staffR,inquiriesR]=await Promise.all([
  supabase.from('aircraft').select('id,registration,aircraft_type,home_base_icao,current_icao,operational_status')
   .eq('organization_id',organization.id).order('registration').limit(100),
  supabase.from('flight_plans').select('id,aircraft_id,departure_icao,arrival_icao,departure_at,arrival_at,status')
   .eq('organization_id',organization.id).gte('departure_at',start).lt('departure_at',end)
   .order('departure_at').limit(250),
  supabase.from('resource_reservations').select('id,aircraft_id,reservation_kind,starts_at,ends_at,state')
   .eq('organization_id',organization.id).lt('starts_at',end).gt('ends_at',start)
   .order('starts_at').limit(250),
  supabase.from('employees').select('id,display_name,crew_role,employment_status,home_base_icao')
   .eq('organization_id',organization.id).limit(150),
  supabase.from('charter_requests').select('id,departure_icao,arrival_icao,departure_at,passengers,status')
   .eq('organization_id',organization.id).gte('departure_at',start).lt('departure_at',end)
   .order('departure_at').limit(100)
 ]);
 const failed=fleetR.error||flightsR.error||holdsR.error||staffR.error||inquiriesR.error;
 const fleet=(fleetR.data??[]) as Fleet[],flights=(flightsR.data??[]) as Flight[];
 const holds=(holdsR.data??[]) as Hold[],staff=(staffR.data??[]) as Employee[];
 const inquiries=(inquiriesR.data??[]) as Inquiry[];
 // In the new environment no aircraft charter release / performance / crew-location
 // authorization is verified. Set those gates to FALSE, never assume from legacy data.
 const proposals=proposeRotations({
  aircraft:fleet.map(a=>({id:a.id,registration:a.registration,type:a.aircraft_type,
   currentIcao:a.current_icao,availableAt:start,operationalStatus:a.operational_status,
   charterReleased:false,airportPerformanceVerified:false})),
  crew:staff.map(p=>({id:p.id,name:p.display_name,role:p.crew_role,
   aircraftTypes:[],currentIcao:null,availableAt:start,
   verified:false,operationalStatus:p.employment_status})),
  requests:flights.map(f=>({id:f.id,aircraftId:f.aircraft_id,from:f.departure_icao,to:f.arrival_icao,
   departsAt:f.departure_at,arrivesAt:f.arrival_at})),
  commitments:holds.filter(h=>['confirmed','active','operational','locked'].includes(h.state))
   .map(h=>({aircraftId:h.aircraft_id,startsAt:h.starts_at,endsAt:h.ends_at})),
  aircraftRoutes:[],crewRoutes:[]
 });
 const pending=proposals.filter((p:{status:string})=>p.status==='blocked').length;
 const withoutAircraft=flights.filter(f=>!f.aircraft_id);
 return <OpsShell active="rotation">
  <header className="header"><div>
   <span className="eyebrow">AERVELYS · OPERATIONS CONTROL CENTER</span>
   <h1>Daily Flight Schedule</h1>
   <p>Flotten-Umläufe, Charterentwürfe und bestehende Zeitfenster – ohne pauschale Tagesblockierung.</p>
  </div><span className="state">● Live-Daten · Nur Prüfmodus</span></header>
  <section className="moduleBanner"><strong>Operative Freigabe weiterhin gesperrt</strong>
   <p>Die Ansicht liest ausschließlich Daten der neuen AERVELYS-Datenbank. Die Rotation Engine berechnet
    unverbindliche Vorschläge nur bei nachgewiesener Position, Charterfreigabe, Aircraft-Performance,
    Crewqualifikation, Crewstandort und Reisezeit. Diese Nachweise sind noch nicht vollständig integriert;
    ein Entwurf wird deshalb nicht automatisch als durchführbar bezeichnet.</p>
  </section>
  <div className="rotationDateBar">
   <Link href={'/rotation?date='+shift(day,-1)} aria-label="Vorheriger Tag">← Vortag</Link>
   <div><span>UTC-BETRIEBSTAG</span><strong>{dt(start)}</strong></div>
   <Link href={'/rotation?date='+shift(day,1)} aria-label="Nächster Tag">Folgetag →</Link>
  </div>
  {failed?<p className="emptyState" role="alert">Nicht alle Flugplan-, Crew- oder Flottendaten sind abrufbar. Keine Auswertung möglich.</p>:<>
   <section className="ledgerSummary">
    <div className="ledgerMetric"><span>Flugzeuge im Bestand</span><strong>{fleet.length}</strong></div>
    <div className="ledgerMetric"><span>Flugplanentwürfe heute</span><strong>{flights.length}</strong></div>
    <div className="ledgerMetric"><span>Charteranfragen heute</span><strong>{inquiries.length}</strong></div>
    <div className="ledgerMetric"><span>Ungeprüfte / gesperrte Vorschläge</span><strong>{pending}</strong></div>
   </section>
   <section className="workspacePanel">
    <div className="panelHeading"><h2>24-Stunden-Flottenübersicht</h2><span>UTC · Entwürfe ≠ bestätigte Flüge</span></div>
    <div className="rotationScroll"><div className="rotationSchedule">
     <div className="rotationScale"><span>Flugzeug</span><div className="rotationTimeMarks">{[0,4,8,12,16,20,24].map(h=>
      <span key={h}>{String(h).padStart(2,'0')}:00</span>)}</div></div>
     {fleet.map(a=>{
      const legs=flights.filter(f=>f.aircraft_id===a.id);
      const reserves=holds.filter(h=>h.aircraft_id===a.id);
      return <div className="rotationLane" key={a.id}>
       <div className="rotationAircraft"><strong>{a.registration}</strong><small>{a.aircraft_type}</small></div>
       <div className="rotationTrack">
        {[4,8,12,16,20].map(h=><span key={h} className="rotationGuide" style={{left:h/24*100+'%'}}/>)}
        {reserves.map(r=><div key={r.id} className="rotationSlot rotationReserved"
          style={width(r.starts_at,r.ends_at,dayStart)}
          title={r.reservation_kind+' · '+r.state+' · '+utc(r.starts_at)+'–'+utc(r.ends_at)}>
           <span>{r.reservation_kind}</span></div>)}
        {legs.map(f=><div key={f.id} className="rotationSlot rotationDraft"
          style={width(f.departure_at,f.arrival_at,dayStart)}
          title={f.departure_icao+' → '+f.arrival_icao+' · '+utc(f.departure_at)+'–'+utc(f.arrival_at)+' · '+f.status}>
           <span>{f.departure_icao} → {f.arrival_icao}</span></div>)}
       </div>
      </div>;
     })}
     {!fleet.length&&<p className="emptyState">In der aktuellen Datenbank sind noch keine Flugzeuge erfasst.</p>}
    </div></div>
    <div className="rotationLegend"><span><i className="rotationDraftKey"/>Flugplanentwurf</span>
     <span><i className="rotationReservedKey"/>Ressourcen-Zeitfenster</span>
     <span>Leere Zeit ≠ automatisch einsatzfähig</span></div>
   </section>
   <div className="sectionHeader"><div><h2>Dispatch- und Crew-Check</h2>
    <p>Keine Reservierung ohne nachgewiesene Crew-, Flugzeug- und Transferverfügbarkeit.</p></div>
    <span>{proposals.length} Prüfungen</span></div>
   {flights.length===0?<p className="emptyState">Für diesen Tag sind noch keine Flugplanentwürfe erfasst.</p>:
    <div className="workspacePanel"><div className="tableScroll"><table className="dataTable">
     <thead><tr><th>Abflug</th><th>Route</th><th>Geplantes Flugzeug</th><th>Disposition</th></tr></thead>
     <tbody>{flights.map(f=>{
      const p=proposals.find((x:{requestId:string})=>x.requestId===f.id);
      return <tr key={f.id}><td>{utc(f.departure_at)} UTC</td>
       <td>{f.departure_icao} → {f.arrival_icao}</td>
       <td>{fleet.find(a=>a.id===f.aircraft_id)?.registration??'Noch nicht zugeordnet'}</td>
       <td>{p?.status==='proposed'?'Unverbindlich prüfbar':'Gesperrt / Nachweise fehlen'}</td></tr>;
     })}</tbody>
    </table></div></div>}
   {withoutAircraft.length>0&&<p className="scenarioNotice">{withoutAircraft.length} Flugplanentwürfe haben noch keine Maschine. Keine automatische Zuordnung ohne verifizierte Freigaben.</p>}
   <div className="sectionHeader"><div><h2>Offene Charteranfragen des Tages</h2>
    <p>Gesondert von Flugplanentwürfen und Ressourcenreservierungen.</p></div><span>{inquiries.length} Anfragen</span></div>
   {inquiries.length===0?<p className="emptyState">Keine Charteranfragen für diesen Betriebstag vorhanden.</p>:
    <div className="workspacePanel"><div className="tableScroll"><table className="dataTable">
     <thead><tr><th>Uhrzeit</th><th>Strecke</th><th>Passagiere</th><th>Status</th></tr></thead>
     <tbody>{inquiries.map(i=><tr key={i.id}><td>{utc(i.departure_at)} UTC</td>
      <td>{i.departure_icao} → {i.arrival_icao}</td><td>{i.passengers}</td><td>{i.status}</td></tr>)}</tbody>
    </table></div></div>}
  </>}
  <div className="commandLinks"><Link href="/dispatch">Dispatch-Prüfung →</Link>
   <Link href="/crew-scheduling">Crew Scheduling →</Link>
   <Link href="/crew-mobility">Crew Mobility & Roster →</Link>
   <Link href="/positioning">Aircraft Positioning →</Link>
   <Link href="/duty-rest">Crew Duty / Rest →</Link></div>
  <p className="panelNote">AERVELYS-Regeln: Longitude kein EDAZ-Betrieb; Phenom 300E nicht für Charter zugelassen.
   Keine fiktiven Positionen oder Flüge werden in operative Datensätze zurückgeschrieben.
   Die Crewpositionierung wird künftig separat als dienstzeitrelevantes Segment verbucht.</p>
 </OpsShell>;
}
