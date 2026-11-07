# AERVELYS OPS 5.0 — Virtual Crew Movement Control

Stand: 07.11.2026. Nur für die **abgekapselte Was-wäre-wenn-Flugsimulation**.

## Funktionierende Bausteine im Source
- Neue Seite `/shadow-crew` zeigt alle vorhandenen `shadow_flights`, die 21 PIC-/SIC-Profile, Szenariobesetzungen und daraus resultierende hypothetische Crewbewegungen.
- Der Inhaber kann **vor Abflug** einem **geplanten virtuellen Flug** genau einen PIC und einen SIC zuordnen. Beide kommen aus den unveränderten bestehenden Personalstammsätzen.
- Eine transaktional gesperrte Person kann nicht parallel auf einem zeitlich überlappenden anderen synthetischen Flug eingetragen werden. Zugriffe sind owner- und organisationsgebunden.
- Beim **tatsächlichen Abschluss eines shadow-Flugs** löst der Insert in `shadow_flight_outcomes` automatisiert eine separate Crewbewegungsprüfung aus.
- Beim **Abschluss eines virtuellen Ferryflugs** löst der Statuswechsel in `shadow_positioning_legs` dieselbe Crewprüfung aus. Dabei werden die vor dem Ferryflug zugeteilten Crewmitglieder des Anschlusscharters verwendet.
- Die Prüfung benötigt einen früheren ausdrücklich bestätigten **virtuellen Ausgangsstandort** (`crew_location_events` einmaliger Owner-Check-in) oder eine zeitlich gültige vorherige hypothetische Crewbewegung.
- Fehlen Ausgangsort, Zeitpuffer oder lückenlose Ortskette, wird ein unveränderlicher **blockierter Crewbewegungsdatensatz** geschrieben und **kein** Standortwechsel angenommen.
- Bei gültiger Kette wird eine `completed_virtual`-Ankunft in der **ausschließlich hypothetischen** Tabelle `shadow_crew_movements` protokolliert.
- RLS, append-only-Trigger, Quellen-/Mandanten-FKs und Unique-Indizes schützen die Ereignisse gegen unbefugtes Ändern, Doppelbuchung und wiederholte Abschlussereignisse.

## Bewusst nicht umgesetzt
- `crew_location_events` (quellbasierte Crewstandorte) bleibt vollständig **unangetastet**. Ein fiktives Shadow-Szenario gilt **nicht** als echte MSFS-Flugbewegung oder realer Crew-Einsatz.
- Die importierten Mitarbeiter und Typqualifikationen sind derzeit `draft`. `shadow_crew_assignments` sind deshalb **rein narrative Szenariobesetzungen**, keine lizenzierte operative Personaleinteilung.
- Für Ground-Positionierung (Shuttle, Zug, Linienflug) fehlen noch belegte Transferleistungen, separate Crew-Missions sowie Kosten und Arbeitszeitnachweise. Falscher Startort bleibt ein Sperrgrund.
- Keine automatische Einteilung nach Qualifikation/FTL. Der Benutzer wählt die Story-PIC/SIC-Person vorerst bewusst selbst aus.
- Keine Verifikation von MSFS-Telemetrie. Dafür wird später ein eigener, nicht-shadow-basierter Ingest mit sicherer Herkunftsprüfung benötigt.

## Beispiel
Ein PIC wird einmalig als virtueller Ausgangsstandort EDAZ bestätigt. Wird diese Person einem künftigen hypothetischen Flug `EDAZ → LOWW` vor dem Start zugeordnet und schließt die Simulation diesen Flug ab, schreibt der Trigger eine `completed_virtual`-Crewbewegung. Ein anschließendes Szenario `LOWW → EDDB` kann an dieser hypothetischen Ankunft anknüpfen. Eine Crew am falschen Flughafen wird **nicht** automatisch versetzt.

## Datenbank-Grenzen
Die Migration `20261107140000_ops5_shadow_crew_movement.sql` darf **nur** auf `olcuzlrhyintuqmcftvl` (AERVELYS OPS 5.0) angewandt werden. Weder NEXT noch altes OPS ändern.
