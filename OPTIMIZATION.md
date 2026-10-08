# Optimierung der Electron-App (Uni-Hub)

Checkliste mit allen relevanten Punkten, um die Electron-App schneller, kleiner, sicherer und stabiler zu machen.
Stand der Durchsicht: jeder Punkt wurde gegen diese App geprüft. **[x]** = umgesetzt, **[~]** = teilweise bzw. bereits erfüllt, **[ ]** = bewusst nicht umgesetzt (Begründung dahinter).

## Ergebnis

Gemessen mit der installierten (entpackten) App, frischer Datenordner, Median aus drei Starts (`[perf]`-Zeilen im Protokoll; Schwankung ca. ±100 ms).

| Messwert | vorher | nachher |
| --- | --- | --- |
| Fenster bereit (ab Prozessstart) | 645 ms | 542 ms |
| Erstes Zeichnen der Oberfläche | 476 ms | 396 ms |
| Speicher im Leerlauf | 373 MB (4 Prozesse) | 369 MB (4 Prozesse) |
| Renderer-Startblock (JS) | 3.404 KB | 1.915 KB |
| Installer | 120,4 MB | 101,2 MB |
| Entpackte App | 429 MB | 337 MB |
| App-Archiv (`app.asar`) | 25 MB | 17 MB |
| Electron-Sprachpakete | 55 | 2 |

Der Speicherverbrauch ändert sich kaum: Er wird von Electron selbst bestimmt (Hauptprozess ~120 MB, GPU ~95 MB, Fenster ~100 MB, Dienstprogramm ~55 MB). Jeder geöffnete Dienst-Tab (Exchange, lehre.charite, AMBOSS, MOSES) kommt als weiterer Prozess dazu.

Messung wiederholen: `npm run pack`, die App starten und im Protokoll (`Einstellungen → Daten & Wartung → Protokoll`) die Zeilen `[perf]` ansehen. Größen prüft `npm run build && npm run budget`.

## 1. Startzeit
- [x] **Lazy Loading:** Nur die Übersicht wird sofort geladen; To-Do, Lernplaner, Kalender, Doc-Hub, Anki und Einstellungen laden beim ersten Öffnen nach (`React.lazy` in `App.tsx`). Startblock 3,4 MB → 1,9 MB.
- [x] **Main-Process schlank halten:** Datenbank-Integritätsprüfung und Tagessicherung laufen erst 3 s nach dem ersten Bild (bei großen Anki-Datenbanken dauert das). pdf.js wird ohnehin erst bei Bedarf geladen. Das Hauptbündel lädt in ~165 ms; weitere Lazy-Imports würden kaum etwas bringen.
- [x] **Fenster früh zeigen:** `show: false`, Anzeige bei `ready-to-show` (mit 5-s-Notausgang); Fensterfarbe und Titelleiste folgen dem gespeicherten Design, kein Aufblitzen. Ein Splash-Screen ist bei unter 0,6 s nicht nötig.
- [ ] **V8 Code Cache / Snapshots:** nicht umgesetzt. `bytenode` und Snapshots sind bei Electron-Updates fehleranfällig; der Gewinn wäre bei ~165 ms Ladezeit des Hauptbündels klein.
- [ ] **Datenbank asynchron öffnen:** nicht möglich (`node:sqlite` ist synchron); Öffnen und Migrationen dauern nur Millisekunden. Das Teure (Prüfung, Sicherung) ist verschoben.

## 2. Bundle und Build
- [x] **Bundler:** `electron-vite` mit Tree-Shaking war bereits da; neu: Code-Splitting pro Bereich (siehe oben).
- [x] **Abhängigkeiten prüfen:** Größenanalyse des Installers. Entfernt: `@napi-rs/canvas` (36,6 MB, optionale Zeichen-Bibliothek von pdf.js, fürs Textauslesen unnötig) und ungenutzte pdf.js-Teile (Viewer, Standard-Build, WASM). `dayjs` statt Moment, Ant Design mit benannten Importen. Folge: pdf.js meldet beim ersten PDF harmlose Warnungen zu `DOMMatrix`/`Path2D` im Protokoll (betrifft nur das Zeichnen von Seiten). Die mitgelieferten Schrift-/Zeichentabellen werden jetzt tatsächlich übergeben.
- [x] **Production-Build:** Vite baut mit `NODE_ENV=production`; keine Source Maps im Release (`!**/*.map`); Entwicklerwerkzeuge nur in der Entwicklung.
- [x] **Packaging:** ASAR an; `files`-Filter in `package.json`; keine nativen Module, daher kein `asarUnpack` nötig.
- [x] **Komprimierung:** `compression: "maximum"`; Sprachpakete auf `de` und `en-US` begrenzt (55 → 2). Chromium-eigene Texte (z. B. Kontextmenüs) erscheinen dadurch nur auf Deutsch oder Englisch.
- [x] **Electron aktuell halten:** Electron 44.7.0 (aktuell).

## 3. Laufzeit-Performance (Renderer)
- [~] **React:** `useMemo` und isolierte Zeitgeber sind bereits gezielt eingesetzt (z. B. tickt nur die Timer-Anzeige in der Sidebar sekündlich). Ohne Messbefund kein weiterer Umbau.
- [ ] **Listen virtualisieren:** nicht nötig. Die längsten Listen sind serverseitig seitenweise (Anki-Browser: 50 pro Seite); die Doc-Hub-Liste bleibt bis einige hundert Dokumente flüssig. Ab ca. 1.000 Dokumenten lohnt `virtual`.
- [~] **Schwere Arbeit auslagern:** Der Anki-Import arbeitet jetzt in Blöcken à 1.000 Notizen mit Atempausen für Fenster, Timer und Erinnerungen (vorher eine blockierende Schleife); bei Fehlern wird der halbe Import komplett entfernt. PDF-Auslesen gibt alle 5 Seiten ab. Ein eigener `utilityProcess` würde die Datenbankverbindung verdoppeln und lohnt nicht.
- [~] **Animationen:** keine eigenen schweren Animationen; Board-Hervorhebungen sind kurze Farbübergänge.
- [x] **Bilder und Fonts:** alles lokal gebündelt, keine Netzwerk-Schriften.
- [~] **Profiling:** Messpunkte fest eingebaut (`[perf]` im Protokoll). Interaktives Profiling (DevTools, React Profiler) im Entwicklungsmodus.

## 4. Main-Process und IPC
- [~] **Main nie blockieren:** siehe Abschnitt 3 (Import, PDF). Kurze SQLite-Aufrufe sind unkritisch.
- [x] **IPC effizient:** ausschließlich `invoke`/`handle`, kein `sendSync`. Große Daten (Anki-Medien) laufen über das eigene Protokoll `unihub-media` statt über IPC.
- [x] **Schmale, typisierte API:** `contextBridge` mit eigenem Schnittstellenvertrag; neu: alle 71 Kanäle lehnen Aufrufe ab, die nicht vom eigenen Hauptfenster kommen.

## 5. Speicher
- [x] **Memory Leaks vermeiden:** Durchsicht aller Abonnements und Zeitgeber: Schnittstellen-Abonnements geben eine Abmelde-Funktion zurück und werden in Effekten aufgeräumt, Intervalle (Übersicht, Timer, WebView) werden gestoppt. Nichts gefunden.
- [~] **Fenster und Webviews begrenzen:** Dienst-Tabs entstehen erst beim ersten Öffnen (höchstens vier plus Dokumentenansicht). Ungenutzte Tabs automatisch zu schließen wurde bewusst nicht gemacht: Entwürfe in Exchange oder laufende AMBOSS-Sitzungen gingen verloren.
- [~] **Hintergrundfenster:** `backgroundThrottling` ist beim Hauptfenster absichtlich aus, damit Pomodoro-Timer und Erinnerungen bei verstecktem Fenster pünktlich bleiben. Unsichtbare Dienst-Tabs drosselt Chromium selbst.
- [x] **Messen:** `app.getAppMetrics()` wird 8 s nach dem Start protokolliert (`[perf] Speicher`).

## 6. Daten und Speicherung
- [x] **Lokale DB:** SQLite (`node:sqlite`, in Electron eingebaut) – `better-sqlite3` ist nicht nötig und würde eine native Kompilierung erfordern. Indizes und Transaktionen sind vorhanden; neu: `synchronous = NORMAL` (sicher bei WAL, schneller bei großen Importen) und `PRAGMA optimize` beim Beenden.
- [x] **Schreibzugriffe:** Fensterzustand wird entprellt gespeichert; Exporte (`.apkg`, `.ics`) und Datenbank-Sicherungen schreiben atomar (Nebendatei, dann Umbenennen).
- [x] **Backups und Migrationen versioniert:** tägliche Sicherung (7 Stück) mit Integritätsprüfung (`src/main/backup.ts`); Migrationen über `PRAGMA user_version`.

## 7. Sicherheit
- [x] `contextIsolation: true`, `nodeIntegration` aus, `sandbox: true`.
- [x] **CSP** im Renderer, jetzt zusätzlich `object-src 'none'`, `base-uri 'none'`, `form-action 'none'`; `setWindowOpenHandler` und `will-navigate` eingeschränkt, Anmelde-Popups nur für ausdrücklich erlaubte Domains.
- [x] **Remote-Inhalte / IPC-Eingaben:** Dienst-Tabs haben keine Schnittstelle zur App; Absenderprüfung auf allen Kanälen. Eingaben werden in den jeweiligen Stores geprüft (Titel, Datum, Farbe, Status, Pfade). `zod` wurde nicht ergänzt: zusätzliche Abhängigkeit, die Prüfungen sitzen bereits an der Quelle.
- [x] **Electron-Fuses:** `RunAsNode`, `NODE_OPTIONS` und `--inspect` aus; ASAR-Integritätsprüfung an; App wird nur aus dem Archiv geladen. Cookie-Verschlüsselung ist ebenfalls an (vorher getestet: bestehende Anmeldungen bleiben lesbar; ohne die Fuse lagen die Cookies im Klartext).
- [~] **`npm audit`:** 3 Meldungen der Stufe „mittel“ in `mammoth` (nur Denial-of-Service in einer Hilfsbibliothek, hier nicht ausnutzbar; der angebotene Fix würde ein veraltetes `mammoth` einspielen). Signierung und signierte Updates: [ ] nicht möglich ohne Zertifikat.

## 8. Ressourcen und Akku
- [x] **Hardware-Beschleunigung** bleibt an.
- [x] **Single-Instance-Lock** (`requestSingleInstanceLock`).
- [x] **Polling minimieren:** Erinnerungen prüfen alle 30 s eine kleine Abfrage (billiger als Terminplanung pro Ereignis); neu: nach dem Aufwachen aus dem Standby werden Kalender-Abos sofort aktualisiert (`powerMonitor`).
- [ ] **Auto-Updater:** nicht umgesetzt. Differential-Updates brauchen einen Ort für Veröffentlichungen (z. B. GitHub Releases) und sinnvollerweise Code-Signierung.

## 9. UX-Feinschliff
- [x] **Fensterzustand** wird gemerkt (`src/main/windowState.ts`), inklusive maximiert und Mehrbildschirm-Prüfung.
- [~] **Optimistic UI / Skeletons:** Verschieben und Erledigen im To-Do-Board reagiert sofort. Skeletons nicht umgesetzt: Das Nachladen eines Bereichs dauert nur wenige Millisekunden.
- [x] **Nativer Look:** `nativeTheme` folgt dem gewählten Design (Titelleiste, Dialoge); Fenster- und Seitenfarbe stimmen schon beim ersten Bild. Bewusst keine Menüleiste in der installierten App.
- [x] **Fehlerbehandlung und Logging** (`src/main/log.ts`).

## 10. Qualität und Messung
- [x] **Baseline gemessen** (Tabelle oben) und nach der Optimierung wiederholt.
- [x] **Tests und CI:** 17 Unit-Tests (Vitest), Selbsttest der verpackten App (`--selftest`), Größenbudget (`npm run budget`) und GitHub-Actions-Ablauf (`.github/workflows/ci.yml`: Typprüfung, Tests, Build, Budget – noch nicht auf GitHub gelaufen). Playwright für Electron nicht ergänzt (hoher Aufwand für die gebotene Absicherung).
- [ ] **Crash-Reporting:** nicht umgesetzt. `crashReporter`/Sentry brauchen einen Server und würden Daten übertragen. Stattdessen: lokales Protokoll, Absturzbehandlung und automatisches Neuladen des Fensters.

## Empfohlene Reihenfolge (erledigt)
1. Baseline messen (Abschnitt 10). ✔
2. Sicherheitsflags prüfen (Abschnitt 7). ✔
3. Bundle analysieren und Code-Splitting (Abschnitte 2 und 3). ✔
4. Startpfad entschlacken (Abschnitt 1). ✔
5. IPC und Main-Process entlasten (Abschnitt 4). ✔
6. Speicher und Leaks prüfen (Abschnitt 5). ✔
7. Erneut messen und Verbesserungen dokumentieren. ✔
