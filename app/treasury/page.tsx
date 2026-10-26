import Link from 'next/link';
import OpsShell from '../../components/ops-shell';
import {requireWorkspace} from '../../lib/workspace';

export const dynamic='force-dynamic';
type Account={id:string;display_name:string;currency:string;balance_eur:string|number;simulation_only:boolean;updated_at:string};
type Movement={
 id:string;source_journal_id:string|null;kind:string;direction:'in'|'out';
 amount_eur:string|number;balance_after_eur:string|number;description:string;
 created_at:string;simulation_only:boolean;
};
const eur=(n:string|number)=>new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR'}).format(Number(n));
const time=(s:string)=>new Date(s).toLocaleString('de-DE',{
 timeZone:'UTC',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})+' UTC';
const kinds:Record<string,string>={
 fictional_opening_capital:'Fiktives Startkapital',
 fictional_charter_receipt:'Virtuelle Charterzahlung',
 fictional_cost_payment:'Virtuelle Kostenbegleichung'
};

export default async function TreasuryPage(){
 const {supabase,organization}=await requireWorkspace();
 const [accountResult,movementsResult]=await Promise.all([
  supabase.from('shadow_treasury_accounts')
   .select('id,display_name,currency,balance_eur,simulation_only,updated_at')
   .eq('organization_id',organization.id).maybeSingle(),
  supabase.from('shadow_treasury_movements')
   .select('id,source_journal_id,kind,direction,amount_eur,balance_after_eur,description,created_at,simulation_only')
   .eq('organization_id',organization.id)
   .order('created_at',{ascending:false}).limit(150)
 ]);
 const account=accountResult.data as Account|null;
 const movements=(movementsResult.data??[]) as Movement[];
 const receipts=movements.filter(m=>m.direction==='in');
 const payments=movements.filter(m=>m.direction==='out');
 const inTotal=receipts.reduce((s,m)=>s+Number(m.amount_eur),0);
 const outTotal=payments.reduce((s,m)=>s+Number(m.amount_eur),0);
 const hasError=accountResult.error||movementsResult.error;
 return <OpsShell active="treasury">
  <header className="header"><div>
   <span className="eyebrow">FINANZEN · VOLLSTÄNDIG VIRTUELLES BANKING</span>
   <h1>Simulation Treasury</h1>
   <p>Automatische fiktive Kontobewegungen, Forderungseingänge und Kostenbegleichungen.</p>
  </div><span className="state">● Kein echtes Bankkonto</span></header>
  <section className="moduleBanner">
   <strong>Nur eine interne Rechenwelt – keine Bankverbindung und keine echten Zahlungen.</strong>
   <p>Das Treasury verwendet ausdrücklich erfundene 250.000 € Startkapital.
    Jede simulierte Bewegung stammt aus einem zuvor gebuchten Modellbeleg.
    Nur abgeschlossene virtuelle Charterflüge erzeugen fiktive Zahlungseingänge.
    Offene Modellkosten werden nur beglichen, wenn genügend fiktives Guthaben vorhanden ist.
    Die Engine läuft stündlich um Minute 20, unabhängig von deiner Anmeldung.</p>
  </section>
  <section className="commandLinks">
   <Link href="/finance-ledger">Soll-/Haben-Buchungen →</Link>
   <Link href="/economics">Virtuelle Flugwirtschaft →</Link>
   <Link href="/flight-simulator">Virtuelle Flüge →</Link>
  </section>
  {hasError?<p className="emptyState" role="alert">
    Das virtuelle Konto konnte nicht vollständig geladen werden. Bitte Datenbankzugriff prüfen.
   </p>:!account?<p className="emptyState">
    Noch kein virtuelles Treasury eingerichtet. Der serverseitige Hintergrundjob legt es beim nächsten Lauf an.
   </p>:<>
    <section className="ledgerSummary" aria-label="Fiktiver Treasury-Überblick">
     <div className="ledgerMetric"><span>Fiktives Kontoguthaben</span><strong>{eur(account.balance_eur)}</strong></div>
     <div className="ledgerMetric"><span>Virtuelle Eingänge (angezeigt)</span><strong>{eur(inTotal)}</strong></div>
     <div className="ledgerMetric"><span>Virtuelle Ausgänge (angezeigt)</span><strong>{eur(outTotal)}</strong></div>
     <div className="ledgerMetric"><span>Angezeigte Bewegungen</span><strong>{movements.length}</strong></div>
    </section>
    <section className="moduleBanner">
     <strong>{account.display_name}</strong>
     <p>Währung: {account.currency} · Rein simuliert · Letzte Fortschreibung:
      {' '}{time(account.updated_at)}. Alle Bewegungen sind unveränderlich und
      stehen in Verbindung mit separaten, ausgeglichenen Simulationsjournalen.</p>
    </section>
    {movements.length===150&&<p className="ledgerWarning">
      Die Bewegungsliste ist auf 150 Einträge begrenzt. Die summierten Eingänge
      und Ausgänge gelten nur für die angezeigte Auswahl, nicht für die gesamte Historie.
     </p>}
    <div className="sectionHeader"><div><h2>Virtuelle Kontobewegungen</h2>
     <p>Jede Bewegung ist ein ausschließlich internes Modellereignis ohne Bankauftrag.</p>
    </div></div>
    {movements.length===0?<p className="emptyState">Noch keine simulierten Kontobewegungen gespeichert.</p>:
     <div className="workspacePanel">
      <div className="tableScroll"><table className="dataTable">
       <thead><tr><th>Zeitpunkt (UTC)</th><th>Vorgang</th><th>Art</th><th>Betrag</th><th>Fiktiver Kontostand danach</th><th>Quelle</th></tr></thead>
       <tbody>{movements.map(m=><tr key={m.id}>
        <td>{time(m.created_at)}</td>
        <td>{kinds[m.kind]??m.kind}</td>
        <td>{m.direction==='in'?'Virtueller Eingang':'Virtueller Ausgang'}</td>
        <td>{m.direction==='in'?'+':'−'}{eur(m.amount_eur)}</td>
        <td>{eur(m.balance_after_eur)}</td>
        <td>{m.source_journal_id?'Simulationsjournal':'Startparameter'}</td>
       </tr>)}</tbody>
      </table></div>
     </div>}
   </>}
  <p className="scenarioNotice" style={{marginTop:22}}>
   Diese Ansicht zeigt keinen Geldbestand bei einer Bank. Es gibt keine IBAN,
   keine Zahlungs-API, keine realen Kundenüberweisungen und keine tatsächlichen
   Verbindlichkeiten. Nicht vorhandene oder ungedeckte Modellzahlungen werden nicht erfunden.
  </p>
 </OpsShell>;
}
