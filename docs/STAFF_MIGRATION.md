# AERVELYS OPS 5.0 – kontrollierter Personalimport

Stichtag: 2026-10-26. Die alte Datenbank wurde für diese Übernahme **ausschließlich gelesen**.

## Nachweisbar importiert
- 21 Crew-Stammsätze (11 PIC einschließlich Owner Pilot; 10 SIC), inklusive alter Personalnummern, historischer Homebases und Eintrittsdaten.
- 10 OPS-Stammsätze (1 Leitung, 6 Dispatcher, 3 Support). Die bestehende Dispatch-Qualifikation ist eine **interne Simulationsberechtigung**.
- 45 reguläre/Altbestand-Qualifikationseinträge einschließlich Owner-Phenom sowie **1 zusätzlicher Global-6000-Simulationsanspruch** = 46 unverifizierte Claims.
- 45 Quellen-Nachweise für Lizenz-, Operator- und Line-Check-Gültigkeiten; 21 Medical-Ablaufdaten.
- 192 alte Credential-Metadaten, 21 simulierte Verträge und 42 Jahresurlaubsansprüche.
- 2 gesonderte Simulationsberechtigungen und 1 Simulationslizenz-Nachweis.
- Personendatensätze haben stabile Legacy-Referenzen; im neuen System separate UUIDs. Der Import war dedupliziert.
- 31 Mitarbeitereinträge im Auditprotokoll.

## Sicherheits- und Freigabegrenzen
- `public.employees` und `public.crew_qualifications` sind über Organisations-Owner-RLS lesbar.
- Der neue operative Beschäftigungsstatus ist bewusst **draft**, der behauptete Altstatus steht als `legacy_active_simulated` daneben.
- Qualifikationen tragen `status=draft`, CAT/IFR stehen ausschließlich als **historische Datenkennzeichen** (`cat_recorded` und `ifr_recorded`) zur Verfügung.
- Für EMB-505 ist CAT=false / IFR=false im bisherigen regulären Eintrag erhalten. Phenom und Global 6000 besitzen separate Simulationsberechtigungen. Eine echte regulatorische Betriebsfreigabe wird daraus nicht abgeleitet.
- Gültigkeiten, Medicals, simulierte Gehälter und Urlaubsansprüche liegen im Schema `ops_private`, das **nicht** als Data API exponiert oder für `anon`/`authenticated` freigegeben ist. Es existieren dort ausschließlich Backend-Administrationszugriffe; alle Privattabellen haben RLS.
- Keine Live-Crew-Zuteilung, Flugfreigabe, KI-Ausführung oder Gehaltsbuchung aktiviert.
- OPS-Homebases waren in der bestätigten Nutzerliste nicht benannt; vorhandene alte aktuelle Standorte wurden **nicht** als Homebase interpretiert.
- Restliche Bereiche (Cabin, Sales, Finance, HR, Technik etc.) benötigen eigenständigen Abgleich, da die alten Kernpersonal-Tabellen nur 31 Einträge enthalten.
- Crew-Roster, Duty-Historie, bereits geplante Flüge und Abwesenheitskalender wurden **nicht aktiviert oder unbesehen importiert**.
- Vor Freigaben prüfen: Lizenzoriginale, Medical, Operator/Line-Checks, Typberechtigung, Dienst- und Ruhezeit, Standort, genehmigten Urlaub, Überschneidungsverbote sowie Crew-Anforderungen.

## Technische Migrationen
- `20261025235447_ops5_roster_roles_and_unverified_qualifications.sql`
- `20261025235903_ops5_staff_evidence_and_protected_hr.sql`
- `20261026000116_ops5_simulation_authorization_evidence.sql`

**Wichtig:** Die individuellen Personal- und Vergütungswerte sind ausschließlich in Supabase importiert und **nicht als Seeddateien im GitHub-Repository**.
