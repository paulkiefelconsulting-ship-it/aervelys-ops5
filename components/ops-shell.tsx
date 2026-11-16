import Link from 'next/link';
import type {ReactNode} from 'react';
import {modules} from '../lib/modules';
import {logout} from '../app/auth/actions';

const primary=[
 {href:'/',label:'Übersicht',id:'overview'},
 {href:'/fleet',label:'Flotte',id:'fleet-registry'},
 {href:'/rotation',label:'Flugplan',id:'rotation'},
 {href:'/sales-autopilot',label:'Charter & Vertrieb',id:'sales-autopilot'},
 {href:'/agent-control',label:'Agent Control',id:'agent-control'},
 {href:'/crew-mobility',label:'Crew Planning',id:'crew-mobility'}
];
const groups=[
 {name:'Flugbetrieb',items:[['/dispatch','Dispatch','dispatch'],['/maintenance','Maintenance','maintenance'],['/flight-simulator','Virtuelle Flüge','flight-simulator'],['/positioning','Positionierung','positioning'],['/crew-travel','Crew Travel','crew-travel'],['/crew-scheduling','Crew Scheduling','crew-scheduling'],['/duty-rest','Duty & Rest','duty-rest'],['/crew-locations','Crew Locations','crew-locations'],['/shadow-crew','Crew Control','shadow-crew']]},
 {name:'Commercial & Finance',items:[['/pricing','Charter Pricing','pricing'],['/treasury','Treasury','treasury'],['/economics','Flugwirtschaft','economics'],['/finance-ledger','Buchhaltung','finance-ledger'],['/simulation','Virtuelle Nachfrage','simulation']]},
 {name:'Administration',items:[['/agent-lab','Agent Lab','agent-lab'],...modules.filter(m=>!['simulation','observability'].includes(m.id)).map(m=>['/modules/'+m.id,m.name,m.id])]}
];
export default function OpsShell({active,children}:{active:string;children:ReactNode}){
 return <div className="shell">
  <aside className="sidebar">
   <Link className="brand" href="/"><span className="brandMark">A</span><span>AERVELYS<small>OPERATIONS</small></span></Link>
   <div className="navLabel">WORKSPACE</div>
   <nav className="opsNav" aria-label="Bereiche">
    {primary.map(item=><Link key={item.href} href={item.href} className={active===item.id?'navActive':'navItem'}>{item.label}</Link>)}
    {groups.map(g=><details className="navGroup" key={g.name} open={g.items.some(item=>item[2]===active)}>
     <summary>{g.name}</summary>
     {g.items.map(item=><Link key={item[0]} href={item[0]} className={active===item[2]?'navActive':'navItem'}>{item[1]}</Link>)}
    </details>)}
   </nav>
   <div className="sideFooter">Virtuelle Airline · Simulationsdaten</div>
  </aside>
  <main className="content">
   <div className="topBar"><span className="eyebrow">AERVELYS / OPS CONTROL</span>
    <form action={logout}><button type="submit" className="signoutButton">Abmelden</button></form></div>
   {children}
   <footer>© AERVELYS · Virtuelles Business Aviation Management · Keine realen Flüge, Zahlungen oder Buchungen</footer>
  </main>
 </div>;
}
