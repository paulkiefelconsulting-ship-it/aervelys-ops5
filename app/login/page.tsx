import { login } from '../auth/actions';
import { isSupabaseConfigured } from '../../lib/supabase/config';

export const dynamic = 'force-dynamic';

export default async function LoginPage({
  searchParams,
}: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const ready = isSupabaseConfigured();
  return (
    <main className="loginShell">
      <div className="loginBrand"><span className="brandMark">A</span><span>AERVELYS<small>OPS 5.0</small></span></div>
      <div className="loginPanel">
        <span className="eyebrow">GESCHÜTZTE UNTERNEHMENSPLATTFORM</span>
        <h1>Willkommen zurück.</h1>
        <p className="loginIntro">Melden Sie sich mit Ihrem von der Geschäftsführung freigegebenen Supabase-Auth-Konto an.</p>
        {!ready && <div className="authNotice" role="status">Die neue Supabase-Verbindung ist noch nicht in der Hosting-Umgebung konfiguriert. Eine Anmeldung ist derzeit nicht möglich.</div>}
        {ready && error === 'invalid' && <div className="authNotice" role="alert">Anmeldung fehlgeschlagen. Prüfen Sie Ihre Zugangsdaten und die Freischaltung Ihres Kontos.</div>}
        {ready && error === 'setup' && <div className="authNotice" role="alert">Die Verbindung ist noch nicht eingerichtet.</div>}
        <form action={login} className="loginForm">
          <label htmlFor="email">E-Mail-Adresse</label>
          <input id="email" name="email" type="email" autoComplete="username" required placeholder="geschäftliche E-Mail" disabled={!ready} />
          <label htmlFor="password">Passwort</label>
          <input id="password" name="password" type="password" autoComplete="current-password" required minLength={6} disabled={!ready} />
          <button type="submit" className="primaryButton" disabled={!ready}>Sicher anmelden</button>
        </form>
        <p className="loginFoot">Nur autorisierte Nutzer. Keine öffentliche Registrierung. Keine realen Flug- oder Zahlungsvorgänge.</p>
      </div>
    </main>
  );
}
