# AERVELYS OPS 5.0 – Crew Location Evidence Ledger

Stand: 05.11.2026 – Implementierung im GitHub-Code, nicht live ausgerollt.

## Neu im Source
- Append-only Schema `public.crew_location_events` (geplante Migration `20261105183500_ops5_crew_location_evidence_ledger.sql`): Personenbezug auf `(employee_id, organization_id)` verhindert tenant-übergreifende Links.
- Owner-RLS erlaubt ausschließlich Lesen zugehöriger Ereignisse; kein Browser-Insert, keine Updates oder Deletes. Vertrauenswürdige Ereignis-Einspeisung muss erst mit eigener Authentifizierung implementiert werden.
- Geschützter Screen `/crew-locations` zeigt Crewstatus, Positionsnachweis und Audit-Historie. Fehlende Tabelle, fehlende Historie oder >1.000 Ereignisse blockieren die Bewertung.
- Pure Engine `lib/crew-location-ledger.mjs` prüft verifizierte Check-ins und tatsächliche Flight-/Transfer-Arrivals. Vorheriger Standort, Abflugzeit, Ziel und Ereignisquelle müssen konsistent sein.
- Homebase, geplanter Charter, geplante Crewpositionierung und ein alleiniger Shadow Flight gelten **nie** als Crew-Standortnachweis.
- Alte Standortbestätigungen verfallen nach konfiguriertem Maximalalter; offene/unverifizierte Reiseereignisse blockieren eine neue Zuteilung.
- Für geplante Ankünfte erzeugt `draftCrewArrivalEvent()` nur `verificationState=pending` – niemals automatische Bestätigung.

## Bestehende Daten bleiben unverändert
- Supabase-Projekt: `olcuzlrhyintuqmcftvl` (AERVELYS OPS 5.0) wurde am 05.11.2026 als INACTIVE gemeldet. SQL konnte nicht geprüft oder angewendet werden.
- Die Migration ist daher ausschließlich versioniert im GitHub-Repository. Keine Datenbankoperation, keine Personaländerung, kein tatsächlicher Crewtransfer.
- Vercel OPS5 ist nicht zugeordnet, weshalb die Webansicht noch nicht öffentlich oder produktiv verfügbar ist.

## Noch zu bauen
1. Nach Wiederherstellung der richtigen Supabase-OPS5-Datenbank: Migration gegen Schema und RLS testen, einschließlich anderer Nutzerorganisationen.
2. Gesicherter Service-Endpunkt für beobachtete MSFS-/simulierte abgeschlossene Flug- und Transferereignisse. Ereignisquelle, Genehmigung, Gültigkeit und Idempotenz prüfen.
3. Zeitstand- und Duty Ledger koppeln: Crewposition ist für neue Folgeaufträge nur dann verwendbar, wenn Dienst-/Ruhezeiten und Standby-Zustand separat freigegeben sind.
4. Belastbare Anbieter-/Zeitdaten für Taxi/Shuttle/Zug/Linienflug und Hotels samt Buchungs- und Rückführungskosten.
5. Erst danach vollautomatische, revisionssichere Crewdisposition und wirtschaftliche Mehrfach-Umläufe freigeben.

Diese Funktion ist eine Simulation der internen Prozesse einer Business Airline, keine Freigabe für reale Flugbewegungen.