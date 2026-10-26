# AERVELYS OPS 5.0 – Virtuelles Treasury und Banking

Stand: 26. Oktober 2026. Neue Migrationen:
- `20261026170204_ops5_virtual_treasury_schema.sql`
- `20261026170337_ops5_virtual_treasury_worker.sql`

## Umgesetzt

- Ein ausschließlich internes fiktives EUR-Bestandkonto pro Organisation, mit getrenntem Buchungsverlauf und gesperrten Browser-Schreibrechten.
- Explizit erfundenes einmaliges Startkapital: 250.000 EUR je Organisation, nicht als echte Einlage bezeichnet oder versendet.
- Supabase-Cron stündlich zur Minute 20, nach dem virtuellen Flugabschluss zur vollen Stunde und dem Simulations-Finanzabschluss zur Minute 10.
- Nur aus gebuchten virtuellen Charterabschluss-Journalen entstehen hypothetische Kundenzahlungseingänge. Das gleicht die zuvor erfasste fiktive Forderung gegen ein internes virtuelles Zahlungsmittelkonto aus.
- Nur nach bereits gebuchten fiktiven Kostenverbindlichkeiten werden hypothetische Kostenbegleichungen vorgenommen; bei nicht ausreichend fiktivem Guthaben bleibt die Buchung offen und wird beim nächsten Lauf erneut geprüft.
- Das einmalige Startkapital und jede fiktive Zahlung erhält ein zusätzliches ausgeglichenes, unveränderliches Soll-/Haben-Journal.
- Einmalige Quellenreferenzen verhindern Dubletten und zusammengesetzte Foreign Keys verhindern organisationsübergreifende Bewegungen.
- Eine eigene RLS-geschützte Seite unter `/treasury` zeigt Konto, Bewegungen und Salden. Vorhandene Finanzmodule und Navigation sind angebunden.

## Verifizierte Datenbanktests

- Erster Lauf am 26.10.2026: 250.000 EUR fiktives Startkapital und 1.150 EUR simulierte Flottenkostenbegleichung; neuer hypothetischer Saldo **248.850 EUR**.
- Transaktional zurückgerollter Charterabschluss: Ein fiktiver Eingang 8.020 EUR und eine fiktive Kostenbegleichung 4.810 EUR, Saldo des Tests 252.060 EUR; keine Doppelbuchung beim zweiten Aufruf, 6 neue Soll-/Haben-Zeilen ausgeglichen.
- Simulierte Kostenverbindlichkeit über 300.000 EUR wurde wegen ungenügend fiktiver Deckung **nicht** bezahlt.
- Testkontostände und Zukunftsjournale wurden vollständig zurückgerollt. Im Produktionsstand bleibt ausschließlich die fiktive Eröffnungsbuchung und die simulierte Begleichung der Flottenhaltungskosten.
- Kein anonymer Tabellenzugriff, keine Schreibrechte für eingeloggte Browserbenutzer, kein Execute-Zugriff auf die interne Workerfunktion für diese Benutzer.

## Sicherheitsgrenze

**Nie reale Zahlungen oder echte Bankgeschäfte.** Keine IBAN, kein Zahlungsanbieter, keine verknüpfte Bank, keine Rechnungen, keine echten Kundenforderungen, kein tatsächliches Cash, keine Steuern und keine Payroll. Die vorhandene generische `simulation_accounts`-Entwurfstabelle wird von diesem Treasury bewusst nicht als Bankkonto interpretiert. Modellbeträge dürfen nicht in realer Buchhaltung verwendet werden.

## Noch nicht implementiert

Freigabeprüfungen für operative Crew und Flugbewegungen, ein realistischer Nachfrage-/Kostenmarkt, virtuelle Mitarbeitergehälter, Wartungsplan und eine KI-Agentensteuerung. Diese Anforderungen bleiben voneinander getrennt.