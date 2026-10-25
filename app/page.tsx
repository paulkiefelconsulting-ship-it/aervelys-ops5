import { modules } from '../lib/modules';
export const dynamic = 'force-static';

export default function Home() {
  const areas = ['Operations', 'Crew & Fleet', 'Commercial', 'Finance', 'Management', 'Platform'] as const;
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
          <div><h1>Operations Platform <em>5.0</em></h1><p>Das Fundament für eine autonome virtuelle Business-Aviation-Gesellschaft.</p></div>
          <span className="state">● Entwicklungsphase P1</span>
        </header>
        <section className="hero">
          <span className="eyebrow">SYSTEMSTATUS</span>
          <h2>Ein neues Kapitel beginnt.</h2>
          <p>Die neue Anwendung wird unabhängig vom Altbetrieb entwickelt. Es werden keine operativen Flüge, Mitarbeiteraktionen oder Finanztransaktionen vorgetäuscht.</p>
          <div className="meta"><span>Codebasis: eingerichtet</span><span>Neue Supabase-DB: noch nicht verbunden</span><span>Betrieb: nicht freigegeben</span></div>
        </section>
        <div className="sectionHeader"><div><h2>Systemarchitektur</h2><p>Geplante Funktionsmodule – noch nicht betriebsbereit.</p></div><span>{modules.length} Module</span></div>
        <section className="modules">
          {modules.map((module,index) => <article className="module" key={module.id}>
            <div className="moduleTop"><span className="moduleNumber">{String(index+1).padStart(2,'0')}</span><span className="planned">Geplant</span></div>
            <h3>{module.name}</h3><p>{module.description}</p>
          </article>)}
        </section>
        <footer>© AERVELYS OPS 5.0 · Simulationssystem · Keine realen Buchungen oder Finanztransaktionen</footer>
      </main>
    </div>
  );
}
