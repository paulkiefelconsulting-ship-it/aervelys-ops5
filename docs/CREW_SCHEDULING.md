# AERVELYS OPS 5.0 – Automated Crew Screening

**Stand:** 26.10.2026. Neue Migration: `20261026005521_ops5_crew_screening_shadow_scheduler.sql`.

## Echt implementiert

- Neue Charteranfragen lösen durch einen datenbankseitigen Insert-Trigger unmittelbar die automatische Crew-Vorprüfung aus.
- Bestehende und offene zukünftige Charteranfragen werden täglich um **05:25 UTC** durch einen eigenen Supabase-Cron-Job neu überprüft (bis 200 pro Tageslauf).
- Jede Anfrage hat maximal eine Prüfrunde pro UTC-Tag. Neuberechnungen erzeugen keine doppelte Ausgabe am selben Tag.
- Musterbezogene PIC-/SIC-Kandidaten werden aus den 31 zentralen Mitarbeiterprofilen und den 46 historischen Mustereinträgen ermittelt.
- Die Engine prüft Beschäftigungs- und Musterstatus, geschützte Medical-/Check-/Credential-Nachweise, eingereichte oder genehmigte Abwesenheiten sowie bestätigte Dienstüberschneidungen.
- Eine PostgreSQL-GiST-Exclusion-Sperre verhindert überlappende bestätigte/operativ gesperrte Dienstblöcke derselben Person.
- Mit Vorlauf und geschätzter Blockzeit wird ein Zeitfenster modelliert. Diese Zeitschätzung bleibt eine reine Annahme.
- Die Seite `/crew-scheduling` zeigt die Musterprofile und die Gründe für jede Sperre; es werden keine sensiblen medizinischen Daten, Vertragswerte oder Gehaltsdaten ausgegeben.

## Durchgeführter Datenbanktest

Für die synthetische CJ4-Anfrage wurden 11 Musterprofile erkannt: 6 PIC und 5 SIC. Null einsatzfähige Crews, null angelegte Flüge, null Reservierungen, null Freigaben.

## Verbindliche Grenzen

**Es findet weiterhin kein automatischer Flugbetrieb statt.** Jeder Screening-Datensatz besitzt den fixen Status `blocked`; der Datenbank-Constraint lässt keinen anderen zu. Historische Lizenz- oder CAT-/IFR-Angaben sind keine eigenständig geprüfte Berechtigung. Verifizierter aktueller Crew-Aufenthaltsort sowie Dienst-/Ruhezeitplan fehlen weiterhin und blockieren den Einsatz immer.

Die privaten Personaldaten bleiben in `ops_private` ohne API-Freigaben. Die neuen drei Tabellen sind ausschließlich mit RLS-Owner-Leserechten zugänglich.

## Noch zu entwickeln

Reale standort- und zeitsynchrone Dienstpläne, unveränderliche bestätigte Flugzuweisungen, 24/7-Recovery und Repositionierungslogik, regulierungsbezogene Dienst- und Ruhezeitberechnung, qualifizierter Freigabeprozess, automatisierter Flugabschluss sowie Simulations-Finanzbuchungen. Danach können sichere KI-Agenten Entscheidungen innerhalb dokumentierter Grenzen treffen.
