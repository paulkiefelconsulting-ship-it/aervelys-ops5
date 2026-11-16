import Link from 'next/link';
import OpsShell from '../../components/ops-shell';
import {requireWorkspace} from '../../lib/workspace';
import {fleetSeed,suggestedPrefix} from '../../lib/fleet-registry';
import {addFleetAircraft,importFleetManifest} from './actions';
export const dynamic='force-dynamic';
type Aircraft={id:string;registration:string;aircraft_type:string;home_base_icao:string;current_icao:string|null;operational_status:string};
const notices:Record<string,string>={
 imported:'Fehlende Flugzeuge aus dem AERVELYS-Bestand übernommen (zunächst inaktiv).',
 already:'Alle sieben bekannten Kennzeichen sind bereits vorhanden.',
 created:'Neues Flugzeug mit fiktivem Kennzeichenvorschlag gespeichert.',
 failed:'Datenbankaktion fehlgeschlagen. Organisationsrechte und vorhandene Datensätze prüfen.',
 invalid:'Flugzeugtyp, Flugplatz oder Kennzeichenklasse ungültig.',
 class:'Kennzeichenklasse widerspricht dem bekannten Muster. Bitte passend wählen.',
 duplicate:'Kennzeichenkonflikt. Bitte erneut versuchen.'
};
export default async function FleetPage({searchParams}:{searchParams:Promise<{result?:string}>}){
 const {supabase,organization}=await requireWorkspace();
 const {data,error}=await supabase.from('aircraft')
  .select('id,registration,aircraft_type,home_base_icao,current_icao,operational_status')
  .eq('organization_id',organization.id).order('registration',{ascending:true});
 const rows=(data??[]) as Aircraft[];
 const {result}=await searchParams;
 const existing=new Set(rows.map(x=>x.registration));
 const missing=fleetSeed.filter(x=>!existing.has(x.registration));
 const available=rows.filter(x=>x.operational_status==='available').length;
 return <OpsShell active="fleet-registry">
  <header className="header"><div>
   <span className="eyebrow">AERVELYS · AIRCRAFT ASSET MANAGEMENT</span>
   <h1>Fleet Registry</h1>
   <p>Flottenakten, Stationierung und fiktive Kennzeichenvergabe für deine Business-Airline.</p>
  </div><span className="state">● Simulationsbestand</span></header>
  <section className="kpiGrid">
   <div className="kpi"><span>Erfasste Flugzeuge</span><strong>{error?'—':rows.length}</strong></div>
   <div className="kpi"><span>Als verfügbar markiert</span><strong>{error?'—':available}</strong></div>
   <div className="kpi"><span>Noch zu importieren</span><strong>{error?'—':missing.length}</strong></div>
  </section>
  <section className="moduleBanner">
   <strong>Registrierungen sind fiktive Tycoon-Daten.</strong>
   <p>Automatische Kennzeichen werden nur innerhalb dieser Organisation auf Doppelvergabe geprüft.
   Es erfolgt weder eine Abfrage des Luftfahrt-Bundesamtes noch eine echte Eintragung.
   Die bisherigen AERVELYS-Kennzeichen bleiben unverändert. Die Citation Longitude darf EDAZ
   in unserer Simulation nicht anfliegen, auch nicht für Ferry-Flüge.</p>
  </section>
  {result&&notices[result]&&<p role="status" className="feedback">{notices[result]}</p>}
  {error?<p role="alert" className="emptyState">Flottenliste konnte nicht geladen werden.</p>:<>
   <div className="sectionHeader"><div><h2>Aircraft register</h2>
    <p>Bestand der angemeldeten Gesellschaft, live aus Supabase.</p></div><span>{rows.length} Maschinen</span></div>
   <div className="tableScroll"><table className="dataTable">
    <thead><tr><th>Registration</th><th>Aircraft Type</th><th>Home Base</th><th>Last known position</th><th>Status</th></tr></thead>
    <tbody>{rows.map(a=><tr key={a.id}>
     <td><strong>{a.registration}</strong></td><td>{a.aircraft_type}</td>
     <td>{a.home_base_icao}</td><td>{a.current_icao??'Nicht bestätigt'}</td>
     <td>{a.operational_status}</td>
    </tr>)}</tbody></table>
    {!rows.length&&<p className="emptyState">Noch keine Flugzeuge gespeichert. Importiere deinen dokumentierten Bestand.</p>}
   </div>
   <div className="moduleLayout" style={{marginTop:24}}>
    <section className="workspacePanel"><div className="panelHeading"><h2>Bestandsübernahme</h2><span>Idempotenter Import</span></div>
     <p className="panelNote">Bekannte Maschinen werden ausschließlich ergänzt. Vorhandene Flugzeugakten und
     Kennzeichen werden nicht überschrieben. Die übernommenen Maschinen starten vorsichtshalber als inaktiv.</p>
     <div className="tableScroll"><table className="dataTable"><thead><tr><th>Kennzeichen</th><th>Muster</th><th>Abgleich</th></tr></thead>
      <tbody>{fleetSeed.map(a=><tr key={a.registration}><td><strong>{a.registration}</strong></td>
       <td>{a.aircraft_type}</td><td>{existing.has(a.registration)?'Vorhanden':'Fehlt'}</td></tr>)}</tbody>
     </table></div>
     <form action={importFleetManifest}><button type="submit" className="primaryButton" disabled={!missing.length}>
      {missing.length?'Fehlende '+missing.length+' Flugzeuge importieren':'Alle Flugzeuge vorhanden'}</button></form>
    </section>
    <aside className="formPanel"><div className="panelHeading"><h2>Neuer Flugzeugkauf</h2></div>
     <form className="workspaceForm" action={addFleetAircraft}>
      <label className="formField"><span>Flugzeugtyp *</span>
       <input name="aircraft_type" placeholder="z. B. Embraer Phenom 300E" required minLength={3} maxLength={100}/></label>
      <label className="formField"><span>Heimatflugplatz *</span>
       <input name="home_base_icao" defaultValue="EDAZ" required maxLength={4} minLength={4}/></label>
      <label className="formField"><span>Deutsche Registrierungsklasse *</span>
       <select name="prefix" defaultValue="D-C" required>
        <option value="D-A">D-A · Großflugzeuge</option><option value="D-B">D-B · 14–20 t</option>
        <option value="D-C">D-C · 5,7–14 t</option><option value="D-F">D-F · 2–5,7 t</option>
        <option value="D-E">D-E · Leichtflugzeuge</option><option value="D-I">D-I · Zweimotorig (historisch/typabhängig)</option>
       </select></label>
      <small>Bekannte Muster: {['CJ4','PC-24','Phenom 300E','Citation Longitude','Citation X','Hawker 800XP','Vision Jet'].map(t=>t+' → '+suggestedPrefix(t)).join(' · ')}.
       Der Antrag erzeugt einen internen Vorschlag und eine inaktive Flugzeugakte; keinen tatsächlichen Kaufvertrag.</small>
      <button type="submit" className="primaryButton">Flugzeugakte anlegen & Kennzeichen vergeben</button>
     </form>
    </aside>
   </div>
   <div className="commandLinks" style={{marginTop:24}}>
    <Link href="/rotation">Daily Flight Schedule →</Link><Link href="/maintenance">Maintenance Control →</Link>
    <Link href="/agent-control">Agentenbetrieb →</Link>
   </div>
  </>}
 </OpsShell>;
}
