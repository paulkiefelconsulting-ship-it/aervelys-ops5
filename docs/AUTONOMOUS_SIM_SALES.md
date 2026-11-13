# AERVELYS OPS5 — Autonomous SIM Sales v1

Status: 13.11.2026 · **laufende NPC-Vertriebssimulation**, nicht generative KI und keine echte Charterannahme.

## Ablauf ohne CEO-Eingaben

1. Der bestehende tägliche `simulation_market_day` erzeugt die fiktive Charteranfrage weiterhin an der **einen** autoritativen Stelle: `charter_requests` mit `origin='simulation'`.
2. Der eigene, intern beschränkte Datenbankjob `aervelys-ops5-autonomous-sales-30min` läuft **zweimal stündlich** und ordnet der Anfrage einen von **144 automatisch erzeugten, wiederverwendbaren virtuellen Unternehmenskunden** zu.
3. Bereits vorhandene illustrative Preise und Kosten aus `charter_assessments` werden zu ausdrücklich **unverbindlichen SIM-Richtpreisen**, nicht zu Verträgen. Fehlende Preisgrundlagen bleiben offen; der Automat kann einen später nachgereichten Modellpreis selbst aufgreifen.
4. Nach mindestens 30 Minuten reagiert der virtuelle Kunde reproduzierbar: Interesse, modelliertes Gegenangebot oder Absage. Die Gegenangebotshöhe berücksichtigt eine fiktive Preissensitivität der Kundenpersona.
5. Sales beantwortet Gegenangebote erneut ohne Benutzereingabe. Unterhalb 15 % Modellaufschlag auf die gespeicherten modellierten Kosten erfolgt eine simulierte Ablehnung. Andernfalls entsteht lediglich `interested_pending_ops` – **kein** bestätigter Flugauftrag.
6. `/sales-autopilot` zeigt virtuelle Kunden, Fälle, Preisindikationen, Kundenreaktionen, Dispositionssperren und unveränderliche Nachrichtenereignisse; diese Seite benötigt keine Formulare.

## Datenherkunft / Schutz

- Neue isolierte Quellen: `sim_crm_personas`, `sim_sales_cases`, `sim_sales_messages`, `sim_sales_runs`.
- Fälle haben zusammengesetzte Organisations-Foreign-Keys auf **bestehende** `charter_requests` und die neuen Kundenpersonas.
- Authentifizierte Owner können ausschließlich lesen (RLS); alle Schreibrechte für `anon` und `authenticated` sind entzogen. Hintergrundjob ist nur innerhalb der geschützten Datenbank ausführbar.
- Wiederholte oder parallele Jobs verwenden einen Transaktions-Advisory-Lock und eindeutige `(organization_id, request_id)`-Fälle.
- `simulation_only=true`, `contract_confirmed=false`, `flight_released=false` und `external_delivery=false` sind DB-Checks.
- Keine neuen Datensätze in den echten/älteren `customers`-Stammdaten; keinerlei Kontaktadressen oder Kontaktdaten werden generiert.
- Bestehende Charteranfragen und -bewertungen werden **nicht** verändert. Keine Crew-/Aircraft-Zuweisung, kein Flugstatus, kein Payment, kein Flugerlös, keine externe Mail, keine echten Kunden.
- Die autonome Kundenreaktion ist bewusst **regelbasiert und deterministisch**, nicht eine unbelegte generative Sprach-KI.

## Einführungsprüfung

- SQL-Migration mit echten vorhandenen SIM-Requests im Transaktions-Rollback getestet: 144 Personas, 9 angehängte Sales-Fälle, mehrstufige Dialoge; 0 operative Freigaben oder externe Nachrichten.
- Nach GitHub-CI Migration einsetzen, einen initialen Worker-Lauf durchführen und RLS, Größen, Dubletten und Cron-Status aus SQL bestätigen.
- Ein Github-Build ersetzt keinen Browser-E2E nach Vercel-Veröffentlichung.

## Noch offen bis zur vollständigen Autonomie

- Kundenagenten mit individuell persistierten Präferenzen und fortlaufenden längeren Dialogen anstelle deterministischer Gesprächsvarianten.
- Validierte fiktive Flugzeug-/Crewbereitschaft und atomare simulierte Reservierungen, bevor aus `interested_pending_ops` ein ausführbarer, gebuchter Charterauftrag werden darf.
- Flugzeuge mit Szenariostatus statt Umgehen der `inactive`-operativen Flotte; Phenom 300E weiterhin nicht für Charter, Longitude ab EDDB statt EDAZ.
- End-to-End MSFS/SimBrief, Kabine, Postflight-Debrief und in-game Finanzen als eindeutiges Flug-Lifecycle.
