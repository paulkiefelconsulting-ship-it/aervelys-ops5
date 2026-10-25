# AERVELYS OPS 5.0 – Modulstand (2026-10-26)

Alle 16 Module sind über die geschützte Navigation erreichbar und lesen Datensätze aus der neuen Supabase-Datenbank.

14 Entwurfsbereiche: Executive Management, Fleet Management, Crew Management, Flight Operations, Predictive Scheduling, Ground Operations, Sales & Charter, Customer Management, Simulation Banking, Finance & Accounting, HR & Payroll, AI Workforce, Internal Communication und Safety & Compliance.

2 Leseansichten: Simulation Engine (angehaltene Simulationsuhr) und Monitoring & Recovery (Auditprotokoll).

**Funktionsgrenze:** Anlage und Anzeige von Entwürfen, keine Updates/Deletes, keine Freigaben, keine realen Überweisungen oder Buchungen, kein Nachrichtenversand, keine KI-Ausführung. Flugzeuge werden inaktiv angelegt, Crew als draft und Scheduling nur als option. Uhrzeiten werden als UTC erfasst.

Technisch: neues Supabase-Projekt olcuzlrhyintuqmcftvl, 19 Tabellen mit RLS, 15 Insert-Audit-Trigger. Organisationszuordnung serverseitig; Row Level Security erzwingt Eigentümerrechte; keine clientseitige Organisationsauswahl. Das Altsystem bleibt unverändert.

Abnahme: GitHub Actions npm ci, npm test, TypeScript und Next.js Build. Anschließend im Browser /modules/fleet, /modules/crm und /modules/observability testen. Automatisierte Flugsicherheit, Crew-Qualifikationen, Scheduler-Optimierung und Finanz-Ledger sind spätere Phasen.

Offener Security Advisor-Hinweis: Leaked Password Protection Disabled.
