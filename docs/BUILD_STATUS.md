# AERVELYS OPS 5.0 – verifizierbarer Entwicklungsstand

Stand: 2026-10-26.

## Abgeschlossen
- Eigene neue GitHub-Codebasis und unabhängige Supabase-Free-Datenbank in Frankfurt.
- Zwei Supabase-Migrationen für 7 Tabellen, RLS und Sperre überlappender Flugzeugreservierungen.
- Next.js SSR-Auth-Code, Login und Logout, geschützte Dashboard-Route und Owner-gefilterte Datenbankabfrage sind implementiert.
- GitHub Actions mit festem npm-Lockfile: Tests, TypeScript und Next.js-Build erfolgreich (Run 40238286224).
- Vercel wurde vom Betreiber über das Dashboard erfolgreich eingerichtet; bereitgestelltes Projekt laut Screenshot `aervelys-ops5-1` mit Status Ready. Die ChatGPT-Vercel-Verbindung sieht dieses Projekt weiterhin nicht; deren Berechtigungs-/Teamkontext muss separat geklärt werden.
- Im **neuen** Supabase-Projekt existiert genau ein bestätigtes, nicht gelöschtes Auth-Konto (Stand der Datenbankprüfung).
- Eine eigenständige Organisation `AERVELYS` mit EUR als Währung wurde eingerichtet und diesem Konto als `owner_user_id` zugeordnet.
- Zuordnung verifiziert: gültiger Auth-Eigentümer, genau eine Organisation, authentifizierte Lese-Berechtigung und Owner-RLS.
- Keine personenbezogenen Kennungen oder Anmeldedaten im Repository gespeichert.

## Sicherheitsstand
- Alle 7 App-Tabellen mit RLS und Owner-Read-Policies.
- Aktueller Supabase Security Advisor meldet `Leaked Password Protection Disabled`. Passwort-Leak-Schutz wenn im Tarif verfügbar aktivieren; nicht als behoben markieren.
- Öffentliche Benutzerregistrierung deaktivieren und im Supabase-Dashboard kontrollieren (noch nicht durch Tools verifiziert).
- Keine geheimen Admin-Schlüssel für den Browser ausgeben.

## Noch offen
- Benutzer muss den echten Login unter `https://aervelys-ops5-1.vercel.app/login` durchführen; dieser wurde aus ChatGPT nicht als End-to-End-Anmeldung bestätigt.
- Vercel-Umgebungswerte wurden vom Betreiber im Formular hinterlegt; die ChatGPT-Vercel-Verbindung konnte deren gültigen Inhalt nicht unabhängig prüfen.
- Keine alten Stammdaten importiert, keine freigegebenen operativen Module oder Hintergrundjobs.
- Authentifizierte Datenbankabfrage im Browser und Logout noch als E2E-Tests durchführen.
- Vollständige Simulationsplattform und 30-Tage-Abnahme ausstehend.

Anleitung unter `docs/AUTH_AND_DEPLOYMENT.md`.
