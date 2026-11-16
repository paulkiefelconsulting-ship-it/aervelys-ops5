# AERVELYS – eigene Agenten-Engine (v1)

Stand: 16.11.2026 · Branch feature/self-hosted-agent-engine-v1

## Ziel

Die virtuelle Airline soll KI-/Software-Agenten selbst betreiben, ohne kostenpflichtige externe KI-APIs.
Die erste ausführbare Komponente liegt in lib/agent-engine.mjs und ist ein vollständig
lokaler, deterministischer Entscheidungsautomat. Das ist **keine selbst trainierte
generative KI**. Mitarbeiter und Kunden sollen zunächst regelbasiert unabhängig
handeln können; ein optionales, lokal betriebenes Open-Weight-Sprachmodell kann
später die Formulierungen verbessern, aber nie finanzielle oder operative
Freigaben ersetzen.

## Was jetzt funktioniert

- Reproduzierbare Customer-/Sales-Wechsel in einem einzelnen Charter-Verkaufsfall.
- Kundenstrategien: value, bargain, strict mit eigenen simulierten Budgets.
- Preisindikation erst nach Übergabe positiver Kalkulationsdaten einer getrennten Pricing-Engine.
- Preisuntergrenze und Regel für wirtschaftlich unzureichende Gegenangebote.
- Zustandsautomat mit Fälligkeitszeiten (15-minütige Reaktionsschritte).
- Prüffähiges Ereignisprotokoll mit stabilen Event-IDs (caseId:revision).
- Pure Batch-Funktion für mehrere Fälle mit unverändertem Eingabezustand.
- Keine direkten Netzaufrufe, keine KI-API, keine Mailzustellung und keine echten Finanztransaktionen.

## Bewusste Grenzen

- Noch kein laufender Server-Worker, keine Datenbankmigration und **keine** schreibende
  Anbindung an bestehende sim_sales_cases / sim_sales_messages.
- Keine vollständige Unternehmens-KI für HR, Finance, Projektmanagement oder Behörden.
- Keine generative Konversation: Die Texte sind fest definierte Vorlagen.
- Keine Kundengenerierung oder echten Marktprofile durch dieses Modul.
- Ein Status interested_pending_ops bedeutet ausschließlich Kundeninteresse –
  **niemals** Charterbuchung, Crewzuordnung oder Flugfreigabe.
- Bestehende Sales-Autopilot-/Simulationsprozesse bleiben unverändert.
- Die /agent-lab Seite ist eine nur lesende Beispielsimulation, nicht der Live-Betrieb.
- Keine Aussage, dass laufende Serverprozesse oder ein kostenfreier 24/7-Betrieb
  mit diesem Commit eingerichtet worden wären.

## Integration in bestehende Infrastruktur – nächste Arbeitsschritte

1. Ist-Schema für sim_sales_cases, sim_sales_messages, simulation_clock und agent_work_items
   gegen den laufenden Supabase-Bestand prüfen.
2. Persistente Agentenfälle, Version/Fälligkeitsdatum und Event-IDs in einer
   abgesicherten, mandantengetrennten Datenstruktur abbilden.
3. Worker-Transaktionen mit Unique(event_id), optimistic locking auf revision,
   Lease/Retry und Dead-Letter-Handling implementieren; gesperrte Vorgänge
   dürfen niemals automatisch als abgeschlossen gelten.
4. Bestehenden Sales-Autopilot auf den neuen Agenten-Kern migrieren, ohne
   historische Dialoge zu verlieren oder doppelte Angebote zu erzeugen.
5. Preis- und OPS-Gates mit überprüfbaren Datenquellen verbinden.
6. Weitere Rollen (HR, OPS, Finance, Compliance) über eigene Tools/Befugnisse
   anbinden, mit Budget- und Freigabegrenzen.
7. Optional lokales Sprachmodell als reine Textschicht; Engine entscheidet
   ausschließlich über validierte strukturierte Aktionen.

## Verifikation

- npm test (node --test tests/*.test.mjs)
- npm run typecheck
- npm run build

Die Unit-Tests sichern Zeitfenster, Angebotsuntergrenze, Kundenprofile,
Gegenangebote, Fehlereingaben, unveränderte Eingaben und stabile Event-IDs ab.

Sicherheitsgrundsatz: **Synthetische Kommunikation ist nicht gleich echte
Buchung. Unverifiziert heißt nicht freigegeben.**
