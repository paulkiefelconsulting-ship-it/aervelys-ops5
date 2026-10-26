# AERVELYS OPS 5.0 – Virtuelles Maintenance & Technical

**Stand:** 26. Oktober 2026

Datenbankmigrationen:
- `20261026174140_ops5_shadow_maintenance_foundation.sql`
- `20261026174232_ops5_shadow_maintenance_dispatch_gates.sql`

## Funktionierende Simulation
Die vorhandene stündliche Shadow-Flight-Engine verwaltet jetzt fiktive Wartungszustände aller fünf Flugzeuge. Sie verwendet ausdrücklich erfundene Schwellenwerte von **20,00 Modellflugstunden** für jedes Muster und **12 Stunden** fiktiver Standzeit. Die tatsächlichen Herstellerintervalle und technischen Freigaben sind unbekannt.

Bei Erreichen der Modellsicherheitsgrenze wird das Flugzeug innerhalb der Simulation automatisch gesperrt. Erst nach der simulierten Wartungsdauer und bei hypothetisch geparktem Flugzeug kann der virtuelle Wartungszustand auf `clear` zurückgesetzt werden. Die neue Grenze folgt den bis dahin akkumulierten Modellstunden.

Charter- und Positionierungsflüge werden **vor virtuellem Abflug** geprüft: Ist die Maschine virtuell gesperrt oder würden die vorgesehenen Blockstunden das Restintervall überschreiten, wird der Flug `blocked_maintenance`. Es wird kein virtueller Abflug und kein Abschluss erzeugt.

Zwei neue Owner-RLS-geschützte Tabellen speichern den Wartungszustand und unveränderliche Wartungsereignisse. Die neue Seite `/maintenance` zeigt pro Maschine Modellstunden, hypothetischen Standort, verbleibendes Stundenbudget, Grounding und Wartungsereignisse. Das Flottenregister sowie die virtuellen Flug- und Überführungsansichten sind verlinkt.

## Durchgeführte Integrationstests
- Für D-CJPK bei 20 Modellstunden wurde ein virtuelles Grounding erzeugt.
- Nach 11 Stunden bleibt die Maschine virtuell gesperrt; nach 13 Stunden ist die erfundene zwölfstündige Wartung abgeschlossen, die nächste Grenze liegt bei 40 Stunden.
- Ein zukünftiger Charterflug mit 1,85 Modellstunden wurde bei 19,50 akkumulierten Stunden blockiert; kein Flugabschluss angelegt.
- Eine virtuelle Rückpositionierung LIML–EDAZ wurde bei denselben 19,50 Stunden ebenfalls blockiert.
- Alle Teständerungen wurden vollständig über Datenbank-Subtransaktionen zurückgerollt. Produktiv: fünf clear-Zustände, null Wartungsereignisse und null operative Flugpläne.

## Grenzen
Das Modul bearbeitet **nur fiktive technische Szenarien**. Es verwaltet weder echte Lufttüchtigkeitsnachweise noch Hersteller-Wartungsprogramme, MEL/CDL, AD/SB, reale Ersatzteile, tatsächliche Wartungsarbeiten oder einen Freigabeberechtigten. Es verändert nicht die operative Flotte, Crew-Stammdaten, Bankkonten oder reale Flugstunden. **Eine virtuelle Wartung ist keine operative Freigabe.** Der Ablauf ist deterministisch und enthält noch keine generative KI-Agentensteuerung.
