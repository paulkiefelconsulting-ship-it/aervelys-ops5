# OPS 5.0 – autonomes virtuelles Positionierungsmodul

**Stand:** 26. Oktober 2026. Die neue Positionierungslogik läuft innerhalb des bestehenden stündlichen Datenbankjobs für virtuelle Flüge.

## Implementiert
- Für den nächsten geplanten synthetischen Charterflug pro Flugzeug wird der letzte hypothetische Standort ermittelt.
- Bei Standortunterschieden plant die Engine eine fiktive Positionierung mit einer angenommenen Streckenzeit und zwei Stunden Puffer.
- Die Streckenzeiten stammen ausschließlich aus einem kleinen festen Beispiel-Routenmodell. Nur ausdrücklich modellierte Flughafenpaare, einschließlich als fiktiv symmetrisch angenommener Gegenrichtung, können positioniert werden.
- Wenn ein Modell fehlt, die Vorlaufzeit nicht reicht oder ein Zeitkonflikt vorliegt, wird die Positionierung blockiert.
- Virtuelle Phasen: geplant → enroute → completed; Ereignisse und Stundenfortschreibung werden getrennt gespeichert.
- Positionierungen werden transaktional mit dem stündlichen Flugablauf verbunden und verwenden dasselbe Datenbankschloss gegen parallele Weltzustandsänderungen.
- Zwei RLS-geschützte, für Browserbenutzer nur lesbare Tabellen: shadow_positioning_legs, shadow_positioning_events.
- Neue Seite /positioning sowie Links aus Command Center und /flight-simulator.

## Erfolgreicher Integrationstest
Ein von der Originalsimulation ausgehend vollständiger **zurückgerollter Test** wurde durchgeführt:
1. Der alte synthetische Charterflug landet virtuell EDAZ → LIML (1,85 h).
2. Ein weiterer hypothetischer Charterflug ab EDAZ wird erzeugt.
3. Der Scheduler plant die virtuelle Rückpositionierung LIML → EDAZ (1,85 h), einschließlich 2 Stunden Puffer.
4. Die Positionierung startet, landet, erhöht die hypothetischen Stunden auf 3,70 und versetzt den ausschließlich virtuellen Standort zurück nach EDAZ.
5. Der nächste Chartersimulationsflug startet später vom richtigen hypothetischen Standort und schließt genau einmal ab.
6. Alle Integrationstestdaten werden auf Datenbank-Subtransaktionsebene zurückgerollt; die ursprüngliche Simulation bleibt unverändert.

## Grenzen
Keine echte Flugbewegung, keine operativen Flugpläne, kein Crew-Matching, keine medizinischen oder lizenzrechtlichen Betriebsfreigaben, keine geprüften Flughafen- oder Performancewerte und kein Charterumsatz im Finanz-Ledger. Die fiktiven Positionierungskosten werden nur angezeigt, **nicht** gebucht.
