# AERVELYS OPS 5.0 — Automatic Crew Positioning (Shadow Simulation)

Stand: 07.11.2026. Ausschließlich virtuelle Business-Airline-Simulation, kein realer Flugbetrieb.

## Neu implementiert
- Seite `/crew-travel` verlinkt mit Virtual Crew Control, langfristigem Crew Roster und Daily Flight Schedule.
- Mandantengesicherter `shadow_crew_travel_options`-Katalog für explizit vom Inhaber eingetragene fiktive Reiseannahmen je Richtung und Modus: Shuttle/Taxi, Bahn oder Linienflug.
- Append-only: unveränderliche Simulationsannahmen für Dauer und Preis, nicht als Echtzeit-Transportangebot oder Ticketbuchung deklariert.
- Reine Engine `lib/shadow-crew-travel.mjs` prüft PIC und SIC für geplante synthetische Charterflüge: aktueller virtueller Standort, mögliche Anschlussreisen, Report-Zeit, 45-Minuten-Umstiegsfenster, Reisezeit, Kosten, andere Flugzuweisungen und 11-stündiges Modell-Ruhefenster nach vorheriger Simulationstätigkeit (plus 30 Min Release).
- Sie findet direkte oder 2-teilige Transferketten und wählt die günstigste *zeitlich passende* Option; fehlende Wege und nicht bestätigte Standorte sind Sperrgründe.
- Muss für einen Charter ein zuvor geplanter Ferryflug stattfinden, müssen beide Crewmitglieder rechtzeitig am **Startort des Ferryflugs** sein; sie dürfen nicht erst am Charterabflugort auftauchen.
- Permanente Regeln: Longitude nie EDAZ, Phenom 300E bleibt für Charter gesperrt; vorhandene Crew- und Flugentwürfe werden nicht als real lizenzierte Einsätze behandelt.
- Kandidatenvorschläge werden bei jedem Anzeigen der Seite aus aktuellen DB-Daten neu berechnet. Das verursacht keine automatischen Buchungen.

## Nicht implementiert / offene Risiken
- Noch keine eigenständigen konkreten Linienflugpläne, Tarife von Verkehrsunternehmen, Rückfahrtangebote, Hotelkontingente, Reisebuchungen oder Traveller-Check-in-Nachweise.
- Die Route `EDAZ→EDDB` ist **nicht** automatisch angelegt. Die fiktive Anreise muss vom Unternehmensinhaber ausdrücklich im Katalog modelliert werden; ohne Route erfolgt keine Freigabe.
- Reisen haben derzeit *modellierte* Dauern und Preise, keine echten verfügbaren Abfahrtszeiten und kein Echtzeit-Sitzkontingent. Das ist eine bewusst vereinfachte Simulation.
- Die Crewqualifikationen, Medicals, Diensthistorien und die EASA-FTL-Compliance sind weiterhin Entwürfe/unverifiziert. Die 11-h-Regel ist ausschließlich ein konservativer **fiktiver Scheduling-Puffer**, keine juristische Bescheinigung.
- Automatische Vorschläge werden **nicht** in `shadow_crew_assignments` gebucht; der Inhaber kann die Wahl anschließend über Virtual Crew Control für rein narrative Shadow-Flüge treffen.
- Keine Ortsänderung in `crew_location_events`, keine Änderung an operativen Piloten-/Flugzeugdaten, keine Verbindung zur MSFS-Bridge und keine echten Flugzeugmieten.
- Der read-only Planner erlaubt maximal eine Verbindung; bei Limitüberschreitung der Datenbank-Reads ist die Disposition gesperrt statt aus unvollständigen Ergebnissen zu entscheiden.

## Akzeptanztests
- Preisoptimierung prüft nur zeitlich passende Direktverbindungen und Umstiege.
- Crew am richtigen Flughafen benötigt keine Positionierungskosten.
- Fehlender/alter Crewstandort, blockierte Crewbewegung, überlappende Zuteilung, unzureichende Ruhe und ungültiger Ferryflug verhindern eine Empfehlung.
- Mit PIC/SIC und Ferry muss der Crew-Report am Ferry-Origin erfolgen.
- Neue owner-RLS-Tabelle: `anon` ohne Rechte, `authenticated` nur Select/Insert mit Owner-Check, keine Updates/Deletes.

## Weiterer Bauabschnitt
Verifizierte Simulationstransferereignisse mit zeitlich geplanter Durchführung, Hotel-/Shuttle-Kontingenten, Kostenbuchung in der fiktiven Finanzbuchhaltung und atomarer PIC/SIC-Szenariozuordnung. Erst dann dauerhafte autonome Worker – weiterhin ohne FTL/Realflug-Freigabe.