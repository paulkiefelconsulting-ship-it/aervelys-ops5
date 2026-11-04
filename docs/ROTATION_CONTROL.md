# AERVELYS OPS 5.0 — Daily Flight Schedule & Rotation Control

Stand: 04.11.2026 · Feature-Branch `feature/daily-rotation-control`.

## Tatsächlich implementiert
- Authentifizierte Tagesansicht `/rotation?date=YYYY-MM-DD`, mit 24-Stunden-Zeitleiste je vorhandener Maschine aus der **neuen** Datenbank.
- Tagesbezogene Flugplanentwürfe, Ressourcen-Zeitfenster und Charteranfragen werden **unverändert gelesen**, nach UTC sortiert und klar voneinander getrennt.
- Reiner, deterministischer Vorschlagskern `lib/rotation-planner.mjs`; keine Supabase-Updates, keine Freigaben.
- Flugzeuge werden nur für notwendige Zeitfenster mit Turnaround eingeplant, nicht pauschal für den ganzen Tag.
- Anschlussflüge verwenden den nach dem vorangegangenen geplanten Flug erreichten Flughafen.
- Ein notwendiger Ferryflug und eine notwendige Crewpositionierung werden nur mit **explizit bereitgestellten** Dauer-/Kosten- und Reisemodusdaten vorgeschlagen.
- Verifizierte PIC-/SIC-Paare müssen zeitlich zum Einsatzort gelangen können; für bereits gebundene Ressourcen wird ein Konflikt erkannt.
- Bestehende zukünftige Reservierungen bleiben geschützt; bei nicht prüfbaren Standortketten wird konservativ blockiert.
- EDAZ: Citation Longitude darf dort weder Charter noch Positionierungsflug beginnen oder beenden; Phenom 300E bleibt für Charter blockiert.
- Unit-Tests sichern Anschlusscharter, Transferpflicht, EDAZ-Ausnahmen, verbindliche Folgeaufträge und blockierende Nachweise.

## Bewusst gesperrt / noch nicht umgesetzt
1. Die neue DB hat derzeit **keine durchgängig verifizierten** Charterfreigaben, Crew-Aktuellstandorte und streckenabhängigen Performance-Freigaben. Der Datenbank-Adapter gibt diese Prüfungen daher als `false` weiter; die Engine erstellt damit **keine scheinbar genehmigten Einsätze**.
2. Flugplanentwürfe sind keine Kundenaufträge. Die Tagesansicht zeigt beide Quellen separat, um Doppelzählung und erfundene Aufträge zu vermeiden.
3. Luftfahrtrechtliche FTL-, AFM-, Wetter-, NOTAM-, Flughafenbetriebszeit-, Handling- und internationalrechtliche Prüfungen fehlen; der Vorschlagskern ist **keine operative Dispositionsfreigabe**.
4. Die Routenmatrix für Aircraft-Ferry, Crew-PKW/Bahn/Linienflug und Transfers muss aus **nachvollziehbaren Daten** stammen; bei fehlenden Zeiten/Kosten gilt fail-closed.
5. Crew-Anreise ist im Vorschlag sichtbar, aber noch nicht als separate Dienst- und Reisebuchung mit Tickets, Hotels, Ruhezeiten oder Kostenkonten persistiert.
6. Es gibt noch keine verbindliche, transaktionale Multi-Ressourcenbuchung oder Optimierung über mehrere Tage, keinen Crewtausch und keine Simulation von verspätungsbedingter Re-Optimierung.
7. Bestehende Daten und Mitarbeiter sowie Flotte wurden **nicht verändert**. Altsysteme `aervelys-next` und `aervelys-ops` sind unberührt.

## Nächstes Abnahme-Gate
- Fachlich gültige, simulationsinterne Charterfreigabe pro Tail/Route (inkl. EDAZ-Performance) hinzufügen.
- Crewstatus einschließlich verifizierter Position, historischer Dienste, Typqualifikation, Urlaub, Bereitschaft und FTL vervollständigen.
- Belastbare Flugzeit-/Transfer-/Handlingdaten implementieren.
- Integrationstests für Folgeaufträge, Positionierungen, Dispatcher-Änderungen sowie atomare Sperr-/Freigabeprozesse ausführen.
- Erst dann unbesetzte Flugaufträge aus KI-Anfragen automatisch zuweisen und an SimBrief/MSFS ausgeben.

Sicherheitsprinzip: **Simulation realistisch – unbekannt heißt nicht freigegeben.**
