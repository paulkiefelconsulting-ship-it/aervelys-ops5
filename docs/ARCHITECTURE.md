# AERVELYS OPS 5.0 – Architekturgrundlage

**Stand:** 2026-10-25 – Greenfield-Initialisierung

## Leitlinien

- Eigenständiges neues Supabase-Projekt und neue Vercel-Anwendung; keine gemeinsame Datenbank mit OPS 4.x.
- Altsystem bleibt unangetastet; es findet **keine automatische Altlastenmigration** statt.
- Zukünftige Übernahme ausgewählter Flugzeuge oder Personalidentitäten nur über geprüfte, explizite Importmappings.
- DB-transaktionale Ressourcenbelegung, deterministische Sicherheitsregeln, vorhersagbarer Scheduler und idempotente Jobs.
- Geschäftsführungsfreigaben für Gehaltsläufe, freigabepflichtige Zahlungen und große Investitionen.
- Privates und geschäftliches Ledger strikt getrennt; alle Konten/Transaktionen sind Simulation.
- Keine externen realen Reise-, Bank- oder Charterbuchungen ohne explizite Integration und Genehmigung.

## Architektur

`Next.js (UI + API)` → `Supabase Auth + PostgreSQL (neues Projekt)` → `Job-Orchestrator/Simulationsengine (später)`.

Ab P1 zuerst: Auth + rollenbasierte Policies, Organisation, eigene Stammdatendomänen, Auditlog und isolierte Jobs. Danach Management-, Flotten-, Crew-, Scheduling- und Finanzmodule in überprüften Phasen.

## Noch nicht umgesetzt

Die Module des Dashboards sind absichtlich als **Geplant** markiert. Es gibt noch keinen produktiven Flugbetrieb, keine KI-Autonomie, keine Banking-Transaktionen und keine eingerichtete Datenbankverbindung. Die Status-API `/api/health` meldet entsprechend nicht operativ.

## Deployment-Grenze

Kein Produktiv-Cutover vor vollständigem 30-Tage-Simulationstest, Sicherheitsprüfung, erfolgreichen Release-Gates und expliziter Freigabe.
