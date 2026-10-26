# OPS 5.0 – Automatische Charterprüfung & fiktive Kalkulation

Stand 26.10.2026. Neuer Datenbank-Migrationsstand: 20261026004604_ops5_charter_pricing_and_dispatch_prechecks.

## Neue Module
- /dispatch – zeigt pro Charteranfrage den unverbindlichen Aircraft-Prüfkandidaten, die Musterprofile für PIC/SIC, Standort- und Statusinformationen und den Blockierungsgrund.
- /pricing – zeigt eine **rein fiktive** Kalkulation und den nicht-operativen Margin-Wert.
- Die Simulation und manuell angelegte Charteranfragen durchlaufen denselben Insert-Trigger; niemand muss alle täglichen Anfragen von Hand erfassen.
- Frühere Anfragen wurden einmalig über eine datensatzschonende Backfill-Prüfung bewertet.

## Fiktives Modell – keine echten Preise
Die hypothetische Beispielrechnung: Erlös = 1.200 € + angenommene Blockstunden × 3.200 € + Passagiere × 180 €. Kosten = 500 € + Blockstunden × 2.100 € + Passagiere × 85 €. Die Blockstunden sind ausschließlich interne Testwerte für fünf definierte Flughafenpaare. Unbekannte Routen haben **keinen** Modellpreis. Es gibt keine Wetterschätzung, Reichweiten- oder Flughafenleistungskontrolle.

## Keine echten Freigaben
- Jede Beurteilung hat unveränderlich review_status=blocked.
- Ein Musterprofil ist KEINE betriebliche Qualifikation; notwendige Medical-, Lizenz-, Operator-/Line-Checks, Dienst-/Ruhezeiten und Überschneidungsprüfung sind nicht komplett implementiert.
- Flugzeuge bleiben inaktiv; kein Flug, Crew-Einsatz, Reservierungsstart oder Geldtransfer wird ausgelöst.
- Bewertungsdatensätze sind nur vom authentifizierten Organisations-Owner lesbar. Erstellen und Bearbeiten ist über Browserrollen verboten.
- Triggerfunktionen liegen im nicht exponierten internen Schema, Rechte für anon/authenticated sind entzogen.
- Reale KI-Agenten, Flugabschluss und Finanzbuchungen fehlen noch.

## Nachweis
Erster bereits bestehender synthetischer Lead EDAZ–LIML automatisch ausgewertet. D-CJPK als unverbindlicher Prüfkandidat, fünf PIC- und fünf SIC-Musterprofile. Gesperrt wegen AIRCRAFT_INACTIVE. Modellbeträge 8.020 € Erlös, 4.810 € Kosten, 3.210 € Marge. Noch keine Flugpläne, Reservierungen oder Zahlungsbuchungen.
