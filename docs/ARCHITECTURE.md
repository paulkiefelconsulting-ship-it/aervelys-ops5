# AERVELYS OPS 5.0 – Systemarchitektur

Greenfield-Neuaufbau mit eigenständiger Datenbank und isolierter Codebasis. Kein Alt-OPS-Schema, keine Altdaten, keine parallelen aktiven Altprozesse.

## Tatsächliche Umgebung
- GitHub: `paulkiefelconsulting-ship-it/aervelys-ops5`.
- Supabase: neues Free-Projekt `olcuzlrhyintuqmcftvl`, Frankfurt (`eu-central-1`).
- Vercel: bisher nicht angelegt (HTTP 403 Permission Denied).
- Web-App: Next.js / TypeScript, nur Bootstrap-UI und Health-Endpunkt.
- Keine produktive Verbindung zwischen Web-App und Datenbank.

## Prinzipien
- Flugsicherheit und verifizierte Crew-/Aircraft-Qualifikationen vor Wirtschaftlichkeit.
- Datenbanktransaktionale Ressourcenreservierungen und automatisierte Schutzfenster für bestätigte Folgeaufträge.
- Fail-closed bei fehlenden Sicherheits- oder Betreiberfreigaben; wirtschaftliche Preisfallbacks explizit markiert.
- Trennung von privatem Vermögen und Firmenkapital in einem simulationsinternen Ledger.
- Ausführung echter externen Buchungen, Transfers oder E-Mails niemals durch bloße Simulation behaupten.
- Eindeutige, idempotente Job-IDs, Lease-/Retry-Konzept, Dead-Letter und Audit-Ereignisse.
- Owner-RLS für die anfängliche nur lesende Oberfläche; zukünftige Mitarbeiterrollen bekommen ausdrücklich prüfbare Zugriffsregeln.
- Secrets bleiben ausschließlich serverseitig bzw. im Hosting-Projekt; öffentliche Supabase-Publishable-Keys nur in `NEXT_PUBLIC_`-Variablen.

## Installierte Schema-Basis
Die SQL-Dateien unter `supabase/migrations/` entsprechen den bereits im **neuen** Supabase-Projekt erfolgreich eingespielten Migrationen.

Das Reservierungssystem enthält eine PostgreSQL-Exclusion-Constraint, die sich überschneidende bestätigte oder operative Sperren für dasselbe Flugzeug verhindert. Die Datenbank ist derzeit leer. Ein vollständiges Scheduler-Modul mit Crew-Reservierungen, Positionierungen und Optimierung existiert noch nicht.

## Phasen
1. P1: Auth, rollenbasierte Zugriffe, CI, Deployment, Sicherheitsprüfungen.
2. P2: eigene Stammdaten bzw. getrennt geprüfte Neuanlage ohne Altlasten.
3. P3–P15: Finanzen, HR, Crew, Flotte, Scheduler, Ground Ops, KI Workforce, 30-Tage-Simulation.
Ein Modul gilt erst bei erfolgreichen Tests als abgeschlossen.
