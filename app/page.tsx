import { redirect } from 'next/navigation';
import { modules } from '../lib/modules';
import { isSupabaseConfigured } from '../lib/supabase/config';
import { createClient } from '../lib/supabase/server';
import { logout } from './auth/actions';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  if (!isSupabaseConfigured()) redirect('/login?error=setup');
  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) redirect('/login');

  // RLS in Postgres enforces owner_user_id = auth.uid(). Do not use a client-supplied organization ID.
  const { data: organization, error: orgError } = await supabase
    .from('organizations')
    .select('id, name, currency')
    .eq('owner_user_id', auth.user.id)
    .maybeSingle();

  const areas = ['Operations', 'Crew & Fleet', 'Commercial', 'Finance', 'Management', 'Platform'] as const;
  const organizationReady = Boolean(organization && !orgError);
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand"><span className="brandMark">A</span><span>AERVELYS<small>OPS 5.0</small></span></div>
        <div className="navLabel">PLATTFORM</div>
        <nav aria-label="Bereiche">
          <div className="navActive">▦ &nbsp; Overview</div>
          {areas.map(area => <div className="navItem" key={area}>{area}</div>)}
        </nav>
        <div className="sideFooter">Greenfield / Entwicklungsstand<br />Keine Produktivfreigabe</div>
      </aside>
      <main className="content">
        <div className="eyebrow">AERVELYS · COMMAND CENTER</div>
        <header className="header">
          <div><h1>Operations Platform <em>5.0</em></h1><p>Geschützter Entwicklungsbereich der virtuellen Business-Aviation-Gesellschaft.</p></div>
          <form action={logout}><button type="submit" className="signoutButton">Abmelden</button></form>
        </header>
        <section className="hero">
          <span className="eyebrow">SYSTEMSTATUS · ENTWICKLUNG</span>
          <h2>{organizationReady ? organization!.name : 'Zugriff noch nicht freigegeben'}</h2>
          <p>{organizationReady
            ? 'Die Anmeldung wurde geprüft und Ihre Organisation über die neue Supabase-Datenbank geladen. Operative Module sind noch nicht aktiviert.'
            : orgError
              ? 'Die Anmeldung ist erfolgreich, aber die Organisation konnte nicht geladen werden. Prüfen Sie die Datenbankverbindung und Zugriffsrichtlinien.'
              : 'Die Anmeldung ist erfolgreich. Für dieses Konto wurde noch keine AERVELYS-Organisation durch die Administration zugeordnet.'}</p>
          <div className="meta">
            <span>Identität: authentifiziert</span>
            <span>Organisation: {organizationReady ? 'zugeordnet' : 'nicht verfügbar'}</span>
            <span>Flugbetrieb: nicht freigegeben</span>
          </div>
        </section>
        <div className="sectionHeader">
          <div><h2>Systemarchitektur</h2><p>Geplante Funktionsmodule – noch nicht betriebsbereit.</p></div>
          <span>{modules.length} Module</span>
        </div>
        <section className="modules">
          {modules.map((module, index) => <article className="module" key={module.id}>
            <div className="moduleTop"><span className="moduleNumber">{String(index + 1).padStart(2, '0')}</span><span className="planned">Geplant</span></div>
            <h3>{module.name}</h3><p>{module.description}</p>
          </article>)}
        </section>
        <footer>© AERVELYS OPS 5.0 · Simulationssystem · Keine realen Buchungen oder Finanztransaktionen</footer>
      </main>
    </div>
  );
}
