# AERVELYS OPS 5.0 — Crew Mobility & Long-Term Roster

Stand: 05.11.2026. Erweiterung der sicheren Aircraft-/Crew-Rotation aus main. Keine Betriebsfreigabe.

## Implementiert
- Geschützte Seite /crew-mobility?date=YYYY-MM-DD&weeks=2|4|8|12 mit PIC/SIC-Dienstplan aus bestehenden Mitarbeiter- und Dienstblocktabellen.
- Reine Engine lib/crew-mobility-planner.mjs erstellt unverbindliche Vorbewertungen für Transfers per Shuttle/Bahn/Linienflug, Hotelnächte, Kosten, Folgedienste und optionale Heimreise.
- Die Homebase zählt niemals als Nachweis des aktuellen Standorts. Nur verifizierte aktuelle Position, Diensthistorie, Reisezeiten und Preise sind zugelassen.
- Transfers benötigen eine belegte Route und müssen vor Crew-Report enden. Ruhezeit und Release-Puffer begrenzen die nächste Dienstbereitschaft.
- Hotelkosten nur mit verifiziertem Tarif, keine impliziten Buchungen. Keine Flugzeug- oder Crew-Doppelzuweisungen.
- Automatische Tests für Positionierung, Hotels, Ruhezeit- und Zeitkonflikte, unbekannte Orte und fehlende Preise.

## Grenzen
- Bestands-API enthält noch keinen bestätigten Crew-Position-Feed und kein Flugziel pro Dienstblock. Live-Daten werden daher als nicht disponierbar bewertet.
- Keine vollständige EASA FTL/Standby/Acclimatization-Prüfung oder Crew-Release.
- Kein neues Supabase-Schema, keine Migration, keine RLS-Änderung, keine Mitarbeiter-, Hotel- oder Flugbuchung.
- Planungshorizont bis 12 Wochen ist ein Lesefenster und noch kein automatischer Dienstplan-Generator.
- Ab 500 gelesenen Dienstblöcken Warnung vor unvollständiger Datenlage.

## Nächster Schritt
Ein versioniertes, eigentümergesichertes und auditiertes Standort-Ledger mit verifizierten Duty-Perioden, Flughafenzielen, Reiseoptionen und Kostenkatalog. Erst danach Vorschläge in die Aircraft-Rotation integrieren und verifizierte Ressourcen atomar reservieren.

## Erweiterung 12.11.2026 – längerfristige Crew-Roster-Vorschau

Die vorhandene Seite `/crew-mobility` enthält zusätzlich einen Wochenkalender für **2/4/8/12 Wochen** mit Einzelwochen-Navigation (`week=1..12`), ohne eine zweite Personal-/Flugdatenbank einzuführen.

- Der reine Forecast `lib/crew-roster-forecast.mjs` verbindet die **bereits erfassten** `crew_duty_blocks` mit bestehenden Zuordnungen aus `shadow_crew_assignments` und `shadow_flights`. Die Datensätze werden ausschließlich nach der bestehenden authentifizierten Organisationszuordnung gelesen.
- Er unterscheidet bestätigte Dienstblöcke, Entwürfe, Abwesenheit/Ruheblöcke, zugeordnete **rein virtuelle** Shadow-Flüge und offene Datenlücken. Ein leerer Tag wird **„Kein Dienst erfasst“**, niemals „frei“ oder „verfügbar“ genannt.
- Überschneidungen zwischen Dienstblöcken und SIM-Flügen sowie ein zu kurzer Abstand unter **11h30** zwischen zwei vorhandenen Arbeitsperioden werden als **Prüfkonflikt**, nicht automatisch als gesetzlicher Verstoß eingestuft.
- Eine faire, deterministische Rotation erstellt pro UTC-Tag höchstens eine **Rufbereitschafts-Idee** für PIC und SIC (modelliertes Zeitfenster 08:00–20:00 UTC). Nur aktive Personalprofile ohne zeitnahen Pflicht-/Entwurfs-/Ruheblock und ohne konkurrierenden Forecast werden berücksichtigt. Die Person wird ausdrücklich **nicht** in Bereitschaft versetzt.
- Alle Rufbereitschaftsideen sind **ohne Type-Rating-/Medical-/FTL-/Standortfreigabe**, daher keine disponierbare Crew. Es gibt keine tatsächlichen Dienstplan-Einträge, keine automatischen Zuteilungen, keinen Flug- oder Finanzstatuswechsel.
- Sobald eine Quelle unlesbar, unvollständig oder am Abfrage-Limit ist, oder ein referenzierter Crew-/Flugdatensatz fehlt, erfolgt **Fail-Closed**: keine Standby-Namen und keine vermeintlichen freien Tage.
- Für das langfristige Roster werden bestehende OPS5-Tabellen genutzt; kein SQL-Schema, keine RLS-Policy, kein Cronjob und kein Personalstammdatensatz geändert.

Tests in `tests/crew-roster-forecast.test.mjs`. Noch offen für echte Autonomie: nachgewiesene Trainings-/Typerating-Berechtigungen, mehrtägige Bereitschaft mit rechtskonformer FTL-Prüfung, vollständige Standortketten, veröffentlichbare Dienstplanversionen, auditierte Bestätigung und automatische Crewbenachrichtigungen. Diese Funktionen sind mit der Forecast-Anzeige **nicht** schon implementiert.

## Erweiterung 12.11.2026 – gespeicherte, versionierte SIM-Dienstplanentwürfe

### Verhalten
- `/crew-mobility` ermöglicht Eigentümern, virtuelle **Standby-, Schulungs-, Büro-, Ruhe- und Abwesenheitsentwürfe** als separate Planungseinträge zu speichern. Einträge werden nicht zu `crew_duty_blocks` oder wirklichen Flugzuweisungen.
- Nach jeder Änderung entsteht eine neue unveränderliche Revision (`created`, `revised`, `cancelled`), mit Zeit, Ersteller und Mitarbeiter. Die Oberfläche zeigt aktuelle Entwürfe und die letzten historischen Ereignisse; Stornieren bedeutet **nicht** physisches Löschen.
- Neue Entwürfe erscheinen im vorhandenen 2–12-Wochen-Kalender als `draft`. Auch fiktiver Urlaub/Ruheblock bleibt **Entwurf**, nicht bestätigte Abwesenheit oder garantiert verfügbare Crew.
- Für einen Entwurf sind ein vorhandenes **aktives PIC-/SIC-Profil**, zukünftige UTC-Zeiten (10 Minuten Vorlauf bis max. 370 Tage), max. 24 Stunden Dauer und eine kollisionsfreie Belegung notwendig.
- Geschützter Server-Action-Insert unter `requireWorkspace()`. Der DB-Trigger prüft Besitzer, Mitarbeiter und Revision sowie Überschneidungen gegen bestehende `crew_duty_blocks`, zugewiesene Shadow-Flüge und offene SIM-Draft-Serien erneut. Optimistische Versionierung mit Sperre verhindert parallele Bearbeitung derselben Serie.
- `staff_notified=false`, `operational_release=false`, `simulation_only=true` sind DB-Checks und **nicht** aus der UI änderbar. Die Nachricht an den Mitarbeiter wird **nicht versendet**; ein zukünftiger Mitarbeiter-Posteingang kann die Versionen separat als Entwürfe anzeigen.
- Unlesbarer oder abgeschnittener Revisionsfeed: Schreibformular und verlässliche Kalenderbewertung vorsorglich sperren.

### Datenbank
- Neue Migration: `20261112221500_ops5_sim_crew_roster_drafts.sql`, geschützte, allein anhängbare Tabelle `sim_crew_roster_revisions`.
- RLS: nur der verifizierte Organisationsinhaber kann lesen und Versionen hinzufügen; keine direkten UPDATE/DELETE-Rechte, zusätzliche Unveränderlichkeits-Trigger.
- Keine Änderung an Bestandspersonal, produktiven Diensten, Flugzeugen, Charterflügen, Finanzkonten, operativen Crewpositionen oder bestehenden Cronjobs.
- Deployment der Next.js-Anwendung separat gegen die erfolgreich angewendete Migration prüfen. Ein GitHub-Build ist kein Nachweis der Live-Bereitstellung.

## 12.11.2026 – AERVELYS Autopilot: Dienstplanung ohne CEO-Dateneingabe

**Neue Standardlogik:** Der CEO erstellt keine Mitarbeiter, Bereitschaften oder Dienstplanentwürfe mehr, um eine Besetzungsvorschau sehen zu können. Der aktive Hintergrunddienst in Supabase berechnet jeden Morgen um **05:45 UTC** selbstständig eine rollierende **12-Wochen-Planung (84 Tage)** aus der bestehenden Mitarbeiterliste.

- Hintergrundjob: `aervelys-ops5-autonomous-roster-daily` → `ops_internal.generate_autonomous_crew_roster(...)`. Erstbefüllung erfolgt einmalig beim Deployment durch denselben DB-Worker, nicht per manuellem Formular.
- Bestehende PIC-/SIC-Stammdaten bleiben unangetastet. Der Scheduler bevorzugt `active`, verwendet in der **rein fiktiven Simulation** aber auch bereits angelegte `draft`-Crewprofile. Bei `draft` wird die Personalqualifikation nie als bestätigt ausgegeben. Es entstehen **keine echten Einsatzfreigaben**.
- Für jeden UTC-Tag wird pro Rolle eine **virtuelle Rufbereitschaft 08:00–20:00** geplant. Greedy-Rotation nach bisheriger Anzahl der letzten 28 Tage; ausschließlich vorhandene Mitarbeitende, keine neu erfundenen Namen.
- Die Engine berücksichtigt dokumentierte Dienst- und Abwesenheitsblöcke, hypothetische bereits zugewiesene Flugaufträge, alte offene Entwürfe und andere automatisch geplante SIM-Schichten. Konservative 11h30-Abstandskontrolle. Bei nicht zuweisbarer Rolle wird ein **unbesetzter** Platz dokumentiert, nicht eine freie Person erfunden.
- Quellen: Eigentümergeprüfte Supabase-Tabelle `sim_crew_auto_roster` sowie `sim_crew_auto_runs`; keine neuen manuell einzugebenden Daten.
- Virtuelle Mitarbeiter erhalten **selbstständig erzeugte interne Nachrichten** in `sim_crew_auto_messages`, mit `delivery_status='delivered_in_simulation'`. Keine echten E-Mails, SMS oder fremden Nachrichtenkonten. Eine Nachricht entsteht nur bei erstmalig neu erzeugtem Slot (unique source), niemals pro Seitenaufruf.
- Wiederholte tägliche Jobs sind durch `UNIQUE(organization_id,duty_day,crew_role)` idempotent. Der Scheduler verändert keine bereits vergebenen Flug- oder Dienstblock-Daten.
- In `/crew-mobility` steht jetzt der **autonome Dienstplan** mit internen SIM-Nachrichten im Mittelpunkt. Die zuvor sichtbaren Erfassungs-/Bearbeitungsformulare sind aus der Standardoberfläche entfernt. Die gespeicherten manuellen Revisionen bleiben erhalten und werden vom Scheduler beim Prüfen berücksichtigt.
- `UNVERIFIED_SIMULATION_ONLY`, `operational_release=false`, `external_delivery=false` und alle RLS-Zugriffsgrenzen sind Datenbank-Checks, keine bloßen UI-Texte.
- Die bestehende Roster-Engine zeigt automatische Standbys als `virtual_autogenerated`; das ist ein eigener Status, **kein** bestätigter Betrieb und keine reale Flugfreigabe.

**Grenzen und Folgeausbau:** Eine 12-Wochen-Rufbereitschaftssimulation allein ist noch kein vollständiger AI-Dispatch; die automatische Verknüpfung der charterbezogenen PIC-/SIC-Vorschläge mit tatsächlichen fiktiven Flugaufträgen, Crew-Standortwechsel, Schulungen und weiteren NPC-Aktionen bleibt als nächster Integrationsschritt offen. Die bestehenden rechtlichen EASA-FTL-/Medical-/Type-Rating-Sperren für **realen** Betrieb werden nicht aufgehoben.

Migration: `20261112233000_ops5_autonomous_sim_crew_roster.sql`. Regressionen: `tests/autonomous-crew-roster.test.mjs`.
