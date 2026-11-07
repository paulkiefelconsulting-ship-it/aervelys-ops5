# AERVELYS OPS 5.0 – Crew Location Evidence Ledger

Stand: 07.11.2026 – Beide Standortjournal-Migrationen im Supabase-Projekt `olcuzlrhyintuqmcftvl` angewendet und geprüft.

## Neu im Source
- Append-only Schema `public.crew_location_events` (geplante Migration `20261105183500_ops5_crew_location_evidence_ledger.sql`): Personenbezug auf `(employee_id, organization_id)` verhindert tenant-übergreifende Links.
- Owner-RLS erlaubt ausschließlich Lesen zugehöriger Ereignisse; kein Browser-Insert, keine Updates oder Deletes. Vertrauenswürdige Ereignis-Einspeisung muss erst mit eigener Authentifizierung implementiert werden.
- Geschützter Screen `/crew-locations` zeigt Crewstatus, Positionsnachweis und Audit-Historie. Fehlende Tabelle, fehlende Historie oder >1.000 Ereignisse blockieren die Bewertung.
- Pure Engine `lib/crew-location-ledger.mjs` prüft verifizierte Check-ins und tatsächliche Flight-/Transfer-Arrivals. Vorheriger Standort, Abflugzeit, Ziel und Ereignisquelle müssen konsistent sein.
- Homebase, geplanter Charter, geplante Crewpositionierung und ein alleiniger Shadow Flight gelten **nie** als Crew-Standortnachweis.
- Alte Standortbestätigungen verfallen nach konfiguriertem Maximalalter; offene/unverifizierte Reiseereignisse blockieren eine neue Zuteilung.
- Für geplante Ankünfte erzeugt `draftCrewArrivalEvent()` nur `verificationState=pending` – niemals automatische Bestätigung.

## Bestehende Daten bleiben unverändert
- Die Datenbank war am 05.11.2026 zeitweise inaktiv. Am 07.11.2026 wurden beide hier genannten Migrationen erfolgreich auf AERVELYS OPS 5.0 angewendet.
- Nach Migration: Tabelle vorhanden, Row-Level Security an, anonymes Lesen/Schreiben verboten, authentifizierte Updates und Deletes verboten, genau zwei Owner-Policies, ein Unique-Index gegen doppelte Check-ins, Append-only-Trigger vorhanden. Mitarbeiter- und Flugzeugzahl unverändert (31/5), Standortereignisse 0.
- Vercel `aervelys-ops5.vercel.app` wurde vom Nutzer erfolgreich veröffentlicht und mit OPS 5.0 verbunden. Ein neues Web-Deployment für diese Änderungen muss nach GitHub-Merge geprüft werden.

## Noch zu bauen
1. Nach Wiederherstellung der richtigen Supabase-OPS5-Datenbank: Migration gegen Schema und RLS testen, einschließlich anderer Nutzerorganisationen.
2. Gesicherter Service-Endpunkt für beobachtete MSFS-/simulierte abgeschlossene Flug- und Transferereignisse. Ereignisquelle, Genehmigung, Gültigkeit und Idempotenz prüfen.
3. Zeitstand- und Duty Ledger koppeln: Crewposition ist für neue Folgeaufträge nur dann verwendbar, wenn Dienst-/Ruhezeiten und Standby-Zustand separat freigegeben sind.
4. Belastbare Anbieter-/Zeitdaten für Taxi/Shuttle/Zug/Linienflug und Hotels samt Buchungs- und Rückführungskosten.
5. Erst danach vollautomatische, revisionssichere Crewdisposition und wirtschaftliche Mehrfach-Umläufe freigeben.

Diese Funktion ist eine Simulation der internen Prozesse einer Business Airline, keine Freigabe für reale Flugbewegungen.
## Aktivierung 07.11.2026
- Sicherheitsmigration `20261107113000_ops5_crew_location_owner_initial_checkin.sql` ergänzt `recorded_by_user_id`, Owner-INSERT-RLS für einmalige manuelle **virtuelle** Ausgangspositionen, PIC/SIC-Rollencheck und einen Unique-Index gegen doppelte initiale Check-ins.
- In `/crew-locations` kann der angemeldete Organisationsinhaber nun einen einzelnen Flughafen pro bisher nie initial bestätigtem Piloten eingeben. Dieser Eintrag ist eine ausdrückliche Aussage des Betreibers der Simulation und keine MSFS-Messung.
- Der Server überprüft die Sitzung und Zugehörigkeit. RLS prüft Eigentümer, Ursprung, Ereignistyp und Zeitstempel zusätzlich auf Datenbankebene.
- Die Crewstandort-Engine bleibt separat von gültigen Crewqualifikationen und gesetzlichen Dienst-/Ruhezeiten. Ein manueller Ausgangsstandort ist **keine Einsatzfreigabe**.
- Spätere Flughafenkorrekturen, Ferry-/Line-Travel- und Flugabschlüsse werden noch nicht automatisch verifiziert und gebucht.

### Verifikation am 07.11.2026
- DB-Migrationshistorie enthält `ops5_crew_location_evidence_ledger` und `ops5_crew_location_owner_initial_checkin`.
- Katalogprüfung: 2 RLS-Richtlinien, anonyme SELECT/INSERT-Rechte `false`, authentifizierte UPDATE/DELETE-Rechte `false`, Append-only-Trigger aktiv.
- Datenbestand unverändert: 31 Mitarbeiter, 5 Flugzeuge, 0 initial gesetzte Standorte. **Keine** erfundenen Flugbewegungen oder Pilotenzuteilungen.
- Sicherheits-Advisor zeigt die bisherigen Hinweise für geschützte `ops_private`-Tabellen ohne Policy und deaktivierten Leaked-Password-Schutz. Kein neuer Crew-Ledger-RLS-Hinweis.
