# Kaufgeist

Statische, allgemein gehaltene KI-Kaufberatung mit Vercel-API. Kein Frontend-Framework und keine npm-Laufzeitabhängigkeiten.

## Lokal prüfen

```sh
npm test
npm run build
KAUFGEIST_DEMO=1 npm run dev
```

Die lokale Vorschau läuft auf `http://127.0.0.1:4175`. DEMO nutzt ausschließlich ausdrücklich gekennzeichnete Testdaten, keine KI und kein Supabase. Das Demo-Verhalten existiert nur im lokalen Entwicklungsserver, nicht im produktiven API-Handler. Ohne DEMO benötigt die lokale API die Server-Konfiguration unten.

## Vor dem Merge/Deployment erforderlich

1. `database/rate-limits.sql` im bestehenden Supabase-Projekt ausführen und den RPC mit dem Service-Role-Schlüssel testen. **Diese Migration ist hier vorbereitet, nicht auf dem realen Projekt ausgeführt.**
2. In Vercel serverseitig setzen: `OPENAI_API_KEY`, `SUPABASE_URL`, `SUPABASE_KEY` (Service Role), `RATE_LIMIT_SALT` (zufälliger geheimer Wert). Vorhandene Supabase-URL prüfen. Keine Schlüssel in Git, Browserdateien oder Chat eintragen.
3. Obergrenzen kontrollieren: `PER_IP_WINDOW_LIMIT` (Standard 10 pro fünf Minuten) und `DAILY_CONSULTATION_LIMIT` (Standard 100 weltweit pro UTC-Tag). Bei fehlender Datenbank oder Konfiguration antwortet die API absichtlich mit 503 und verursacht keine KI-Kosten. **Nicht ungeprüft nach Produktion mergen.**
4. Vercel nutzt `npm run build`, Ausgabeverzeichnis `dist`, Node 22 oder neuer und ein API-Maximum von 60 Sekunden. Hosting-Tarif und Funktionslaufzeit im Projekt prüfen.
5. Für Ereignisberichte zunächst **Erweiterte Messung im GA4-Datenstream deaktivieren** (sonst können automatische Formular-/Outbound-Ereignisse Texte oder Such-URLs übertragen), dann `PUBLIC_GA4_ID=G-…` und `PUBLIC_GA4_ENHANCED_MEASUREMENT_DISABLED=1` als Build-Variablen setzen. Der Build verlangt diese Bestätigung. Für eine Google-Ads-Mikroconversion `PUBLIC_GOOGLE_ADS_CONVERSION_LABEL` setzen. Das bestehende Ads-Konto `AW-18409756430` bleibt unverändert. Nach Änderungen neu bauen/deployen.
6. Datenschutz-Konfiguration und rechtliche Prüfung abschließen; Details in `docs/ads-launch.md`.
7. Echte Beratung in einer Preview gegen die realen API-Konten testen. Die automatisierten Tests simulieren externe Antworten und beweisen keine Live-Modellverfügbarkeit oder Recherchequalität.

## Bewusst ausgeschlossen: Partner-ID / Punkt 1

Es werden keine Partner-IDs ergänzt, keine Provisionszuordnung eingerichtet und keine Amazon-Konten erstellt. Betreiber bestätigt: noch keine PartnerNet-Zulassung. Deshalb keine Aussage „Als Amazon-Partner …“, keine Partnerlink-Kennzeichnung an normalen Links. Stattdessen transparente Information über geplante Finanzierung. Nach Zulassung und gesonderter Beauftragung Kennzeichnung und Links gemeinsam umstellen.

## Auswahl und Angebotsdaten

- Die KI recherchiert Modellreihen, nicht ungeprüfte Händlerangebote. Produkte werden nur ausgegeben, wenn ein abgeschlossener Websuchlauf vorliegt und ihre Recherche-URLs in dessen Quellen/Citations vorkommen. Das prüft die Provenienz, **nicht automatisch die Richtigkeit jeder Testaussage**.
- Die Modellbezeichnung und Begründung bleiben zusammen. Kein Austausch gegen einen ähnlichen Amazon-Titel. Pflichtmerkmale werden in die gezielte Amazon-Suche und die Prüfliste übernommen.
- RapidAPI, ungeprüfte Preise, Sternebewertungen und der bisherige unscharfe Angebotstausch sind aus dem Produktionspfad entfernt. Es gibt derzeit keine Live-Preisprüfung und keine Zusicherung, dass eine Variante das Budget erfüllt.
- `lib/product-ranking.mjs` enthält strengere, offline getestete Schutzfilter für eine spätere zulässige Angebotsschnittstelle. Sie sind **nicht** Teil des aktuellen Suchlink-Pfads. Vor Aktivierung einer offiziellen Schnittstelle müssen konkrete Varianten/ASINs und strukturierte Pflichtmerkmale geprüft werden. Titelähnlichkeit allein ist kein Ausstattungsnachweis.
- Modellvorgaben unverändert: `OPENAI_MODEL` standardmäßig `gpt-6-luna`, Fallback `gpt-5.6-luna` nur bei `model_not_found`.

## Kosten, Schutz und Datenminimierung

Maximal zwei Modellaufrufe, je höchstens drei eingebaute Toolaufrufe und 4.200 Ausgabetokens pro reservierter Beratung; gemeinsame KI-Frist 45 Sekunden. Datenbank-RPC höchstens drei Sekunden. Tageslimit zählt Anfragen inklusive Fehler und Rückfragen, nicht Euro. Zusätzlich Provider-Budgetwarnungen setzen. Kein Versprechen eines exakten Euro-Limits.

SQL reserviert IP- und Tageszähler in einer Transaktion mit gemeinsamem Lock. Der IP-Wert ist täglich wechselnd HMAC-pseudonymisiert. Abgelaufene Zähler werden beim nächsten RPC gelöscht. Keine rohen IPs/Chattexte in dieser Tabelle. Vercel-Proxy-Header-Verhalten in der tatsächlichen Umgebung verifizieren; clientseitige CORS-/Origin-Prüfungen ersetzen keinen Kostenschutz.

Es werden **keine neuen Chatprotokolle** gespeichert. Alte Einträge in `chat_logs` wurden weder gelesen noch gelöscht; der Betreiber muss dafür eine Lösch-/Aufbewahrungsentscheidung treffen. `store:false` beseitigt nicht automatisch Sicherheitslogs bei Dienstleistern.

## Messung

Nur nach gültiger, versionierter Einwilligung: `consultation_start`, `consultation_followup`, `clarification_shown`, `recommendations_shown`, `amazon_search_click`, `consultation_error`. Parameter nur Seitentyp, Kartennummer, Anzahl oder grobe Fehlerklasse. Keine Chattexte, Produktnamen oder individuellen Ziel-URLs. Fehlende GA4-ID = keine Ereignisberichte. Fehlendes Ads-Label = keine Ads-Mikroconversion.

`amazon_search_click` ist **kein Kauf** und erhält keinen erfundenen Umsatzwert. Widerruf setzt Consent auf denied, deaktiviert GA, entfernt erreichbare Messcookies und lädt das Dokument neu. Dadurch werden auch vorher geladene Tag-Listener beendet. Personalisierung und Google Signals sind deaktiviert. Vercel Analytics wurde entfernt, um das Consent-Verhalten eindeutig zu halten.

## Seiten

`/` bleibt allgemein. Zusätzlich: `/beratung/office-laptop`, `/beratung/kaffeevollautomat`, `/impressum`, `/datenschutz`, `/transparenz`. Der Build erzeugt eigenständiges HTML mit Canonicals, Open-Graph-Metadaten und Sitemap, keine nur per JavaScript ausgetauschten Landingpages. Inhalte in `scripts/pages.mjs`, gemeinsames Layout in `index.html`.
