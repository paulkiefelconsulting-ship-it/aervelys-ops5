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
