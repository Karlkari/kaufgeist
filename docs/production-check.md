# Produktionszugang ohne KI-Aufruf prüfen

Das Skript `scripts/check-production.mjs` ruft OpenAI nicht auf. Nach ausdrücklicher Veröffentlichungsfreigabe am 4. Oktober 2026 läuft es über `scripts/build-vercel.mjs` vor jedem Vercel-Produktionsbuild. Bei einem Fehler endet der Build vor der Seitengenerierung; die neue Version wird nicht freigeschaltet. Preview-Builds und `npm run build` bleiben ohne Netzwerkprüfung. Es gibt keinen öffentlichen Prüf-Endpunkt.

## Ausführung

Nur in einer autorisierten Serverumgebung ausführen, in der die bestehenden Produktionsvariablen bereits sicher vorhanden sind:

```sh
node scripts/check-production.mjs --production
```

Benötigt Node.js 24 oder neuer und die Variablen `SUPABASE_URL`, `SUPABASE_KEY`, `RATE_LIMIT_SALT`, `OPENAI_API_KEY`, `PER_IP_WINDOW_LIMIT` und `DAILY_CONSULTATION_LIMIT`. Wenn `VERCEL_ENV` gesetzt ist, muss es `production` sein. Das Skript lädt keine `.env`-Datei. Keine Schlüssel in Befehle, Chat, Git, Screenshots oder Build-Ausgaben kopieren. Nicht als öffentlichen API-Endpunkt bereitstellen.

Die geschützt gespeicherten Vercel-Secrets werden durch das Skript nicht aus dem Dashboard ausgelesen oder exportiert. Ein lokaler Test mit anderen Variablen beweist nicht, dass die in Vercel gespeicherten Werte stimmen. Ohne eine autorisierte Ausführungsumgebung mit den tatsächlichen Produktionsvariablen bleibt diese Prüfung offen.

## Was geprüft wird

1. Vorhandensein und Format der Konfiguration; Produktionsprojekt ist fest auf `uvsvsmyofoiboyiroozm` begrenzt. Vorschauprojekte, öffentliche Schlüssel und Weiterleitungen werden abgelehnt.
2. Supabase-Zugang zur Limittabelle über eine Abfrage mit `limit=0`; keine Datensätze werden abgerufen.
3. Erreichbarkeit und Ausführungsrecht der Limitfunktion über einen absichtlich ungültigen Parameter (`p_ip_key: null`). Die installierte Funktion wirft vor jeder Änderung den erwarteten Fehler. Es wird keine Beratung reserviert. Anbieter können die beiden HTTP-Anfragen in ihren Zugriffs-/Fehlerprotokollen erfassen.

Höchstens zwei HTTP-Anfragen, ausschließlich an das Produktions-Supabase-Projekt, jeweils mit fünf Sekunden Zeitlimit. Keine neuen Dienste, Abonnements oder KI-Anfragen. Die Anfragen zählen gegebenenfalls zur bestehenden Supabase-Nutzung.

## Ergebnis und Grenzen

Erfolg: Exit-Code `0`, JSON-Code `DATABASE_ACCESS_VERIFIED`. Fehler: Exit-Code `1`; falscher Aufruf: `2`. Es werden nur feste Prüfcodes ausgegeben, keine Schlüssel oder fremden Fehlertexte.

- `TABLE_HTTP_401`: Zugang abgelehnt; Produktionsschlüssel und Projektzuordnung prüfen.
- `TABLE_HTTP_403`: Tabellenzugriff verweigert; Berechtigungen prüfen.
- `WRONG_DATABASE` / `WRONG_ENVIRONMENT`: falsches Ziel; nicht auf Vorschau umstellen, um den Test grün zu machen.
- `UNEXPECTED_RPC_HTTP_*`: Funktion oder Berechtigungen separat prüfen; keine Schutzregeln abschalten.
- `NETWORK_OR_RESPONSE_ERROR`: Verbindung, Zeitlimit oder Antwortformat prüfen.

`OPENAI_API_KEY` wird ausschließlich auf Vorhandensein und äußeres Format geprüft, nicht auf Gültigkeit, Guthaben oder Modellzugang. Auch parallele Limitanfragen, die vollständige Beratung und die tatsächlich ausgelieferte Website sind nicht Bestandteil dieses Checks. Erfolg ist keine Veröffentlichungsfreigabe.

## Offline-Tests

```sh
node --test tests/production-check.test.mjs
npm test
npm run build
```

Die fünf Zugangstests ersetzen Netzwerkantworten durch Simulationen. Zwei weitere Tests prüfen den Build-Abbruch bei fehlenden Zugängen und die Vercel-Einbindung. Ein lokaler Testlauf ist kein Nachweis der Produktionszugänge; dafür muss der Vercel-Produktionsbuild `Production preflight: DATABASE_ACCESS_VERIFIED` melden.
