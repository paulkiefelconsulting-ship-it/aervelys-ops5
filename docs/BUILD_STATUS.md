# AERVELYS OPS 5.0 – verifizierbarer Entwicklungsstand

Stand: 2026-10-26 · Modul-Grundausbau.

## Implementiert und überprüft
- 16 geschützte, navigierbare Modulansichten mit Datenbankanbindung.
- 14 davon erlauben neue Datensätze als **Entwürfe**, zwei sind lesend (Simulationsuhr, Auditprotokoll).
- Eigenständige Supabase-Free-Datenbank in Frankfurt: olcuzlrhyintuqmcftvl; keine Übernahme aus dem Altsystem.
- Drei angewendete Migrationsstände: 20261025212128, 20261025212248, 20261025232714.
- Insgesamt 19 Tabellen mit aktivierter RLS. 15 neue oder erweiterte Insert-Policies, 15 Audit-Trigger.
- Organisatorische Owner-Zuordnung und Authentifizierung bereits zuvor durch Browser-Screenshot bestätigt.
- GitHub Actions auf Commit 8fb8b3e: npm ci, npm test, TypeScript und Next.js Build erfolgreich (Run 40245660854).
- Vercel Produktions-Deployment auf genau Commit 8fb8b3e als READY über Vercel-Deployment-Abfrage bestätigt.
- Domain: https://aervelys-ops51.vercel.app (Vercel Alias).

## Strenge Entwicklungsgrenzen
- Keine Flugfreigaben oder automatische Crew-Zuteilungen.
- Kein Live-Scheduler, kein realer Zahlungsverkehr, keine Finanzbuchungen.
- Keine Gehaltsläufe, tatsächliche Nachrichtenzustellung oder KI-Ausführungen.
- Neue Flugzeuge bleiben inactive, Mitarbeiter draft, Slot-Reservierungen option, andere Geschäftsdatensätze draft.
- Simulationsuhr ist angehalten (stopped); keine Hintergrundjobs gestartet.
- Noch keine vollständigen Browser-End-to-End-Tests von Anlegen/Löschen (Löschen ist gar nicht freigegeben).
- Es wurden keine Testkunden, Flugzeuge oder Mitarbeiter automatisch erzeugt.

## Sicherheit
- Kein offener Browser-Zugriff ohne verifizierte Identität und zugeordnete Organisation.
- Neue Datensätze werden serverseitig einer verifizierten Owner-Organisation zugeordnet, mit DB-Policies abgesichert.
- Anonymous hat null Tabellenrechte im public-Schema.
- Security Advisor meldet einen verbleibenden Hinweis: Leaked Password Protection Disabled. Prüfen und aktivieren, falls im Tarif verfügbar: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection
- Öffentliche Auth-Signups im Supabase Dashboard zusätzlich deaktivieren und verifizieren.

## Nächste technische Gates
1. Im Browser /modules/fleet ein inaktives Testflugzeug anlegen und /modules/observability auf den Audit-Trigger prüfen.
2. /modules/crew, /modules/crm und /modules/sales auf Berechtigungen und Datenerfassung testen.
3. Fehlerzustände und Referenzfelder gegen fremde Organisationen testen.
4. Danach Crew-Qualifikationen, Dienstzeiten, Flugfreigaben, deterministisches Scheduling und Simulation Ledger sukzessive hinzufügen.

Mehr dazu: docs/MODULES.md.
