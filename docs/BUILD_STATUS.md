# AERVELYS OPS 5.0 – verifizierbarer Entwicklungsstand

Stand: 2026-10-25.

## Abgeschlossen
- Eigene neue GitHub-Codebasis und Supabase-Free-Datenbank in Frankfurt.
- Supabase-Migrationen für 7 Tabellen, RLS und Reservierungsschutz; Sicherheitsadvisor 0 Warnungen nach Hardening.
- GitHub Actions Build + Bootstraptests erfolgreich (siehe Run 40235381428).
- Next.js SSR-Auth-Code, Login und Logout, geschützte Dashboard-Route, Owner-gefilterte SQL-Abfrage wurden implementiert (End-to-End-Test ausstehend).
- Der Hosting-Zustand und der Datenbank-Bereitschaftsstatus werden ausdrücklich unterschieden.

## Noch offen
- Vercel-Projekterstellung mit verbundenem Team ist aufgrund 403 gesperrt.
- Vercel-Environment Variables noch nicht gesetzt, daher kein Live-Login.
- Ein echtes Geschäftsführer-Auth-Konto wurde noch nicht eingerichtet; keine Organisationszuordnung.
- Keine alten Stammdaten importiert, keine freigegebenen operativen Module oder Hintergrundjobs.
- Vollständiger End-to-End-Test der Anmeldung und autorisierten RLS-Operationen ausstehend.
- Die volle Simulationsplattform und 30-Tage-Abnahme sind noch nicht fertig.

Anleitung unter `docs/AUTH_AND_DEPLOYMENT.md`.
