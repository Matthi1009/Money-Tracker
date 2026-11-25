# Money Tracker

Einnahmen, Ausgaben und Sparziele im Blick. Läuft komplett im Browser, ohne Konto, ohne Server und ohne Tracking.

**Live ausprobieren:** https://matthi1009.github.io/money-tracker/ *(nachdem GitHub Pages aktiviert ist)*

## Funktionen

- **Buchungen** in Sekunden erfassen: Betrag, Kategorie, Datum, Notiz. Beträge gehen als `12,50`, `12.50` oder `1.234,56`.
- **Monatsübersicht** mit Einnahmen, Ausgaben, Rest und Sparquote
- **Verlauf der letzten 6 Monate** als Balkendiagramm. Ein Klick auf einen Monat springt dorthin.
- **Ausgaben nach Kategorie**, damit du siehst, wo das Geld hingeht
- **Sparziele** mit Fortschrittsbalken und Prognose: Bei deinem Durchschnitt der letzten drei Monate erreichst du das Ziel ungefähr im März 2027.
- **Suche** in den Buchungen eines Monats
- **Löschen mit Rückgängig**: Ein falscher Klick ist kein Problem.
- **Backup** als JSON herunterladen und wieder einspielen, **Export als CSV** für Excel und LibreOffice
- Heller und dunkler Modus, je nach Systemeinstellung
- Funktioniert auf dem Handy

## Datenschutz

Alle Daten liegen nur im `localStorage` deines Browsers. Nichts verlässt dein Gerät, und es werden keine externen Schriften oder Skripte geladen. Wenn du die Browserdaten löschst, sind auch deine Buchungen weg, also mach ab und zu ein Backup.

## Starten

Ohne Installation: `index.html` im Browser öffnen.

Oder mit einem lokalen Server:

```bash
npm start          # startet python3 -m http.server auf Port 8080
```

### Auf GitHub Pages veröffentlichen

1. Repo auf GitHub öffnen, dann **Settings → Pages**
2. Unter *Build and deployment* als Quelle **Deploy from a branch** wählen, Branch `main`, Ordner `/ (root)`
3. Nach ungefähr einer Minute läuft die App unter `https://<dein-name>.github.io/money-tracker/`

Jeder Besucher hat seine eigenen Daten in seinem eigenen Browser.

## Entwicklung

Reines HTML, CSS und JavaScript, ohne Build-Schritt und ohne Abhängigkeiten.

```
index.html      Aufbau der Seite
css/style.css   Gestaltung inklusive Dark Mode
js/logic.js     Rechenlogik (Beträge, Monate, Prognosen, CSV), ohne DOM-Zugriff
js/app.js       Oberfläche, Speichern, Ereignisse
tests/          Tests für logic.js
```

Tests laufen mit dem eingebauten Test-Runner von Node (ab Version 18):

```bash
npm test
```

Beträge werden intern als ganze Cent gespeichert, damit keine Rundungsfehler wie `0.1 + 0.2` entstehen.

## Lizenz

[MIT](LICENSE)
