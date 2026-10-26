# AERVELYS OPS 5.0 – Echte automatische Simulation (Shadow Phase 1)

Datum: 26. Oktober 2026.

Die App enthält jetzt einen **laufenden Datenbank-Hintergrundprozess**: Supabase Cron ruft jeden UTC-Tag um 05:15 die SQL-Funktion im privaten Schema auf. Der Prozess arbeitet ohne offenen Browser und ohne Eingabe einzelner Flüge.

## Tatsächlich implementiert
- Täglich genau eine **synthetische** Charteranfrage pro Organisation mit Abflug/Ziel, Datum und Passagierzahl.
- Alle Anfragen werden als Entwurf mit origin=simulation gekennzeichnet und in der echten neuen Supabase-Datenbank gespeichert.
- Idempotente Datenbank-Sperre je Organisation/UTC-Tag; Wiederholung für denselben Tag erzeugt 0 Datensätze.
- Protokollierung von Flottenbestand, verfügbaren Maschinen, als verifiziert markierten PIC/SIC-Ansprüchen und der Blockierentscheidung.
- 26.10.2026: erster manuell angestoßener Simulationslauf erfolgreich. EDAZ–LIML für 5 Passagiere als rein synthetischer Entwurf; 5 Flugzeuge insgesamt, 0 verfügbar, 0 verifizierte PIC/SIC.
- Aktiver pg_cron-Job: aervelys-ops5-shadow-market-daily; Schedule 15 5 * * * (UTC).
- Abgesicherte Server-Funktion, keine Browser-Execute-Rechte, keine anonymen Grants auf simulierende Daten.
- Neue Seite /simulation zeigt die Ergebnisse; die bisherige Modulnavigation führt dorthin.

## Beabsichtigte Grenzen
Der automatische Teil ist aktuell ein regelbasierter, deterministischer **Marktnachfrage-Simulator**, nicht ein angeblich aktiver LLM-Agent.

Nicht implementiert: realistische stochastische Nachfragemodelle, KI-Dispatch-Entscheidungen, Flugzeug-/Crew-Freigabe, Überbuchungsschutz für Crews, bestätigte Flüge, Reise-/Handling-Aufträge, Flugzeitfortschreibung, Finanz-Ledger und tatsächliche Benachrichtigungen. Der separate Flug-Simulations-Takt verbleibt auf stopped.

Alle in die neue Datenbank übernommenen Musterberechtigungen sind unbestätigt und dürfen nicht allein zu einer Crewfreigabe führen. Der Marktgenerator erzeugt nie Flüge und löst keine echten wirtschaftlichen Transaktionen aus.

## Geplante nächste Stufen
1. Reproduzierbare Nachfrage- und Preisberechnung mit konfigurierbaren Szenarien.
2. Sicherheitsgeprüftes Matching von Aircraft, Crew, Check/Medical, Homebase, Duty/Ruhezeit, Abwesenheiten und Reservierungen.
3. KI-Agenten für kommerzielle Bewertung und Dispositionsvorschläge mit expliziten Freigabe-Gates.
4. Simulation von Flugabschluss, Positionierungen, Flugstunden, Wartung sowie getrenntem simulierenden Double-Entry-Ledger.

## Test- und Betriebsprüfungen
- SQL-Simulationslauf für den aktuellen UTC-Tag erzeugte 1 Markt-Tick.
- Derselbe Aufruf erneut erzeugte 0 neue Markt-Ticks.
- Ein Audit-Ereignis für den Markt-Tick gespeichert.
- 0 Flugpläne, 0 Ressourcenreservierungen nach dem Test.
- GitHub Actions: npm ci, npm test, npm run typecheck, npm run build.
- Der nächste Cron-Lauf muss zusätzlich anhand cron.job_run_details nach der geplanten Ausführung kontrolliert werden.
