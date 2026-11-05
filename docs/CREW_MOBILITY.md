# AERVELYS OPS 5.0 — Crew Mobility & Long-Term Roster

Stand: 05.11.2026. Erweiterung der sicheren Aircraft-/Crew-Rotation aus main. Keine Betriebsfreigabe.

## Implementiert
- Geschützte Seite /crew-mobility?date=YYYY-MM-DD&weeks=2|4|8|12 mit PIC/SIC-Dienstplan aus bestehenden Mitarbeiter- und Dienstblocktabellen.
- Reine Engine lib/crew-mobility-planner.mjs erstellt unverbindliche Vorbewertungen für Transfers per Shuttle/Bahn/Linienflug, Hotelnächte, Kosten, Folgedienste und optionale Heimreise.
- Die Homebase zählt niemals als Nachweis des aktuellen Standorts. Nur verifizierte aktuelle Position, Diensthistorie, Reisezeiten und Preise sind zugelassen.
- Transfers benötigen eine belegte Route und müssen vor Crew-Report enden. Ruhezeit und Release-Puffer begrenzen die nächste Dienstbereitschaft.
- Hotelkosten nur mit verifiziertem Tarif, keine impliziten Buchungen. Keine Flugzeug- oder Crew-Doppelzuweisungen.
- Automatische Tests für Positionierung, Hotels, Ruhezeit- und Zeitkonflikte, unbekannte Orte und fehlende Preise.

## Grenzen
- Bestands-API enthält noch keinen bestätigten Crew-Position-Feed und kein Flugziel pro Dienstblock. Live-Daten werden daher als nicht disponierbar bewertet.
- Keine vollständige EASA FTL/Standby/Acclimatization-Prüfung oder Crew-Release.
- Kein neues Supabase-Schema, keine Migration, keine RLS-Änderung, keine Mitarbeiter-, Hotel- oder Flugbuchung.
- Planungshorizont bis 12 Wochen ist ein Lesefenster und noch kein automatischer Dienstplan-Generator.
- Ab 500 gelesenen Dienstblöcken Warnung vor unvollständiger Datenlage.

## Nächster Schritt
Ein versioniertes, eigentümergesichertes und auditiertes Standort-Ledger mit verifizierten Duty-Perioden, Flughafenzielen, Reiseoptionen und Kostenkatalog. Erst danach Vorschläge in die Aircraft-Rotation integrieren und verifizierte Ressourcen atomar reservieren.
