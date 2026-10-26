import Link from 'next/link';
import OpsShell from '../../components/ops-shell';
import {requireWorkspace} from '../../lib/workspace';

export const dynamic='force-dynamic';

type Journal={id:string;source_day:string;source_kind:string;description:string;status:string;posted_at:string;simulation_only:boolean;shadow_outcome_id:string|null;positioning_leg_id:string|null};
type LedgerLine={id:string;journal_id:string;account_id:string;aircraft_id:string|null;side:'debit'|'credit';amount_eur:number|string;description:string;simulation_only:boolean};
type Account={id:string;code:string;title:string;class:string};
type Craft={id:string;registration:string};
const eur=(n:number)=>new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR'}).format(n);

export default async function FinanceLedgerPage(){
 const {supabase,organization}=await requireWorkspace();
 const [jr,ar,cr]=await Promise.all([
  supabase.from('sim_journals')
   .select('id,source_day,source_kind,description,status,posted_at,simulation_only,shadow_outcome_id,positioning_leg_id')
   .eq('organization_id',organization.id).order('source_day',{ascending:false}).limit(30),
  supabase.from('sim_ledger_accounts').select('id,code,title,class')
   .eq('organization_id',organization.id).order('code'),
  supabase.from('aircraft').select('id,registration')
   .eq('organization_id',organization.id)
 ]);
 const journals=(jr.data??[]) as Journal[];
 const journalIds=journals.map(x=>x.id);
 const linesResult=journalIds.length?await supabase.from('sim_journal_lines')
  .select('id,journal_id,account_id,aircraft_id,side,amount_eur,description,simulation_only')
  .eq('organization_id',organization.id).in('journal_id',journalIds)
  .order('created_at',{ascending:true}).limit(400):null;
 const lines=(linesResult?.data??[]) as LedgerLine[];
 const accounts=new Map(((ar.data??[]) as Account[]).map(a=>[a.id,a]));
 const aircraft=new Map(((cr.data??[]) as Craft[]).map(a=>[a.id,a.registration]));
 const debit=lines.filter(l=>l.side==='debit').reduce((s,l)=>s+Number(l.amount_eur),0);
 const credit=lines.filter(l=>l.side==='credit').reduce((s,l)=>s+Number(l.amount_eur),0);
 const expenseCodes=new Set(['FLEET_HOLDING_EXPENSE','SHADOW_CHARTER_EXPENSE','SHADOW_POSITIONING_EXPENSE']);
 const fictionalExpense=lines.filter(l=>l.side==='debit'&&expenseCodes.has(accounts.get(l.account_id)?.code??''))
  .reduce((sum,l)=>sum+Number(l.amount_eur),0);
 const fictionalRevenue=lines.filter(l=>l.side==='credit'&&accounts.get(l.account_id)?.code==='SHADOW_CHARTER_REVENUE')
  .reduce((sum,l)=>sum+Number(l.amount_eur),0);
 const liability=lines.filter(l=>l.side==='credit'&&accounts.get(l.account_id)?.code==='ACCRUED_SIM_LIABILITY')
  .reduce((sum,l)=>sum+Number(l.amount_eur),0);
 const incomplete=lines.length===400;
 const errors=jr.error||ar.error||cr.error||linesResult?.error;
 return <OpsShell active="finance-ledger">
  <header className="header"><div>
   <span className="eyebrow">FINANZEN · VOLLSTÄNDIG FIKTIVE SIMULATION</span>
   <h1>Simulation Ledger</h1>
   <p>Fiktive Soll-/Haben-Buchungen für Flottenhaltung, Flüge und interne virtuelle Zahlungen.</p>
  </div><span className="state">● Kein Zahlungsverkehr</span></header>
  <section className="moduleBanner">
   <strong>Diese Buchungen sind ausschließlich Simulationseinträge.</strong>
   <p>Die Kostensätze sind erfundene Annahmen und keine geprüften Aviation-Kostendaten.
    Ein täglicher Datenbankauftrag erfasst fiktive Flottenhaltungskosten um 05:35 UTC.
    Abgeschlossene virtuelle Charterflüge und Überführungen werden stündlich zur Minute 10
    als zusätzliche Modellbuchungen erfasst. Geplante Flüge und Charteranfragen
    erzeugen keinen Erlös. Getrennte interne Treasury-Buchungen modellieren
    virtuelle Ein- und Auszahlungen; es gibt keine echte Bank und keinen Zahlungsauftrag.</p>
  </section>
  <section className="commandLinks">
   <Link href="/economics">Virtuelle Flugwirtschaft →</Link>
   <Link href="/pricing">Charter-Kalkulationen →</Link>
   <Link href="/simulation">Automatische Nachfrage →</Link>
   <Link href="/treasury">Virtuelles Bankkonto →</Link>
  </section>
  {errors?<div className="emptyState" role="alert">
    Journal konnte nicht vollständig geladen werden. Berechtigungen und Datenbankzugriff prüfen.
  </div>:<>
   <section className="ledgerSummary" aria-label="Simulierte Buchungsübersicht">
    <div className="ledgerMetric"><span>Journale (letzte 30)</span><strong>{journals.length}</strong></div>
    <div className="ledgerMetric"><span>Fiktiver Erlös (angezeigt)</span><strong>{eur(fictionalRevenue)}</strong></div>
    <div className="ledgerMetric"><span>Fiktive Aufwendungen (angezeigt)</span><strong>{eur(fictionalExpense)}</strong></div>
    <div className="ledgerMetric"><span>Soll/Haben-Differenz (angezeigt)</span><strong>{eur(debit-credit)}</strong></div>
   </section>
   {incomplete&&<p className="ledgerWarning" role="status">Mehr als 400 Buchungszeilen vorhanden:
    Die angezeigten Summen sind unvollständig und nicht als Gesamtwerte verwendbar.</p>}
   <section className="moduleBanner">
    <strong>Buchungsregel · feste Simulationssätze pro Flugzeugtyp</strong>
    <p>Citation Longitude 360 € · Citation CJ4 240 € · Phenom 300E 220 € ·
     PC-24 210 € · Vision Jet G2 120 € je Tag. Bei abgeschlossenen virtuellen
     Flügen kommen fiktive Chartererlöse, Flugkosten und Positionierungskosten hinzu.
     Alle Belege bleiben getrennt von Bankkonten und sind unveränderlich.
     Die angezeigten offenen Modellkosten betragen {eur(liability)}.</p>
   </section>
   <div className="sectionHeader"><div><h2>Journalverlauf</h2>
    <p>Append-only: ein Flottenjournal je UTC-Tag und ein Beleg je abgeschlossenem virtuellem Flug oder Positionierung.</p>
   </div><span>{journals.length} angezeigt</span></div>
   {journals.length===0?<div className="emptyState">Noch keine fiktiven Buchungen gespeichert.</div>:
    journals.map(j=>{
     const rows=lines.filter(l=>l.journal_id===j.id);
     const d=rows.filter(l=>l.side==='debit').reduce((s,l)=>s+Number(l.amount_eur),0);
     const c=rows.filter(l=>l.side==='credit').reduce((s,l)=>s+Number(l.amount_eur),0);
     return <article className="workspacePanel ledgerJournal" key={j.id}>
      <div className="ledgerJournalTop">
       <div><h3>{j.source_day} · {j.source_kind==='fictional_daily_fleet_holding'?'Fiktive Flottenhaltung':
        j.source_kind==='shadow_charter_completion'?'Virtueller Charterabschluss':
        j.source_kind==='shadow_positioning_completion'?'Virtuelle Positionierung':
        j.source_kind==='shadow_treasury_opening'?'Virtuelles Startkapital':
        j.source_kind==='shadow_treasury_receipt'?'Virtueller Zahlungseingang':
        j.source_kind==='shadow_treasury_payment'?'Virtuelle Kostenbegleichung':'Sonstiger Simulationsbeleg'}</h3>
        <small>{j.description}</small></div>
       <div><span className="ledgerLabel">Simuliert und verbucht</span>
        <div className="ledgerBalance">Soll {eur(d)} / Haben {eur(c)}</div></div>
      </div>
      <div className="tableScroll"><table className="dataTable">
       <thead><tr><th>Flugzeug</th><th>Konto</th><th>Buchungsart</th><th>Betrag</th></tr></thead>
       <tbody>{rows.map(l=><tr key={l.id}>
        <td>{l.aircraft_id?aircraft.get(l.aircraft_id)??'Flugzeug-ID unbekannt':'Gesamtkonto'}</td>
        <td>{accounts.get(l.account_id)?.title??'Kontonummer unbekannt'}</td>
        <td>{l.side==='debit'?'Soll':'Haben'}</td>
        <td>{eur(Number(l.amount_eur))}</td>
       </tr>)}</tbody>
      </table></div>
      <p className="panelNote">{rows.length>=2&&Math.abs(d-c)<0.005?'Buchung ausgeglichen.':'Journal unvollständig oder nicht ausgeglichen.'} Keine tatsächliche Zahlung.</p>
     </article>;
    })}
  </>}
  <p className="scenarioNotice" style={{marginTop:20}}>
   Virtuelle Abschlussbuchungen werden ausschließlich nach abgeschlossenen
   Shadow-Flügen und -Positionierungen erzeugt. Noch nicht vorhanden sind
   echte Banktransaktionen, Rechnungen, Steuern und Gehaltsläufe. Das interne
   virtuelle Treasury hat keine Verbindung zu Zahlungsdienstleistern.
  </p>
 </OpsShell>;
}
