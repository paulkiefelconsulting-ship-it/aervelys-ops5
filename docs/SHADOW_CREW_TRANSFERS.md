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
