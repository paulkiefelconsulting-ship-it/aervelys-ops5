import Link from 'next/link';
import type {ReactNode} from 'react';
import {modules,moduleSections} from '../lib/modules';
import {logout} from '../app/auth/actions';

export default function OpsShell({active,children}:{active:string;children:ReactNode}){
 return <div className="shell">
  <aside className="sidebar">
   <Link className="brand" href="/"><span className="brandMark">A</span><span>AERVELYS<small>OPS 5.0</small></span></Link>
   <div className="navLabel">PLATTFORM</div>
   <nav className="opsNav" aria-label="Bereiche">
    <Link href="/" className={active==='overview'?'navActive':'navItem'}>▦ &nbsp; Overview</Link>
    {moduleSections.map(section=><div key={section}>
     <p className="navSection">{section}</p>
     {modules.filter(m=>m.section===section).map(m=><Link href={'/modules/'+m.id}
      className={active===m.id?'navActive':'navItem'} key={m.id}>{m.name}</Link>)}
    </div>)}
   </nav>
   <div className="sideFooter">Entwicklungsbetrieb · keine Betriebsfreigabe</div>
  </aside>
  <main className="content">
   <div className="topBar"><span className="eyebrow">AERVELYS · COMMAND CENTER</span>
    <form action={logout}><button type="submit" className="signoutButton">Abmelden</button></form></div>
   {children}
   <footer>© AERVELYS OPS 5.0 · Simulationssystem · Keine realen Flüge, Zahlungen oder Buchungen</footer>
  </main>
 </div>;
}
