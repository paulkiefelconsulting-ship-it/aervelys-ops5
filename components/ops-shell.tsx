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
     {modules.filter(m=>m.section===section).map(m=><Link href={m.id==='simulation'?'/simulation':'/modules/'+m.id}
      className={active===m.id?'navActive':'navItem'} key={m.id}>{m.name}</Link>)}
     {section==='Flugbetrieb'&&<Link href="/positioning" className={active==='positioning'?'navActive':'navItem'}>Virtuelle Positionierung</Link>}
     {section==='Flugbetrieb'&&<Link href="/flight-simulator" className={active==='flight-simulator'?'navActive':'navItem'}>Virtuelle Flüge</Link>}
     {section==='Flugbetrieb'&&<Link href="/crew-scheduling" className={active==='crew-scheduling'?'navActive':'navItem'}>Crew Scheduling</Link>}
     {section==='Flugbetrieb'&&<Link href="/dispatch" className={active==='dispatch'?'navActive':'navItem'}>Dispatch Prüfung</Link>}
     {section==='Finanzen'&&<Link href="/finance-ledger" className={active==='finance-ledger'?'navActive':'navItem'}>Simulation Ledger</Link>}
     {section==='Commercial'&&<Link href="/pricing" className={active==='pricing'?'navActive':'navItem'}>Charter Kalkulation</Link>}
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
