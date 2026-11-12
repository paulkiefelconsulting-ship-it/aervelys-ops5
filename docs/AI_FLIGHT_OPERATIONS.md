# AERVELYS AI Flight Operations Manager – Bauabschnitt 1

**Status: Testbare Entscheidungslogik, noch keine aktive SimConnect-Bridge.** In diesem Schritt wurde kein Flugzeug im Simulator gestartet oder bewegt. Keine Produktionsdatenbank wurde geändert, keine Flugfreigabe automatisch erteilt und kein Hintergrunddienst aktiviert.

## Zielbild

Die AERVELYS-Flotte führt auch ohne User-Flug virtuelle Aufträge aus. Die Windows-Bridge stellt die Flugzeuge sichtbar dar, wenn sie sich in der Nähe des Spielers befinden. Start, Rollen, Landung und Parken müssen als echte beobachtete Simulatorereignisse bestätigt werden. Remote-Flüge laufen im AERVELYS-Unternehmensmodell weiter, ohne dass überall in MSFS gleichzeitig Flugzeuge gespawnt werden.

## Systemschichten

1. **AERVELYS OPS / Unternehmenswelt** – hält eindeutige Registrierungen, Crew, Flugauftrag, bestätigten Standort, Plan- und Istzeiten, Betriebsfreigabe und Kosten. Trennung zwischen geplant, virtuell simuliert und tatsächlich in MSFS beobachtet.
2. **Sichtbarkeitsplaner** (`lib/ai-traffic-planner.mjs`) – gibt nur Intents `spawnParked`, `setFlightPlan`, `removeObject` aus. Unterbindet Doppelgänger des User-Aircrafts, doppelte Registrierungen, unbekannte Positionen, parallele Operationen und Longitude in EDAZ. Standardmäßig höchstens drei nahe AI-Flugzeuge.
3. **Lokale Windows-Bridge** – **noch nicht gebaut**. Soll SimConnect-EX1-Aufrufe ausführen, Modell-/Livery-Verfügbarkeit prüfen, zurückgemeldete Objekt-IDs verwalten und bei Simulator-Neustart oder Verbindungsabbruch synchronisieren.
4. **Flugweg- und Bodenverkehrssteuerung** – **noch nicht getestet**. Benötigt eine reale Prüfung des SimDesign-EDAZ-Park-/Taxiway-Netzes, Taxiway-K-Anbindung und Parkpositionen. Nur ein Flugplan garantiert weder Pushback noch eine kollisionsfreie Rollfahrt.
5. **Ankunftssteuerung** – **noch nicht gebaut**. Landeanflug, Rollwegabfahrt und Einparken werden erst nach tatsächlichem MSFS-Test freigegeben.

## Technische Gates für den ersten MSFS-Test

- Ein geeignetes AI-Modell (zunächst ein ressourcenschonendes Standardmodell) in MSFS 2024 finden. Eine AERVELYS-Lackierung ist dafür nicht erforderlich.
- Ein Flugzeug auf einem freien Stand in EDAZ erzeugen; die SimConnect-Antwort `ASSIGNED_OBJECT_ID` abwarten.
- Einen vorher geprüften `.pln`-Flugplan genau einmal via `SimConnect_AISetAircraftFlightPlan` übergeben und den tatsächlichen Taxi-/Startablauf beobachten.
- Das aktive User-Aircraft darf nicht parallel als AI-Objekt existieren. Bei Übernahme des User-Aircrafts wird nur das von unserer Bridge erzeugte AI-Objekt entfernt.
- Keine Erzeugung außerhalb der lokalen MSFS-Reality-Bubble; die Unternehmenswelt merkt sich Flugzeuge außerhalb der Sichtweite.
- Anfangs ein Flugzeug testen, danach zwei und höchstens drei gleichzeitig; FPS und Speicher im Blick behalten.
- Erst nach Test der Abflüge die Ankünfte angehen: Anflug, Aufsetzen, Verlassen der Bahn, Taxi-in und Parkposition.

## Datenvertrag des ersten Moduls

- `aircraft`: `id`, `registration`, `status`, `aiModelTitle`, optional `aiLivery`, `aircraftType`, `currentIcao`.
- `operations`: `id`, `aircraftId`, `phase`, `dispatchApproved`, `planPath` (`.pln` lokal auf dem Windows-Rechner).
- `liveObjects`: durch **unsere** Bridge erzeugte AI-Objekte mit `aircraftId`, `objectId`, optional `loadedOperationId`.
- `observer`: verifizierte MSFS-Position des Users (`lat`, `lon`) sowie `aircraftId` oder `registration`.
- `airports`: verifizierte Flughafenkoordinaten, nicht aus Schätzungen übernommen.

Die reine Funktion `planAiTraffic` verändert keine Daten und startet keine externen Aktionen. Erst eine separat getestete Bridge darf die Intents in SimConnect-Befehle umsetzen.

## MSFS-2024-SDK

- `SimConnect_AICreateParkedATCAircraft_EX1` – ATC-Flugzeug auf verfügbarer Parkposition; ein bestimmter Stand wird dabei nicht garantiert.
- `SimConnect_AISetAircraftFlightPlan` – Flugplan zuweisen; tatsächliche Bewegung beobachten, nicht aus einem erfolgreichen API-Aufruf behaupten.
- `SimConnect_AIRemoveObject` – nur eigene AI-Objekte entfernen.
- `SimConnect_EnumerateSimObjectsAndLiveries` – verfügbare AI-Modelle/Lackierungen erkennen.
- `SIMCONNECT_RECV_ASSIGNED_OBJECT_ID` – asynchrone Objekt-ID nach Erstellung.

Offizielle Dokumentation: https://docs.flightsimulator.com/msfs2024/retail/programming-apis/simconnect/api-reference/ai-object/ai-objects/

## Nächster Umsetzungsschritt

Die erste **Windows SimConnect Test-Bridge** erstellen und bei EDAZ genau einen AI-Testflug von einer Parkposition auf eine kurze `.pln`-Route ausführen. Nach bestätigtem MSFS-Verhalten entscheiden wir zwischen nativem ATC-Taxi und einer eigenen Bodensteuerung. Das aktive SimDesign-EDAZ-Addon bleibt unangetastet.
