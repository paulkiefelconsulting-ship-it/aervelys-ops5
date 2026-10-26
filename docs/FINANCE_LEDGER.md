# AERVELYS OPS 5.0 – Fiktives Double-Entry-Ledger

Stand 26. Oktober 2026. Datenbankmigration: 20261026082439_ops5_fictional_double_entry_ledger.sql.

## Funktionierender Hintergrundprozess
- Supabase Cron, jeden UTC-Tag 05:35 Uhr, unabhängig von ChatGPT und Browser.
- Erzeugt pro Organisation und UTC-Tag maximal einen nicht editierbaren Buchungsbeleg.
- Für jede bekannte Maschine wird ein fest definierter, **frei erfundener** täglicher Flottenhaltungsaufwand in EUR simuliert.
- Beispielparameter: Citation Longitude 360, CJ4 240, Phenom 300E 220, PC-24 210, Vision Jet G2 120 EUR pro Tag.
- Die fünf Aufwandzeilen werden durch eine Gegenbuchung auf das Konto «Fiktive offene Kosten» ausgeglichen.
- Solange keine Flugschlusssimulation existiert, werden keine Flüge, Charterumsätze oder Bankbewegungen aus Anfragen erzeugt.

## Technische Garantien
- Drei separate RLS-geschützte Tabellen in public: sim_ledger_accounts, sim_journals, sim_journal_lines.
- Nur lesbarer Zugriff für den verifizierten Organisations-Owner. Keine Schreibrechte für Web-Clients oder anonyme Zugriffe.
- Interne private Rate-Tabelle und Cron-Funktion, keine EXECUTE-Rechte für anon/authenticated.
- Composite-FKs schützen die organisationsbezogenen Journale, Konten, Buchungszeilen und Flugzeuge vor Cross-Tenant-Verweisen.
- Eine verzögerte PostgreSQL-Constraint-Trigger-Prüfung erzwingt Soll/Haben-Gleichheit und mindestens zwei positive Journalzeilen **beim Transaktions-Commit**. Fehlerhafte Transaktionen werden zurückgerollt.
- Triggersperren verbieten Updates und Deletes von bestehenden Journalen, Zeilen und Konten (append-only).
- Eindeutigkeit nach (organization, source_kind, source_day) verhindert Doppelbuchungen.
- Audit-Ereignisse für abgeschlossene tägliche Kostenläufe.
- Zusätzliche RLS-Leseansicht unter /finance-ledger.

## Ausgeführter Test
Für 2026-10-26 wurden 5 simulierte Aufwandzeilen und eine Gegenbuchung gespeichert, Soll 1.150 EUR, Haben 1.150 EUR. Wiederholter Lauf am selben Tag: 0 neue Journale. Authentifizierte Web-Clients dürfen weder schreiben noch die internen Funktionen ausführen. Alle Kostenannahmen sind vollständig fiktiv.

## Nicht implementiert
Kein echtes oder simuliertes Firmenbankkonto mit tatsächlichen Geldbewegungen, keine Überweisungen, keine Rechnungsstellung, kein Charterumsatz, kein Gehaltslauf, kein staatliches Rechnungswesen und keine Regelung von Zahlungen. Die bestehende Simulationsuhr für Flüge steht weiter still.

Nächste Phasen: unabhängige Wirtschaftsparameter, kontrollierte Simulation von Flugabschlüssen, per Flugbeleg erfasste Kosten und Einnahmen sowie ein virtuelles Konto- und Steuerungsmodell. Das Erscheinungsbild bleibt bewusst nachrangig.
