import Link from 'next/link';
import {redirect} from 'next/navigation';
import {modules} from '../lib/modules';
import {isSupabaseConfigured} from '../lib/supabase/config';
import {createClient} from '../lib/supabase/server';
import OpsShell from '../components/ops-shell';

export const dynamic='force-dynamic';
export default async function HomePage(){
 if(!isSupabaseConfigured())redirect('/login?error=setup');
 const supabase=await createClient();
 const {data:auth,error:authError}=await supabase.auth.getUser();
 if(authError||!auth.user)redirect('/login');
 const {data:organization,error:orgError}=await supabase.from('organizations')
  .select('id,name,currency').eq('owner_user_id',auth.user.id).maybeSingle();
 const ready=Boolean(organization&&!orgError);
 const stats: {label:string;count:number}[]=[];
 if(organization){
  for(const [table,label] of [
   ['aircraft','Flugzeuge'],['employees','Mitarbeiter'],['customers','Kunden'],
   ['charter_requests','Charterentwürfe'],['flight_plans','Flugentwürfe']
  ]){
   const {count}=await supabase.from(table).select('id',{count:'exact',head:true})
    .eq('organization_id',organization.id);
   stats.push({label,count:count??0});
  }
 }
 return <OpsShell active="overview">
  <header className="header"><div><h1>Operations Platform <em>5.0</em></h1>
   <p>Geschütztes Command Center der virtuellen Business-Aviation-Gesellschaft.</p></div>
   <span className="state">● Entwicklungsbetrieb</span></header>
  <section className="hero">
   <span className="eyebrow">ORGANISATION · SYSTEMSTATUS</span>
   <h2>{ready?organization!.name:'Organisation nicht freigegeben'}</h2>
   <p>{ready?'Anmeldung und Organisationszuordnung geprüft. Die Module ermöglichen die Erfassung von Entwürfen in der neuen Supabase-Datenbank, ohne operative Ausführung.':
    'Kein Zugriff auf Unternehmensdaten. Wende dich an die Administration.'}</p>
   <div className="meta"><span>Identität: authentifiziert</span>
    <span>Organisation: {ready?'zugeordnet':'nicht verfügbar'}</span>
    <span>Flugbetrieb: nicht freigegeben</span></div>
  </section>
  {ready&&<section className="kpiGrid" aria-label="Bestandsübersicht">
   {stats.map(x=><div className="kpi" key={x.label}><span>{x.label}</span><strong>{x.count}</strong></div>)}
  </section>}
  {ready&&<section className="commandLinks">
   <Link href="/dispatch">Dispatch-Prüfungen ansehen →</Link>
   <Link href="/crew-scheduling">Crew-Screenings ansehen →</Link>
   <Link href="/pricing">Charter-Kalkulation ansehen →</Link>
   <Link href="/simulation">Autonome Nachfrage ansehen →</Link>
  </section>}
  <div className="sectionHeader"><div><h2>Funktionsbereiche</h2>
   <p>14 Entwurfsbereiche und zwei Leseansichten. Betriebsfreigaben bleiben gesperrt.</p></div>
   <span>{modules.length} Module</span></div>
  {ready?<section className="modules">
   {modules.map((m,i)=><Link href={m.id==='simulation'?'/simulation':'/modules/'+m.id} className="module moduleLink" key={m.id}>
    <div className="moduleTop"><span className="moduleNumber">{String(i+1).padStart(2,'0')}</span>
     <span className="planned">{m.readonly?'Nur lesen':'Entwürfe'}</span></div>
    <h3>{m.name}</h3><p>{m.description}</p><span className="moduleOpen">Bereich öffnen →</span>
   </Link>)}
  </section>:<p className="emptyState">Die Bereiche sind ohne Organisationsfreigabe nicht verfügbar.</p>}
 </OpsShell>;
}
