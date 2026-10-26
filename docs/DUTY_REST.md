# AERVELYS OPS 5.0 – Crew Dienst- und Ruhezeit-Vorprüfung

**Stand:** 26. Oktober 2026. Migration `20261026173146_ops5_crew_duty_rest_shadow_reviews.sql`.

## Reale Implementierung

- Zentrale und organisationsgebundene `crew_duty_reviews`-Tabelle, ausschließlich für den verifizierten Owner lesbar und append-only.
- Jedes neue `crew_screening_checks`-Element erzeugt innerhalb derselben Datenbanktransaktion einen eigenen Dienst- und Ruhezeit-Prüfschnappschuss. Bereits vorhandene elf Crewprüfungen wurden ohne Datenverlust nachbewertet.
- Die bestehende tägliche `05:25 UTC`-Crew-Screening-Automatik löst damit auch die neuen Dienst-/Ruhezeit-Schnappschüsse für künftige Charterentwürfe aus.
- Betrachtet erfasste bestätigte und operativ gesperrte Dienste, dazu überlappende Ruheblöcke und eingereichte/genehmigte Abwesenheiten.
- Berechnet das letzte erfasste Dienstende, den nächsten Dienstbeginn, tatsächlich im System dokumentierte Dienststunden der vorherigen 7 und 28 Tage sowie aktuelle Überschneidungen.
- Konservatives, **rein illustratives** Testregelwerk: Mindestabstand 11 Stunden, geplantes Dienstfenster höchstens 14 Stunden, 60 Modellstunden in 7 Tagen und 190 in 28 Tagen. Diese Werte sind ausdrücklich nicht gleichzusetzen mit vollständigen EASA-FTL-Grenzen oder Flugfreigaben.
- Ohne nachgewiesene Vollständigkeit der Diensthistorie bleibt der Status `blocked`. Das Datenbankschema erlaubt weder `cleared` noch `authorized`.
- Die neue Seite `/duty-rest` zeigt die einzelnen Bewertungen, Rollstunden, dokumentierte Zeiträume, Sperrgründe und vorhandene Dienstblöcke, ohne private Medical- oder Gehaltsdaten offenzulegen.
- Die bestehende PostgreSQL-Exclusion-Constraint in `crew_duty_blocks` verhindert ohnehin überschneidende bestätigte Dienstblöcke desselben Mitarbeiters.

## Tests am 26.10.2026
- Elf historische Musterprofile nachbewertet: 11 `blocked`, 11 Fälle unvollständiger Diensthistorie, 0 freigegeben.
- Transaktional zurückgerollter Integrationstest: bestätigter Dienst vor dem Charter, bestätigte Bereitschaft während des Charters, nächster Dienst zu früh nach der Ankunft und genehmigte Abwesenheit. Automatisch wurden alle maßgeblichen Verstöße für den Testpiloten erkannt.
- Der gesamte Testcharter erzeugte automatisch 11 neue Bewertungen; die Testdatensätze wurden vollständig zurückgerollt. Der produktive Stand bleibt bei 11 ursprünglichen Bewertungen und 0 Dienstblöcken.
- RLS/Privilegien: kein `anon`-Leserecht, keine Browser-Schreibrechte und kein Execute-Recht für die interne Prüffunktion bei angemeldeten Browsern.

## Wichtig: Grenzen
Es existiert noch keine vollständige Dienst- und Flugstundenhistorie und keine validierte Anwendung aktueller Luftfahrtvorschriften. Ein fehlender Konflikt beweist keine Verfügbarkeit, die Homebase keinen aktuellen Aufenthalt. Neue Abwesenheiten oder Dienstblöcke ändern bisherige Prüfschnappschüsse nicht rückwirkend; die erneute tägliche Crewprüfung erstellt einen neuen Stand. Die Regelengine ist deterministisch und kein generativer KI-Agent. Sie darf keine operativen Crew- oder Flugfreigaben bewirken.
