# AERVELYS OPS 5.0 – Verifizierbarer Entwicklungsstand

Stand: 2026-10-25. Neues Projekt ohne Migration aus dem Altsystem.

## Nachweisbar abgeschlossen
- Eigenständiges GitHub-Repository initialisiert: `paulkiefelconsulting-ship-it/aervelys-ops5`.
- Next.js-/TypeScript-Grundgerüst und nicht-operatives Command Center angelegt.
- GitHub Actions Bootstrap-Tests und Next.js-Build erfolgreich (Run 40233362089).
- Neues Supabase-Projekt `AERVELYS OPS 5.0` mit Referenz `olcuzlrhyintuqmcftvl` in `eu-central-1` erstellt. Status `ACTIVE_HEALTHY`.
- Vor Anlage per Supabase verifiziert: Free-Tarif, Projektkosten 0/Monat.
- Migrationen `20261025212128_ops5_initial_foundation` und `20261025212248_ops5_security_and_fk_indexes` erfolgreich angewendet.
- Sieben Tabellen erstellt (`organizations`, `aircraft`, `employees`, `simulation_clock`, `resource_reservations`, `job_queue`, `audit_events`).
- Alle sieben Tabellen mit RLS, sieben Owner-Read-Policies. Keine anonymen Tabellenberechtigungen.
- Verified: Exclusion-Constraint verhindert überlappende bestätigte Flugzeug-Reservierungszeiträume auf Datenbankebene (strukturell geprüft; Simulationstests noch ausstehend).
- Supabase Security Advisor: 0 Warnungen nach Hardening-Migration; verbleibende Performance-Hinweise zu ungenutzten neuen Indexen sind mangels Daten/Traffic zu erwarten.

## Noch nicht abgeschlossen
- Vercel-Projekt konnte nicht angelegt werden: verbundene Berechtigung erhielt HTTP 403.
- Web-App ist noch NICHT per Umgebungsschlüssel mit der neuen Supabase-DB verbunden.
- Keine authentifizierten Geschäftsführer-Nutzer / Accounts angelegt.
- Keine Crew, Flugzeuge, Jobs, Finanzbuchungen oder Simulationsdaten importiert.
- Keine tatsächlichen Flüge, operativen Buchungen oder KI-Agenten aktiv.
- End-to-End-Betriebstest und 30-Tage-Simulation noch nicht durchgeführt.

## Nächste sichere Schritte
1. Vercel-Berechtigung zur Projekterstellung herstellen; dediziertes Projekt `aervelys-ops5` mit GitHub verknüpfen.
2. Neue Supabase-URL und Publishable Key ausschließlich im passenden Vercel-Projekt konfigurieren; keine Service-Keys in Browser oder Git.
3. Geschäftsführungs-Authentifizierung und deterministische Rollenregelung implementieren.
4. Datenmodell für Charter-Aufträge, Crew-Qualifikationen, Kosten und Ledger schrittweise, versioniert und getestet erweitern.
5. Echte Produktivsetzung ausschließlich nach voller Prüfung und gesonderter Freigabe.
