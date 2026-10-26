# AERVELYS OPS 5.0 – Automatische virtuelle Flugwirtschaft

**Datenstand:** 26. Oktober 2026.
**Migration:** `20261026164029_ops5_shadow_completion_double_entry_accounting.sql`.

## Funktionsumfang

- Supabase-Cron führt zur Minute 10 jeder Stunde eine serverinterne Abrechnung durch. Die stündliche Shadow-Flugsimulation läuft zur Minute 0.
- Nur abgeschlossene virtuelle Charterflüge mit positiven fiktiven Kosten und Erlösen führen zu einer 4-zeiligen Soll-/Haben-Buchung.
- Nur abgeschlossene virtuelle Überführungen mit dokumentierter Landung und positiven fiktiven Kosten führen zu einer 2-zeiligen Soll-/Haben-Buchung.
- Geplante, unterwegs befindliche und blockierte Szenarien werden nicht gebucht.
- Pro abgeschlossenem Szenario existiert höchstens ein Journal. Unique-Indizes schützen vor Wiederholung und zusammengesetzte Foreign Keys sichern die Organisationszugehörigkeit.
- Die bestehende verzögerte Integritätsprüfung erzwingt ausgeglichene Soll-/Haben-Journale; Einträge bleiben append-only.
- Bestehende tägliche Flottenhaltungskosten bleiben idempotent und funktionsfähig.
- Der neue Bereich `/economics` zeigt abgeschlossene Flüge, Positionierungen und Buchungsstatus. `/finance-ledger` zeigt alle Journaltypen.

## Integrationstests am 26.10.2026

- Virtueller Charterflug EDAZ–LIML: fiktiver Erlös 8.020 EUR, fiktive Kosten 4.810 EUR, 4 Journalzeilen, Soll=Haben.
- Vor Abschluss einer virtuellen Überführung wurde kein Aufwand gebucht. Nach virtueller Landung LIML–EDAZ wurden 3.795 EUR in zwei ausgeglichenen Zeilen gebucht.
- Zweiter virtueller Charterabschluss erzeugte ein separates Journal.
- Wiederholung erzeugte null Doppelbuchungen.
- Bisherige Flottenhaltung für denselben UTC-Tag erneut ausgeführt: null Doppelbuchungen.
- Alle Zukunftsszenarien und zusätzlichen Journale wurden in einer PostgreSQL-Subtransaktion zurückgerollt. Der aktive Datenstand bleibt ohne verbuchte virtuelle Charter- oder Positionierungsabschlüsse, bis die Szenarien tatsächlich von der Datenbankuhr verarbeitet werden.

## Grenzen

Alle Beträge sind **frei erfundene Szenarioannahmen**, weder realisierter Umsatz noch echte Zahlung oder Kundenforderung. Keine operative Flug-, Wartungs- oder Crewfreigabe. Keine Bankbewegungen, Rechnungen, Steuern oder Payroll. Die generative KI-Agentensteuerung ist noch nicht implementiert.