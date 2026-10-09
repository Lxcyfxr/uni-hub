# Uni-Hub – Entwicklerdokumentation

Für alle, die an Uni-Hub weiterbauen. Die Bedienung beschreibt das [Benutzerhandbuch](BENUTZERHANDBUCH.md); Sicherheitsvorgaben stehen in [SECURITY-CHECKLIST.md](../SECURITY-CHECKLIST.md).

## 1. Voraussetzungen und Start

- Windows 10/11, Node.js 22 oder neuer, npm.
- Keine nativen Module, kein C++-Compiler nötig (SQLite kommt aus Electron: `node:sqlite`).

```bash
npm install
npm run dev
```

`npm run dev` startet Vite (Oberfläche, Hot-Reload) und Electron. Änderungen in `src/main` und `src/preload` greifen erst nach einem **vollständigen Neustart** (Fenster schließen, `Strg+C`, erneut starten). `Strg+R` im Fenster genügt dafür nicht.

## 2. Architektur

```
┌────────────────────────── Electron ──────────────────────────┐
│ Hauptprozess (src/main)   Datenbank, Dateien, Netz, Fenster   │
│        ▲  ipcMain.handle (geprüft, nur Hauptfenster)          │
│ Preload (src/preload)     schmale API "window.uni"            │
│        ▲  contextBridge                                       │
│ Oberfläche (src/renderer) React + Ant Design, sandboxed       │
│                                                               │
│ Eingebettete Ansichten    Exchange / lehre / AMBOSS / MOSES,  │
│ (WebContentsView)         Dokumentenansicht – ohne Preload    │
└───────────────────────────────────────────────────────────────┘
          src/shared: Typen und reine Logik für beide Seiten
```

- **Hauptprozess:** besitzt alle Rechte (Datenbank, Dateisystem, Netzwerk, Fenster). Er vertraut der Oberfläche nicht: jede Eingabe wird geprüft.
- **Preload:** legt ausschließlich das Objekt `window.uni` in die Seite. Kein `ipcRenderer`, kein `require`.
- **Oberfläche:** reine Darstellung; Zustand liegt in der Datenbank, nicht im Renderer. Ausnahme: der Pomodoro-Timer (`features/pomodoro.ts`, zustand), weil er bereichsübergreifend weiterläuft.
- **Eingebettete Webseiten** laufen in getrennten Sitzungen (`persist:outlook`, `persist:lehre`, `persist:amboss`, `persist:moses`) ohne jede Verbindung zur App-Schnittstelle.
- **`src/shared`:** `ipc.ts` (Schnittstellenvertrag und Domänentypen), `validate.ts` (Eingabeprüfung), `urls.ts` (Adressregeln), `anki-render.ts` (Kartenvorlagen), `format.ts`.

## 3. Ordnerstruktur

| Pfad | Inhalt |
| --- | --- |
| `src/main/index.ts` | Start, Fenster, Registrierung aller Schnittstellen (`handle(...)`) |
| `src/main/db/` | Verbindung und **Migrationen** |
| `src/main/{todos,study,calendar,docs,anki}/` | Fachlogik je Bereich (Stores, Import, Export, Planung) |
| `src/main/{security,links,ipc,views}.ts` | Fenster-Härtung, Link- und Navigationsregeln, Absenderprüfung, eingebettete Ansichten |
| `src/main/{log,backup,wipe,windowState,perf,fsutil}.ts` | Protokoll, Sicherung, Löschen, Fensterzustand, Messpunkte, atomares Schreiben |
| `src/main/{tray,autostart,reminders,notify,sessions}.ts` | Infobereich, Autostart, Terminerinnerungen, Benachrichtigungen, dauerhafte Anmeldungen |
| `src/main/selftest.ts` | Selbsttest der verpackten App |
| `src/renderer/src/features/` | ein Bereich pro Datei bzw. Unterordner |
| `tests/` | Unit-Tests (`*.test.ts`) und Electron-Tests (`electron/run.ts`) |
| `scripts/` | Build-Hilfen: Budget, Prüfsummen, Lizenzen, Release-Prüfung, Electron-Tests |
| `docs/` | diese Dokumentation |

## 4. Einen Schnittstellenaufruf hinzufügen

Beispiel: `todos.archive(id)`. Immer alle fünf Schritte:

1. **Vertrag** in `src/shared/ipc.ts`: Methode in `UniApi` (und neue Typen daneben).
2. **Preload** in `src/preload/index.ts`: `archive: (id) => ipcRenderer.invoke('todos:archive', id)` – fester Kanalname, nie dynamisch.
3. **Handler** in `src/main/index.ts` innerhalb von `registerIpc`:
   ```ts
   handle('todos:archive', (_e, id: number) => todos.archive(v.id(id)))
   ```
   `handle` ist die geprüfte Variante (nur Hauptfenster darf aufrufen); Eingaben immer mit `v.*` aus `shared/validate.ts` prüfen (IDs, Texte mit Längengrenze, Pfade, Datumswerte …).
4. **Fachlogik** im jeweiligen Store: SQL **nur mit Platzhaltern** (`?`), Objekte dort validieren.
5. **Test**: Der Quelltext-Wächter `tests/security-static.test.ts` schlägt an, wenn Preload und Handler nicht genau übereinstimmen. Logik mit Eingaben bekommt zusätzlich einen Test.

Ereignisse vom Hauptprozess zur Oberfläche (`win.webContents.send('x:y', …)`) brauchen im Preload ein `ipcRenderer.on('x:y', …)` mit zurückgegebener Abmeldefunktion; in der Oberfläche den Abonnenten im `useEffect` aufräumen.

## 5. Datenbank und Migrationen

- Eine SQLite-Datei (`unihub.db`, WAL), geöffnet in `src/main/db/index.ts` über `getDb()`.
- Schema-Änderungen **nur** durch einen neuen Eintrag am **Ende** des Arrays `MIGRATIONS` – bestehende Einträge nie ändern. Die Version steht in `PRAGMA user_version`; jede Migration läuft in einer Transaktion.
- Tabellen: `todos`, `todo_categories`, `calendar_sources`, `calendar_events`, `documents` (+ `docs_fts`, Volltextindex), `study_subjects`, `study_topics`, `study_sessions`, `anki_notetypes`, `anki_decks`, `anki_notes`, `anki_cards`, `anki_revlog`, `kv` (Einstellungen mit Präfix `ui.`).
- Einfache Einstellungen der Oberfläche: `window.uni.ui.get/set('ui.<name>')` (nur Schlüssel `ui.*`).
- Bei großen Schreibvorgängen in Blöcken mit eigener Transaktion arbeiten und zwischendurch an den Event-Loop abgeben (Beispiel: Anki-Import in `anki/import.ts`).
- Dateien, die du schreibst, mit `writeFileAtomic` (`fsutil.ts`).

## 6. Einen Web-Dienst-Tab hinzufügen

1. `src/shared/ipc.ts`: neuen Schlüssel in `ModuleId` und in `WEB_MODULES` (URL und `partition: 'persist:<name>'`).
2. `src/renderer/src/App.tsx`: Eintrag in `NAV` und im Routing (`WebView`).
3. `src/renderer/src/features/SettingsView.tsx`: Eintrag in `SERVICES`, damit sich die Sitzung widerrufen lässt.
4. `src/shared/urls.ts`: Domain in `LOGIN_HOSTS`, falls Anmelde-Popups in der App bleiben sollen.
5. Downloads in den Doc-Hub: `docs.captureDownloads(...)` in `src/main/index.ts`.

Sitzungen, Berechtigungen und Navigationsregeln gelten automatisch für alle Einträge in `WEB_MODULES`.

## 7. Regeln für Code

Diese Regeln erzwingt zum Teil der Test `tests/security-static.test.ts`:

- `shell.openExternal` nur in `links.ts` (`openExternalSafe`, nur https).
- Keine Befehlsausführung (`child_process`), kein `eval`/`new Function`/`innerHTML`, kein `sendSync`.
- Fenster und Ansichten immer mit `...SECURE_WEB_PREFERENCES` aus `security.ts` anlegen; nie `nodeIntegration`, `webSecurity` oder `sandbox` lockern.
- Die Oberfläche bekommt nie Rechte: neue Fähigkeiten gehören in den Hauptprozess hinter einen geprüften Aufruf.
- Importierte Inhalte (Anki-Karten, Dokumente) nur in `sandbox=""`-Frames anzeigen; Packformate (Zip/zstd) mit Größengrenzen lesen.
- Kein Protokollieren von Adressen, Dokumentinhalten oder Zugangsdaten (Rechnername bzw. Schema genügen).
- Sprache: Oberfläche und Kommentare auf Deutsch; Kommentare erklären das *Warum*.
- Neue Abhängigkeiten nur, wenn nötig; danach `npm run licenses` und prüfen, ob es zur Laufzeit gebraucht wird (`dependencies`) oder nur zum Bauen (`devDependencies`).

## 8. Tests

| Befehl | Prüft | Wann |
| --- | --- | --- |
| `npm run typecheck` | TypeScript | laufend |
| `npm test` | Unit-Tests: Adress-/Eingabeprüfung, Kartenvorlagen, Quelltext-Wächter | nach Änderungen |
| `npm run test:electron` | echtes Electron: Navigation, Popups, Berechtigungen, Absenderprüfung, Medien-Protokoll, Anki-Import/-Export, Zip-Bomben, Kalender, Löschen | nach Änderungen an `src/main` |
| `npm run build` + `npm run budget` | Build und Größenbudget | vor Pull Requests |
| `npm run verify:release` | fertiger Build: Fuses, Paketinhalt, CSP | nach `pack`/`dist` |
| `Uni-Hub.exe --selftest=<datei>` | verpackte App | nach `dist` |

Neue Electron-Tests kommen in `tests/electron/run.ts` (ein Test = `await test('Name', async () => { … })`); sie laufen mit temporärem Datenordner und berühren keine echten Daten. Reine Logik gehört in `src/shared` und wird mit Vitest getestet – ohne Electron.

Der CI-Ablauf (`.github/workflows/ci.yml`) führt Typprüfung, `npm test`, Build, Budget und `npm audit` aus. Die Electron-Tests laufen lokal.

## 9. Release

1. Version in `package.json` erhöhen, `CHANGELOG.md` ergänzen.
2. `npm run typecheck && npm test && npm run test:electron`
3. `npm run dist` – erzeugt `release/Uni-Hub-Setup-<Version>.exe`, aktualisiert `THIRD-PARTY-LICENSES.md` und schreibt `release/SHA256SUMS.txt`.
4. `npm run verify:release` und `release\win-unpacked\Uni-Hub.exe --selftest=ergebnis.json` (Exit-Code 0).
5. Installer und `SHA256SUMS.txt` zusammen veröffentlichen.

Vor dem Neubau `release/` leeren und laufende Uni-Hub-Prozesse beenden; sonst sperrt Windows manchmal die `.exe` (Fehler `EBUSY`). Nicht signiert: Für eine Signierung wird ein Zertifikat in `electron-builder` eingetragen (`win.certificateFile`/`certificatePassword` über Umgebungsvariablen, nie im Repo; `.pfx`/`.p12` sind ignoriert).

## 10. Fehlersuche in der Entwicklung

- **Protokoll:** `%APPDATA%\uni-hub\logs\main.log` (auch im Entwicklungsmodus). Zeilen mit `[perf]` zeigen Startzeiten und Speicher.
- **`window.uni.x is not a function`:** Das Fenster nutzt noch einen alten Preload – `npm run dev` komplett neu starten.
- **Leere Oberfläche / CSP-Fehler:** Die CSP in `src/renderer/index.html` erlaubt nur `'self'`; neue Quellen (Bilder, Schriften) bewusst eintragen, nicht pauschal öffnen.
- **Native Bibliotheken fehlen:** Es gibt keine; SQLite ist `node:sqlite`. `pdfjs` meldet beim ersten PDF harmlose Warnungen zu `DOMMatrix`/`Path2D` (die optionale Zeichen-Bibliothek ist bewusst nicht enthalten).
- **Daten im Entwicklungsmodus** liegen im selben Ordner wie bei der installierten App (`%APPDATA%\uni-hub`). Für saubere Tests: `--user-data-dir=<Ordner>` an die `.exe` hängen oder den Selbsttest (`--selftest`) bzw. die Electron-Tests nutzen – beide arbeiten mit temporären Daten.
