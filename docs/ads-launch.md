# Freigabecheck vor Google Ads

Stand: 4. Oktober 2026. Technische Vorbereitung, keine rechtliche oder Google-Ads-Freigabe.

## Infrastruktur geprüft

- Bestehendes Supabase-Projekt `kaufgeist-db` im Free-Tarif reaktiviert; Region `eu-west-1`. Kein neues Projekt und kein Tarifwechsel.
- Rate-Limit-Migration installiert; SQL-Tests unter Service Role erfolgreich (IP-Limit, Tageslimit, NULL-/Formatvalidierung). Teständerungen vollständig zurückgerollt. Nur der Server darf Funktion/Tabelle verwenden; keine neuen Performance-Hinweise. Der Advisor-Hinweis „RLS ohne Policy“ ist für diese bewusst ausschließlich serverseitige Tabelle erwartbar, keine öffentlichen Policies hinzufügen.
- Vercel-Projekt `kaufgeist` gefunden, Node 24.x. Bestehende Sensitive-Zugangsdaten gelten nur für Production. Neue HMAC-Geheimkonfiguration und Obergrenzen 10/5 Minuten sowie 100/UTC-Tag für Production hinterlegt, noch nicht durch ein Produktionsdeployment aktiviert.
- Echte Vorschau blockiert durch fehlende Preview-Zugangsdaten. Keine Produktionsschlüssel auf alle Preview-Branches ausweiten. Separate Testressourcen und branchgebundene Variablen verwenden.
- **Kritischer Altbefund:** `public.chat_logs` enthält 51 Einträge und erlaubt bei deaktiviertem RLS umfassenden Zugriff für `anon`/`authenticated`. Keine Inhalte gelesen/gelöscht. Sperrung beim Betreiber angefragt; noch nicht durchgeführt. Siehe [Supabase-RLS-Hinweis](https://supabase.com/docs/guides/database/database-linter?lint=0013_rls_disabled_in_public).

## Noch offen – nicht automatisch erledigt

- [x] Supabase-Migration installieren, SQL-Grenzen und Rollenrechte prüfen.
- [ ] Alten öffentlichen Zugriff auf `chat_logs` absichern und Aufbewahrung festlegen.
- [ ] RPC mit echten Server-Zugangsdaten und parallelen HTTP-Anfragen prüfen.
- [ ] Vercel-Konfiguration und echte KI-Recherche in Preview testen. Fehlende gemeinsame Limits blockieren die Beratung absichtlich.
- [ ] Erweiterte Messung im GA4-Datenstream deaktivieren, damit automatische Formular-/Outbound-Ereignisse keine Texte oder Such-URLs übertragen. Erst danach GA4-Mess-ID, `PUBLIC_GA4_ENHANCED_MEASUREMENT_DISABLED=1` und Ads-Conversion-Label eintragen. In Tag Assistant Zustimmung, Ablehnung und Widerruf testen, Events in GA4 DebugView und Ads prüfen. Keine dauerhafte Debug-Konfiguration produktiv verwenden.
- [ ] Dienstleister-Vertragsparteien, Auftragsverarbeitungsverträge, Regionen, Übermittlungsgrundlagen und tatsächliche Aufbewahrungseinstellungen prüfen. Datenschutzhinweise konkret ergänzen und rechtlich freigeben. Google-Analytics-Aufbewahrung passend festlegen; bestehende Roh-Chatlogs gesondert behandeln.
- [ ] Keine Anmeldung, Zahlung, neue Datenbank, Kampagne oder rechtliche Freigabe wurde stellvertretend ausgelöst.
- [ ] Amazon PartnerNet ist noch nicht zugelassen. Anmeldung/Zulassung, Partner-ID und deren technische Einbindung sind ausdrücklich NICHT Bestandteil dieser Änderung.
- [ ] Kein provisionsbasierter Ads-Rentabilitätstest, solange die Monetarisierung noch nicht aktiv ist. Ein kostenpflichtiger reiner UX-Test bräuchte eine separate Budgetentscheidung.

## Kleine, getrennte Einstiege statt breiter Shopping-Kampagne

Allgemeine Startseite erhalten; eine Anzeigen-Gruppe pro präzisem Anliegen:

| Anliegen | Zielseite | Mögliche Aussage, kein Freigabeversprechen |
|---|---|---|
| Office-Laptop auswählen | `/beratung/office-laptop` | „Laptop fürs Büro? Anforderungen klären, Modellreihen vergleichen.“ |
| Kaffeevollautomat auswählen | `/beratung/kaffeevollautomat` | „Welcher Vollautomat passt? Getränke, Pflege und Budget einordnen.“ |

Keine unbelegten „Testsieger“, „günstigsten Angebote“ oder Verfügbarkeitsversprechen. Keine Bewerbung von „Laptop unter 700 €“ als garantiertes Angebot, wenn nur Modellsuchen und nicht verifizierte aktuelle Preise vorliegen. Keine Amazon-Markenbegriffe buchen, bevor die dafür geltenden Partnerbedingungen geprüft sind. Anzeigen führen auf die eigene hilfreiche Beratungsseite, nicht als Direktweiterleitung zu Amazon.

## Messen, ohne Klicks mit Umsatz zu verwechseln

1. Beratung begonnen.
2. Empfehlungen tatsächlich angezeigt (getrennt von Rückfragen/Fehlern).
3. Amazon-Suchlink angeklickt = Mikroconversion, anfangs als sekundäre Conversion konfigurieren.
4. Erst nach zugelassener Affiliate-Einrichtung: bestätigte Provisionen und Stornierungen anhand PartnerNet-Berichten gegenüberstellen. Keine automatische individuelle Kaufzuordnung versprechen.

Vor jeder Budgeterhöhung tatsächliche Kosten, bestätigte Netto-Provision, Beratungsabbrüche, Fehlerrate und Klickquote prüfen. Zeiträume mit Ausfällen ausschließen beziehungsweise gesondert ausweisen. Bei statistisch schwachen Daten keinen profitablen „Gewinner“ aus wenigen Klicks ableiten. Keine automatische Kampagnenerstellung oder Geldfreigabe in diesem Projekt.

## Wirtschaftlichkeit

Break-even-CPC = bestätigte Netto-Affiliate-Provision / bezahlte Landingpagebesuche − variable Betriebskosten pro bezahltem Besuch.

Alternativ zur Planung: Händler-Klickquote × Kaufquote beim Händler × mittlere Netto-Provision − variable Kosten pro Besuch.

Nur ein Rechenbeispiel: 30 % × 8 % × 10 € = 0,24 € pro Besuch vor Betriebskosten. Diese Werte sind keine Prognose. Keine Warenkorbwerte als eigene Einnahmen ansetzen. Ein Sicherheitsabstand unter der ermittelten CPC-Grenze muss Stornierungen, Unsicherheit und Fixkosten berücksichtigen.

## Quellen für Betreiberprüfung

- Google Anzeigenziele: https://support.google.com/adspolicy/answer/6368661?hl=de
- Google Consent: https://developers.google.com/tag-platform/security/guides/consent
- Amazon Teilnahmebedingungen: https://partnernet.amazon.de/help/operating/agreement/
- Amazon Programmrichtlinien / Produktdaten: https://partnernet.amazon.de/help/operating/policies/
- OpenAI Websuche: https://developers.openai.com/api/docs/guides/tools-web-search
- OpenAI Datenkontrollen: https://developers.openai.com/api/docs/guides/your-data
- DSGVO: https://eur-lex.europa.eu/eli/reg/2016/679/oj/deu
