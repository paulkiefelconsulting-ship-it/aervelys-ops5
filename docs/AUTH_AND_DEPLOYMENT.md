# P1 – Auth & Deployment Handbuch

Stand: 2026-10-25

## Vorhanden
- Neues, **separates** Supabase-Projekt `olcuzlrhyintuqmcftvl` (Frankfurt).
- Next.js SSR-Auth-Bausteine, Server Action zur Anmeldung mit E-Mail und Passwort, Abmeldung.
- Session-Refresh im Next.js `proxy.ts` über `auth.getClaims()`.
- Geschützte Command-Center-Startseite, überprüfte Anmeldung mit `getUser()`, Besitzerzuordnung zusätzlich über RLS.
- Kein Signup, keine Selbsterteilung von Geschäftsführerrechten und keine automatische Erzeugung von Organisationen.
- Auf privates Simulationsbanking und Finanzoperationen gibt es weiterhin keine schreibende Weboberfläche.

## BLOCKER: Vercel
Die verbundene Vercel-Integration meldete beim Erstellen von `aervelys-ops5` HTTP 403.
Ein Projekt kann dadurch aktuell nicht angelegt oder verbunden werden.

**Notwendige Aktion mit Berechtigung im Vercel-Dashboard:**
1. Team `paulkiefelconsulting-9108` öffnen.
2. Neues Projekt `aervelys-ops5` anlegen.
3. GitHub-Repository `paulkiefelconsulting-ship-it/aervelys-ops5` verbinden.
4. Framework `Next.js`, Root Directory `./`, Production Branch `main` wählen.
5. Unter Project Settings → Environment Variables die zwei nachfolgenden Variablen für Production, Preview, Development setzen:
   - `NEXT_PUBLIC_SUPABASE_URL` = `https://olcuzlrhyintuqmcftvl.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` = Publishable Key aus dem neuen Supabase-Projekt, Settings → API Keys.
6. Keine `sb_secret_`, `service_role` oder Datenbankpasswörter in `NEXT_PUBLIC_`-Variablen oder Git.
7. Ein Preview-Deployment bauen. Noch keine Produktivfreigabe.

## Geschäftsführer-Identität (noch nicht angelegt)
Im **neuen** Supabase-Projekt unter Authentication → Users einen Auth-Nutzer administrativ anlegen.
Sein Passwort niemals in diesen Chat oder Git committen.
Anschließend die eigene Nutzer-UUID verifizieren. Die Organisationszuordnung muss bewusst administrativ und getrennt erfolgen. Beispiel nur für freigegebene Admin-SQL-Ausführung:

```sql
-- Identität zuerst in auth.users überprüfen; niemals eine UUID raten.
-- EINMALIG und nur im neuen Supabase-Projekt ausführen.
insert into public.organizations (name, owner_user_id, currency)
values ('AERVELYS', '<VERIFIZIERTE_AUTH_USER_UUID>', 'EUR');
```

Die Organisationstabelle besitzt derzeit ausschließlich eine authentifizierte Owner-SELECT-RLS-Policy. Es existiert kein öffentlicher Organisationsanlageweg. Ein Nutzer ohne passend zugeordnete Organisation sieht keine Geschäfts- und Flottendaten.

## Prüfungen
- GitHub Actions: `npm test`, `npm run typecheck`, `npm run build`.
- Supabase: `get_advisors(security)`, überprüfen, dass alle `public`-Tabellen RLS aktivieren.
- Erst nach Einrichtung von Vercel-Env und Benutzer: reale Login-/Logout-Sitzung und RLS-Datensicht testen.
- Backend-Simulation und autonomer Betrieb bleiben deaktiviert.
