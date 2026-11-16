# AERVELYS – persistenter Agent Runtime / OPS Liaison

Stand: 16.11.2026
Migration: 20261116164614_ops5_persistent_agent_runtime_liaison.sql
Zugeordneter Pull Request: Feature persistent-agent-runtime-v2

## Ziel und laufender Zustand

- Die AERVELYS Agent Engine v1 unter lib/agent-engine.mjs ist eine eigenständige,
  lokale, reproduzierbare Customer-/Sales-Zustandsmaschine ohne KI-API.
- Der **neue persistente Runtime-Baustein** ist zunächst ein getrennter
  OPS-Liaison-Agent im bestehenden Supabase-Projekt.
- Bestehender Sales-Autopilot bleibt der EINZIGE Bearbeiter seiner
  sim_sales_cases und sim_sales_messages; es werden KEINE doppelt
  geführten Kundengespräche angelegt.
- Der neue OPS-Liaison beobachtet nur bereits bestehende synthetische Fälle
  und erzeugt eigene, nur intern sichtbare Arbeitszustände und Ereignisse.
- Das ist noch keine neue generative KI und noch keine persistente
  Ausführung der JS-Verkaufs-State-Machine. Ihre spätere Überführung muss
  als explizite, getestete Ablösung des bisherigen Sales-Cron erfolgen.

## Datenstruktur

public.agent_runtime_tasks:
- Je (organization_id, source_sales_case_id, agent_role) max. ein Task.
- Zustände: queued, waiting_sales, awaiting_ops_evidence, closed_declined.
- Revision, beobachteter Sales-Status, nächster Durchlauf und letzte Entscheidung.

public.agent_runtime_events:
- Änderungsereignisse mit (task_id,sequence_no) eindeutig.
- simulation_only=true, external_delivery=false durch CHECK-Constraints erzwungen.
- Ereignisse sind append-only für die normalen angemeldeten Benutzer.

Beide Tabellen haben RLS und **ausschließlich Owner-SELECT**.
Kein INSERT/UPDATE/DELETE für authenticated oder anon.
Die einzigen Schreibpfade liegen in der nicht exponierten
ops_internal.advance_agent_runtime() Funktion, auf die keine öffentliche
EXECUTE-Berechtigung besteht.

## Autonomer Lauf

pg_cron: aervelys-ops5-agent-liaison-10min / */10 * * * *

- Quelle: NUR sim_sales_cases, die simulation_only=true,
  contract_confirmed=false, flight_released=false,
  external_delivery=false haben.
- SKIP LOCKED und einmalige Case-ID verhindern konkurrierende Doppelverarbeitung.
- Wartende Sales-Fälle werden im nächsten Lauf erneut geprüft.
- Kundeninteresse führt nur zu awaiting_ops_evidence.
- Kundenabsage führt zu closed_declined.
- Keine Flugzuweisung, Reservierung, externe Zustellung, Finanztransaktion
  oder automatisierte tatsächliche Freigabe.
- Ein nicht freigegebener / realer Sales-Fall wird ausgeschlossen.
- In der UI /agent-control sind nur die letzten 100 Tasks und 100 Events
  sichtbar; andere Datensätze bleiben in der DB gespeichert.

## Verifikation der Datenbank (16.11.2026)

Erster manuell ausgelöster Worker-Aufruf:
- tasks_created: 12
- events_created: 12
- 10 Tasks awaiting_ops_evidence
- 2 Tasks closed_declined
- RLS enabled: beide Tabellen
- authenticated SELECT: ja
- authenticated INSERT/UPDATE: nein
- anon SELECT: nein
- pg_cron job id 18, active=true

## Betriebs- und Kostenregeln

- Kein kostenpflichtiger Drittanbieter-KI-Aufruf.
- Bestehende Supabase-Cron-Funktion statt neuem kostenpflichtigem Hostingdienst.
- Auf Dauer gelten die regulären Supabase-Free-Plan-Ressourcenlimits.
- Die tatsächlichen automatischen Runs müssen mit cron.job_run_details
  überwacht werden; ein eingerichteter Cron ist noch kein Nachweis vieler
  fehlerfreier zukünftiger Runs.
- Kein automatischer Versand, keine echte rechtsverbindliche Kommunikation.
- Keine Annahme, dass der bestehende Vercel-Alias schon den neuen Commit zeigt.

## Weiterer Ausbau

1. Automatisierte SQL-/Worker-Integrations- und Wiederanlauftests.
2. Echte Rollen-/Rechte-Matrix für weitere Agententypen.
3. Verifizierte OPS-Prüfungen und nachvollziehbare Weitergabe an Dispatcher.
4. Sales-State-Machine v1 in persistenten Worker nach sicherer Abschaltung
   des bisherigen Sales-Controllers integrieren; keine doppelte Ausführung.
5. HR- und Finance-Agenten als separate, auditierbare Aufgaben-Workflows.
6. Optionales lokal betriebenes Sprachmodell als reine Textschicht.
