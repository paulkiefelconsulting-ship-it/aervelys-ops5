# AERVELYS OPS 5.0 — Virtuelle Crewtransfers mit automatischem Abschluss

Stand: 08.11.2026.

## Implementiert
- Geschützter Bereich `/crew-travel` zeigt neben bisherigen PIC-/SIC-Reisevorschlägen eine **Bestätigungsfunktion** für einen zuvor einem virtuellen Flug zugewiesenen Piloten.
- Ein bestätigter Reiseauftrag besteht aus ein oder zwei simulierten Reiseabschnitten (Shuttle, Bahn, Linienflug) aus dem unveränderlichen vom Organisationsinhaber angelegten Reisekatalog.
- Vor INSERT prüft ein Postgres-Trigger **erneut**, ob der Benutzer die Organisation besitzt, der Mitarbeiter tatsächlich dem geplanten Shadow-Charter zugewiesen wurde, alle Reiseoptionen zur Organisation gehören, Richtungen, Dauer, 45-minütige Umsteigezeit, Kosten, Berichtzeit am Charter- oder Ferry-Start und Zeitkonflikte stimmen.
- Die virtuelle Crew hat dadurch **noch nicht** den Flughafen gewechselt: nur `planned` wird gespeichert, inkl. separatem unveränderlichem `planned`-Auditereignis.
- Ein getrenntes pg_cron-Simulationsprogramm (`*/5 * * * *`) überprüft die Crewposition aus letztem abgeschlossenen *hypothetischen* Crew-Flug, Ferry- oder Ground-Transfer bzw. einmaligem Owner-Startcheck-in. Blockierte Zwischenbewegungen oder veraltete Evidenz führen zu einem gesperrten Auftrag.
- Bei erfolgreichem virtuellen Reisebeginn erhält der Auftrag `enroute`; nach simulierter Ankunft `completed_virtual`, plus unveränderliche `shadow_crew_movements` mit `source_kind='ground'`.
- Bei Ankunft wird einmalig ein Eintrag in `shadow_crew_travel_expenses` erzeugt. Diese *hypothetischen* Reisekosten haben `cash_movement=false`; sie sind keine reale Zahlung oder Kontoänderung.
- Bereits bestehende `record_shadow_crew_arrival`-Funktion für fiktive Charter- und Ferryflüge greift danach auch auf diese validierten Ground-Ankünfte zurück.
- Die Web-Oberfläche zeigt Reiseaufträge, Status, Kosten *vorgemerkt* oder *simuliert gebucht* und die berücksichtigten Standortwechsel in Virtual Crew Control.

## Einschränkungen
- Ausschließlich virtuelles Rollenspiel; kein Ticket wird bei einer Airline, Bahn oder Shuttle-Firma gekauft.
- Keine Änderung an `crew_location_events` (operative Standortnachweise), Flottenstammdaten, realen Dienststunden, tatsächlichen MSFS-Flügen, Geldkonten oder realen Einnahmen.
- Vor der virtuellen Reiseplanung muss der Inhaber den Anfangsstandort festlegen, eine fiktive Verbindung mit Dauer und Preis anlegen und PIC bzw. SIC dem Shadow-Flug zuordnen. **Die vollautomatische PIC-/SIC-Zuweisung ist noch nicht freigegeben.**
- 11h30 konservativer Puffer nach abgeschlossenen fiktiven Diensten ist nur eine Simulationsregel, keine vollständige EASA-FTL-Compliance. Bereits vorhandene Mitarbeiterqualifikationen sind weiterhin nicht als real operative Type Ratings geprüft.
- Für automatische Hotelbuchung, Rückreisen, dynamisches Crew-Swapping und Preisvariationen pro Kalendertag sind weitere Module nötig.
- Ein virtuelles Reiseereignis kann eine virtuelle Weiterverwendung im Shadow-Geschäft ermöglichen, ist aber kein Nachweis einer real geflogenen Strecke.

## Technischer Stand
- Migration `20261108071000_ops5_shadow_crew_transfer_lifecycle.sql`, nur für Supabase `olcuzlrhyintuqmcftvl`.
- Webroute `/crew-travel`, Server Action `app/crew-travel/schedule-transfer.ts` und Node-Securitytests.
- Kein Seed von Mitarbeiterstandorten, Crewpositionierungen oder fiktiven Ausgaben.
- Ein vollständig automatischer virtueller Dispatch kann die bestehenden `shadow_crew_assignments` und Reisekataloge später nutzen; eine separate Crewqualifikations- und Ruhezeitprüfung bleibt dafür Pflicht.

## Aktivierung und Tests vom 08.11.2026
- Migration `ops5_shadow_crew_transfer_lifecycle` angewendet; drei geschützte Shadow-Tabellen, 5-Minuten-pg_cron und Worker erfolgreich gestartet (ohne gespeicherte Transfers).
- Migration `ops5_shadow_crew_transfers_before_flights` angewendet; der stündliche Worker verarbeitet Crewtransfer-Ankünfte zuerst und erst anschließend virtuelle Ferry-/Charterflüge.
- SQL-Migrationscode wurde zuerst innerhalb von `BEGIN / ROLLBACK` gegen die echte OPS5-Datenbank getestet; der Test hat keine Tabellen oder Cronjobs hinterlassen.
- Geprüfte Bestände: 31 Mitarbeiter, 5 Flugzeuge, 0 echte Crewstandort-Nachweise, 0 virtuelle Crewbewegungen und 0 virtuelle Transferaufträge. Kein Testdatensatz wurde dauerhaft angelegt.
- **Nicht automatisch aktiv:** Die Benutzeroberfläche benötigt zuerst einen bestätigten virtuellen Ausgangsstandort, einen Katalogpreis und die Szenario-PIC/SIC-Zuweisung. Ohne diese bleiben Reiseaufträge leer.
- Vercel-Web-Deployment nach GitHub-Merge noch separat zu prüfen; ein erfolgreicher GitHub-Build ist kein Beleg für die neue Live-Version.

## Ergänzung vom 10.11.2026 – Anschlussflug nach Ground-Transfer

- Der Crew-Reiseplaner liest jetzt die tatsächlich gespeicherte `source_kind`-Provenienz aus `shadow_crew_movements`.
- Nach `completed_virtual` eines **Ground-Transfers** ist der fiktive Ankunftsort für die unmittelbar folgende Shadow-Chartermission nutzbar. Wenn der Crew-Report am selben Ort beginnt, wird **keine zweite fiktive Anreise** vorgeschlagen und kein weiterer Transferpreis berechnet.
- Der simulierte 11h30-Ruhepuffer nach einem vorherigen **Charter- oder Ferryflug** bleibt bestehen. Ein späterer Ground-Transfer darf die letzte Flug-Dienstlandung nicht überschreiben oder die Ruhezeit aufheben.
- Nicht dokumentierte oder unbekannte Bewegungsarten bleiben konservativ als mögliche Dienstzeit gewertet. Eine unterbrochene bzw. widersprüchliche Bewegungskette bleibt blockiert.
- Die Verbesserung ändert weder die SQL-Worker noch Transfers oder Finanzbuchungen. Für gesetzliche Dienstzeit-, Reisezeit-/FTL- oder Type-Rating-Freigaben sind weiterhin separate Nachweise nötig.
- Tests: `tests/crew-travel-arrival-continuity.test.mjs`.

## Erweiterung 10.11.2026 – übergreifendes virtuelles PIC-/SIC-Crewing

- Der Bereich `/crew-travel` enthält nun zusätzlich **Koordinierte Crewvorschläge** über alle geplanten Shadow-Flüge statt nur isolierter Einzelvorschläge.
- Die reine Funktion `lib/shadow-crew-dispatch.mjs` verwendet vorhandene `proposeShadowCrewTravel`-Kandidaten (keine zweite eigenständige Crew- oder Kunden-Datenquelle). Bereits gespeicherte Zuordnungen bleiben vorrangig und dürfen nicht durch andere Vorschläge überschrieben werden.
- Pro virtuellem Flug werden ein PIC und ein anderer SIC nach modellierten Reise-Kosten und deterministischer Reihenfolge vorgeschlagen. Bei fehlenden/gesperrten Kandidaten bleibt der Flug im Ergebnis blockiert.
- Mehrere vorgeschlagene Flüge werden zeitlich und geografisch koordiniert: Eine Crew darf in der unverbindlichen Vorschau nur nach konservativem 11h30-Puffer und passendem vorherigen Zielort für eine weitere Mission erscheinen. Ein anderer Standort wird nicht automatisch teleportiert.
- Gespeicherte Doppelzuordnungen werden kenntlich gemacht; fehlende Reiseketten, Beschränkungen der Longitude/Phenom und Probleme der Standortbelege bleiben eigene Sperrgründe des bestehenden Reiseplaners.
- Die Berechnung erfolgt in Abflugreihenfolge als **greedy Vorschau**, nicht als globale Optimierung, tatsächliche Crewzuweisung, Flugfreigabe oder Planung aller möglichen EASA-FTL-Dienstblöcke.
- **Keine Schreiboperationen**: keine neuen Reiseaufträge, Mitarbeiter-/Flight-Mutationen, RLS-Änderungen, SQL-Migrationen oder tatsächlichen Ausgaben.
- Tests: `tests/shadow-crew-dispatch.test.mjs`.
