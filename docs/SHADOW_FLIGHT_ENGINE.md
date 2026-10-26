# AERVELYS OPS 5.0 – Stündliche Counterfactual Flight Simulation

Stand: 26.10.2026. Migrationen: 20261026083642_ops5_shadow_flight_lifecycle.sql und 20261026083739_ops5_shadow_flight_fix_seed_alias.sql.

## Implementiert
- Supabase-Cron alle 60 Minuten (\`0 * * * *\`), unabhängig vom angemeldeten CEO und einer ChatGPT-Sitzung.
- Übernimmt ausschließlich synthetische Charter-Nachfrage, für die ein unverbindlicher Flugzeugkandidat und eine definierte Modell-Blockzeit existieren. Manuelle Kundenanfragen werden **nicht** automatisch zu virtuellen Flugabläufen.
- Legt je synthetischer Anfrage höchstens einen geplanten Was-wäre-wenn-Flug an.
- Führt die rein hypothetischen Phasen \`planned\`, \`in_air\` und \`completed\` anhand der UTC-Uhr aus; zu jeder Phase gibt es unveränderliche Ereignisse.
- Führt eine strikt **getrennte** virtuelle Flugzeugzustandstabelle mit Standort, Flugphase und hypothetisch akkumulierten Blockstunden. Der initiale Standort ist bewusst nur die Stamm-Heimatbasis als Simulationsannahme.
- Kontrolliert virtuelle Doppelbelegungen und fehlende Positionierungen. Eine fehlende Positionierung lässt den jeweiligen Flug auf \`blocked_positioning\` statt Flugzeug-Teleportation fallen.
- Speichert bei erfolgreichem hypothetischen Abschluss ein Ergebnis mit den zuvor modellierten rein fiktiven Erlösen und Kosten – **kein Umsatz oder Zahlungsauftrag im Double-Entry-Ledger**.
- Serverinterne Funktion in \`ops_internal\`, nicht über die Data API exponiert; keine EXECUTE-Rechte für Browserrollen.
- Vier zusätzliche Tabellen mit Owner-RLS-SELECT, keine INSERT/UPDATE/DELETE für anon oder authenticated.
- Nachvollziehbare Ansicht unter \`/flight-simulator\`.

## Erster Test
- Automatisch aus der synthetischen Anfrage \`EDAZ → LIML\` entstanden: D-CJPK, 28.10.2026 um 12:00 UTC, Modellblockzeit 1,85h.
- Der normale erste Lauf erzeugte ein Szenario im Zustand \`planned\`.
- Ein transaktional **zurückgerollter** Zukunftslauf prüfte \`departed → arrived → completed\`, hypothetischen Standort LIML, 1,85h sowie den genau einmal erzeugten Modellabschluss.
- Nach dem Rückrollen blieb der reale Datenbankstand bei \`planned\` und es wurde kein vorgezogener Flugabschluss gespeichert.
- Zweiter Lauf am aktuellen UTC-Zeitpunkt: 0 zusätzliche Szenarien/Starts/Abschlüsse.

## Harte Sicherheitsgrenzen
- Nicht berührt: \`public.aircraft.current_icao\`, \`public.flight_plans\`, \`public.resource_reservations\`, Crew-Dienstblöcke, echte oder simulierte Bankkonten, operativer Mitarbeiterstatus.
- Historische Crewberechtigungen erlauben **keine** Freigabe. Es werden keinerlei echten oder operativ simulierten Piloten zugeteilt.
- Modelleinnahmen sind reine kontrafaktische Werte, keine realisierten Umsätze und keine Doppelbuchhaltung.
- Die tatsächliche Flug-Simulationsuhr \`public.simulation_clock\` bleibt angehalten; der neue stündliche Shadow-Worker nutzt die UTC-Uhr separat.
- Keine generativen KI-Agenten oder echte Positionierungsplanung.

## Nächste Stufen
Geprüfte Crew-Verfügbarkeit, belastbare Dienst- und Ruhezeitregelung, richtige Positionierungslogik sowie ein eigener geprüfter Wirtschaftskreislauf für vollständig freigegebene Simulationsflüge. Danach autonome LLM-Agenten mit Tool-/Policy-Schranken.
