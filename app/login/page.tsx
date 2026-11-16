import {login} from '../auth/actions';
import {isSupabaseConfigured} from '../../lib/supabase/config';

export const dynamic='force-dynamic';
export default async function LoginPage({searchParams}:{
 searchParams:Promise<{error?:string}>
}){
 const {error}=await searchParams;
 const ready=isSupabaseConfigured();
 return <main className="aerLogin">
  <section className="aerLoginVisual" aria-label="AERVELYS Business Aviation">
   <div className="aerLoginIdentity"><span className="aerLogo">A</span>
    <span className="aerWordmark">AERVELYS<small>BUSINESS AVIATION</small></span>
   </div>
   <div className="aerVisualContent">
    <span className="aerOverline"><span className="aerLine"/> PRIVATE AVIATION · REIMAGINED</span>
    <h1>Beyond<br/>the ordinary.</h1>
    <p>Eine Airline. Unzählige Möglichkeiten.<br/>Dein digitales Operations Control Center.</p>
   </div>
   <div className="aerVisualFoot"><span>EDAZ · SCHÖNHAGEN</span><span>SIMULATION ENVIRONMENT</span></div>
  </section>
  <section className="aerLoginSide">
   <div className="aerLoginTop"><span>AERVELYS <b>OPS</b></span><span className="aerLoginSecure">PRIVATE ACCESS</span></div>
   <div className="aerLoginCard">
    <span className="aerSectionLabel">OPERATIONS PORTAL</span>
    <h2>Willkommen<br/>zurück.</h2>
    <p className="aerLoginSub">Melde dich an, um deine Airline zu verwalten.</p>
    {!ready&&<div className="aerSetupNotice" role="status">
     <strong>Einrichtung erforderlich</strong>
     <span>Die Supabase-Verbindung wurde für dieses Hosting noch nicht konfiguriert. Bitte die Projektvariablen in Vercel hinterlegen.</span>
    </div>}
    {ready&&error==='invalid'&&<div className="aerSetupNotice" role="alert">Anmeldung fehlgeschlagen. Bitte prüfe E-Mail, Passwort und Kontofreigabe.</div>}
    {ready&&error==='setup'&&<div className="aerSetupNotice" role="alert">Die Datenbankverbindung ist noch nicht eingerichtet.</div>}
    <form action={login} className="aerLoginForm">
     <label htmlFor="email">E-Mail-Adresse</label>
     <input id="email" name="email" type="email" autoComplete="username" placeholder="name@unternehmen.de" required disabled={!ready}/>
     <label htmlFor="password">Passwort</label>
     <input id="password" name="password" type="password" autoComplete="current-password" placeholder="Dein Passwort" minLength={6} required disabled={!ready}/>
     <button type="submit" disabled={!ready}>Zum Command Center <span aria-hidden="true">↗</span></button>
    </form>
    <p className="aerLoginHint">Zugang nur für berechtigte Benutzer. Keine öffentliche Registrierung.</p>
   </div>
   <div className="aerLoginBottom"><span>© AERVELYS</span><span>Virtual Airline Management</span></div>
  </section>
 </main>;
}
