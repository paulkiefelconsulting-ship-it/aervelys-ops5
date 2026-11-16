import Link from 'next/link';
import './public-home.css';

const aircraft=[
 {registration:'D-CJPK',type:'Cessna Citation CJ4'},
 {registration:'D-CPLK',type:'Pilatus PC-24'},
 {registration:'D-CPHE',type:'Embraer Phenom 300E'},
 {registration:'D-BLNG',type:'Cessna Citation Longitude'},
 {registration:'N551VG',type:'Cirrus Vision Jet G2'},
 {registration:'D-CKPX',type:'Cessna Citation X'},
 {registration:'D-CHPK',type:'Hawker 800XP'}
];
export default function PublicHome(){
 return <main className="publicAervelys">
  <header className="publicTop">
   <Link href="/" className="publicIdentity" aria-label="AERVELYS Startseite">
    <img src="/brand/aervelys-mark.svg" width="47" height="47" alt=""/>
    <span>AERVELYS<small>BUSINESS AVIATION</small></span>
   </Link>
   <nav aria-label="Öffentliche Navigation">
    <a href="#fleet">Flotte</a><a href="#operations">Operations</a>
    <Link className="publicOperator" href="/login">Geschützter Verwaltungszugang <span aria-hidden="true">↗</span></Link>
   </nav>
  </header>
  <section className="publicHero">
   <div className="publicHeroText">
    <span className="publicEyebrow">VIRTUAL BUSINESS AVIATION · SCHÖNHAGEN</span>
    <h1>Your airline.<br/><em>Your horizon.</em></h1>
    <p>Willkommen bei AERVELYS. Ein eigenständiges, virtuelles Business-Aviation-Unternehmen mit Chartergeschäft, Flottenmanagement und Operations.</p>
    <div className="publicHeroActions">
     <a href="#fleet" className="publicPrimaryAction">Flotte ansehen <span aria-hidden="true">↗</span></a>
     <a href="#operations" className="publicSecondaryAction">Das System entdecken</a>
    </div>
    <p className="publicDisclaimer">Öffentliche Vorschau · Kein Zugang zu internen Unternehmensakten oder Kundeninformationen.</p>
   </div>
   <div className="publicHeroArtwork" aria-hidden="true">
    <div className="publicArtworkRing"></div>
    <img src="/brand/aervelys-mark.svg" alt="" width="480" height="480"/>
    <div className="publicArtworkCaption">AERVELYS / PRIVATE AVIATION</div>
   </div>
  </section>
  <section className="publicSection" id="fleet">
   <div className="publicSectionHead"><div>
    <span className="publicEyebrow">AIRCRAFT REGISTRY</span>
    <h2>Unsere virtuelle Flotte.</h2>
    <p>Sieben dokumentierte Flugzeuge, die den Kern von AERVELYS bilden.</p>
   </div><span className="publicCount">07 / AIRCRAFT</span></div>
   <div className="publicAircraftList">{aircraft.map(a=><div className="publicAircraft" key={a.registration}>
    <strong>{a.registration}</strong><span>{a.type}</span><span className="publicAircraftMeta">VIRTUELLE FLOTTE</span>
   </div>)}</div>
   <p className="publicSmall">Die angegebenen Kennzeichen sind Teil unserer virtuellen Airline-Simulation und keine amtliche Registerauskunft.</p>
  </section>
  <section className="publicSection publicOperations" id="operations">
   <div><span className="publicEyebrow">AERVELYS OPERATIONS</span><h2>Ein Betrieb.<br/>Viele Prozesse.</h2>
    <p>Das interne Control Center vereint simulierte Charteranfragen, Sales, Dispatch, Crew, Wartung und Flugplanung. Die geschützten Unternehmensdaten sind nicht öffentlich abrufbar.</p>
   </div>
   <div className="publicOperationsList">
    <span>01 <strong>Charter & Sales</strong></span>
    <span>02 <strong>Fleet & Dispatch</strong></span>
    <span>03 <strong>Crew & Operations</strong></span>
    <span>04 <strong>Simulation & Finance</strong></span>
   </div>
  </section>
  <footer className="publicFooter"><img src="/brand/aervelys-wordmark.svg" alt="AERVELYS Business Aviation" width="210" height="34"/><span>© AERVELYS · Virtuelle Business-Airline · Keine echten Charterbuchungen</span></footer>
 </main>;
}
