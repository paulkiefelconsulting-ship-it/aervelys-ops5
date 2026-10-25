# Verifizierbarer Entwicklungsstand

## Greenfield-Start 2026-10-25

- GitHub-Repository neu initialisiert.
- Next.js-/TypeScript-Anwendungsgerüst, Dashboard und Bootstrap-Health-Endpunkt angelegt.
- Keine produktive Supabase-Datenbank verbunden.
- Neues Supabase-Projekt: zur Kostenfreigabe offen (verifizierter Projektpreis 0 pro Monat im Free-Tarif).
- Noch kein vollständiger Build/Test auf Vercel verifiziert.
- Keine Datenmigration, kein externer Zahlungsvorgang, kein Flug aktiviert.
- Keine 30-Tage-Betriebssimulation durchgeführt.

## Abnahme vor P1

1. Neues Supabase-Projekt mit eigenem Ref anlegen und URL sowie Publishable Key sicher konfigurieren.
2. Auth, RLS, Zugriffskonzept und neues Schema versioniert anlegen.
3. Build, DB-Migrationen, Sicherheitsadvisors und Tests verifizieren.
4. Keine Geheimnisse in Git committen.
