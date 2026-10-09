# Sicherheits-Checkliste (Electron / Uni-Hub)

Alles, was sicherheitsrelevant geprüft werden muss. Relevante Projektdateien: `src/main/security.ts`, `src/main/links.ts`, `src/main/ipc.ts`, `src/main/index.ts`, `src/preload/index.ts`, `src/shared/ipc.ts`, `src/shared/validate.ts`, `src/shared/urls.ts`.

Stand der Durchsicht: jeder Punkt wurde am Code geprüft und, wo möglich, durch einen automatischen Test abgesichert. **[x]** = erfüllt, **[~]** = teilweise bzw. mit begründeter Einschränkung, **[ ]** = nicht erfüllt (Begründung dahinter).

## Prüfen und nachweisen

| Befehl | Prüft |
| --- | --- |
| `npm test` | 52 Unit-Tests: Adress- und Eingabeprüfung, Kartenvorlagen, **Quelltext-Wächter** (siehe unten) |
| `npm run test:electron` | 14 Tests im echten Electron: Navigation, Popups, Berechtigungen, Absenderprüfung, Medien-Protokoll, Zip-Bomben, Löschen |
| `npm run verify:release` | fertiger Build: Fuses, Paketinhalt, CSP |
| `Uni-Hub.exe --selftest=ergebnis.json` | verpackte App: Funktionen und Sicherheitsflags |
| `npm audit --audit-level=high` | Abhängigkeiten (läuft auch im CI) |

Die Quelltext-Wächter (`tests/security-static.test.ts`) schlagen an, wenn jemand `shell.openExternal` außerhalb von `links.ts` einsetzt, `child_process`, `eval`, `innerHTML`, `sendSync`, `nodeIntegration: true`, `webSecurity: false`, Zertifikatsfehler-Umgehungen oder SQL aus Textbausteinen einführt, wenn der Preload mehr als das Objekt `uni` bereitstellt oder wenn Preload-Kanäle und Handler im Hauptprozess nicht übereinstimmen.

## 1. BrowserWindow-Konfiguration
- [x] `contextIsolation: true`
- [x] `nodeIntegration: false` (auch `nodeIntegrationInWorker` und `nodeIntegrationInSubFrames` aus)
- [x] `sandbox: true`
- [x] `webSecurity: true` (nie deaktiviert)
- [x] `allowRunningInsecureContent: false`
- [x] `experimentalFeatures` aus
- [x] `enableBlinkFeatures` nicht verwendet
- [x] `webviewTag: false`; zusätzlich werden `<webview>`-Anhänge blockiert
- [x] DevTools im Release deaktiviert (`devTools: !app.isPackaged`, keine Menüleiste, geöffnete Werkzeuge werden geschlossen)

Alle Werte stehen ausdrücklich in `SECURE_WEB_PREFERENCES` (`security.ts`) und gelten für das Hauptfenster **und** jede eingebettete Ansicht (Dienst-Tabs, Dokumentenansicht). Der Selbsttest prüft Konstanten und Wirkung (kein `require`/`process`, kein funktionierendes `<webview>`).

## 2. Preload und IPC
- [x] Preload legt nur das schmale Objekt `uni` per `contextBridge` in die Seite, nie `ipcRenderer` oder `require` (Test)
- [x] Keine generischen Kanäle: alle 71 Aufrufe und 4 Ereignisse haben feste Namen (Test)
- [~] Kanalnamen zentral als Whitelist: Die Namen stehen als Literale im Preload (der einzige Weg für die Seite) und im Hauptprozess; keine gemeinsame Konstantendatei. Ein Test erzwingt, dass beide Seiten exakt übereinstimmen.
- [x] IPC-Eingaben im Hauptprozess geprüft: `shared/validate.ts` (IDs, Texte, Längen, Fensterbereiche, Pfade, Datumswerte, Farben, Listen) für alle Handler mit Parametern; Objekte (Aufgaben, Termine, Karten, Dokumentdaten) prüfen die jeweiligen Stores. Bewusst ohne zod, um keine weitere Abhängigkeit zu schaffen (Prüfungen getestet).
- [x] `event.senderFrame`/Sender geprüft: Nur das Hauptfenster (und dort nur der oberste Frame) darf aufrufen (`ipc.ts`, Test)
- [~] Pfade, Befehle, URLs aus der Seite: Es gibt keine Befehlsausführung (Wächter-Test). Webadressen gehen nur über `openExternalSafe` (https). Pfade: `docs:importPaths` nimmt absolute Pfade aus Drag&Drop/Dialog entgegen und prüft nur das Format. Eine kompromittierte Oberfläche könnte so lesbare Dateien in den Doc-Hub kopieren lassen; dagegen schützen CSP, fehlende XSS-Muster und die Sandbox der importierten Inhalte.
- [x] Keine Stacktraces oder sensiblen Daten an die Seite: Electron übergibt nur die Fehlermeldung; Meldungen sind nutzerorientiert
- [x] Kein `sendSync` (Wächter-Test)

## 3. Navigation und Fenster
- [x] `setWindowOpenHandler`: neue Fenster werden verweigert; erlaubt sind nur Anmelde-Popups ausgewählter Anbieter (https, genaue Domain oder Unterdomäne) in den Dienst-Tabs
- [x] Hauptfenster: `will-navigate` und `will-redirect` erlauben ausschließlich die eigene Oberfläche (Dev-Server bzw. die gebündelte `index.html`); alles andere, auch `file://`, wird nicht geladen (Tests)
- [~] Dienst-Tabs sind Drittseiten (Exchange, lehre.charite, AMBOSS, MOSES) mit vielen Weiterleitungen (Single Sign-on). Eine Domain-Liste wäre fragil, deshalb gilt: nur `http(s)` als Navigationsziel, nie `file:` oder Programm-Schemata (Test).
- [x] `shell.openExternal` nur für geprüfte `https:`-Adressen ohne Zugangsdaten in der Adresse, an genau einer Stelle (`openExternalSafe`; Wächter-Test). `shell.openPath` öffnet nur gespeicherte Bibliotheksdateien mit zugelassener Endung.
- [x] Keine Remote-Inhalte in Fenstern mit Preload: Nur das Hauptfenster hat einen Preload; Dienst-Tabs und Popups haben keinen
- [x] Berechtigungen standardmäßig abgelehnt; erlaubt sind nur Benachrichtigungen, Vollbild und Zwischenablage-Schreiben (Test; Protokoll nennt nur den Rechnernamen)
- [x] Eigenes Protokoll `unihub-media` validiert Pfade (Namensraum und Dateiname geprüft, Prefix-Check; 7 Angriffsmuster im Test, auch im Selbsttest)

## 4. Content Security Policy
- [~] Strikte CSP: `default-src 'self'`, kein `unsafe-eval`, `object-src`, `base-uri` und `form-action` auf `'none'`. `style-src` enthält `'unsafe-inline'`, weil Ant Design Stile zur Laufzeit einfügt. Das ist die einzige Lockerung und betrifft nur Stile, keine Skripte.
- [x] `connect-src` fällt auf `'self'` zurück (die Oberfläche macht keine Netzwerkabrufe); `img-src`, `media-src`, `font-src` nur `'self'`, `data:` bzw. `unihub-media:`
- [x] Keine externen Skripte, Schriften oder CDNs
- [x] CSP wirkt im Release: im gebauten HTML enthalten (`verify:release`, Selbsttest). Zusätzlich laufen importierte Inhalte (Anki-Karten, DOCX-Vorschau) in `sandbox=""`-Frames ohne Skripte.

## 5. Renderer-Code (XSS)
- [x] Kein `dangerouslySetInnerHTML` (Wächter-Test)
- [~] Importiertes HTML (Anki-Karten, DOCX-Vorschau) wird nicht mit DOMPurify bereinigt, sondern in Frames mit `sandbox=""` angezeigt: keine Skriptausführung, Remote-Ressourcen durch die CSP blockiert, kein Zugriff auf die App. Gleichwertige Isolation, aber keine Bereinigung des Inhalts.
- [x] Kein `eval`, `new Function`, `innerHTML` mit Nutzerdaten (Wächter-Test)
- [x] Links: Der GitHub-Link hat `rel="noopener noreferrer"`; alle Weiterleitungen nach außen laufen über `openExternalSafe`

## 6. Dateisystem und Daten
- [~] Dateizugriffe: Eigene Pfade liegen fest unter `userData`; Löschen ist auf `userData\docs` begrenzt (Prefix-Check); importiert wird nur, was der Nutzer per Dialog oder Drag&Drop wählt (siehe Abschnitt 2 zum Restrisiko).
- [x] Import/Export validiert:
  - **Zip-Slip:** Dateinamen aus Paketen werden nie als Pfad verwendet (`safeFileName`, eigener Zielordner).
  - **Zip-Bomben:** Anki-Pakete (Eintragsanzahl, Größe je Eintrag, zstd-Ausgabegrenze, Mediensumme; Abbruch räumt auf), DOCX/PPTX (Zip-Verzeichnis wird vor dem Lesen geprüft), iCal und CSV (20 MB), Dokumente über 300 MB werden nicht ausgelesen. Tests für alle Fälle.
  - **JSON-Schema:** Es gibt keinen JSON-Import.
- [x] Backups: Ablage im Benutzerprofil, Integritätsprüfung vor jeder Sicherung, atomares Schreiben, Wiederherstellung dokumentiert (README)
- [x] Atomares Schreiben für Exporte und Sicherungen; Temp-Ordner mit `mkdtemp`
- [~] Sensible Daten: Es werden keine Passwörter gespeichert; Anmelde-Cookies sind mit Windows verschlüsselt (Fuse, siehe Abschnitt 7). Die Datenbank mit Aufgaben, Terminen und Karten ist unverschlüsselt im Benutzerprofil – Windows-Kontoschutz bzw. BitLocker wird empfohlen.
- [x] Keine Geheimnisse im Code, im Repo (`.env*` ist ignoriert) oder im Bundle (`verify:release`)
- [x] Logs: keine Passwörter oder Dokumentinhalte, Berechtigungen und Links nur mit Rechnername bzw. Schema, Textauslese nur mit Dateiname; Rotation bei 1 MB, drei Dateien
- [x] SQL ausschließlich parametrisiert; dynamische Teile sind Platzhalterlisten und feste Bausteine (Wächter-Test)

## 7. Electron-Fuses und Hardening
- [x] `RunAsNode` aus
- [x] `EnableNodeCliInspectArguments` aus
- [x] `EnableNodeOptionsEnvironmentVariable` aus
- [x] `OnlyLoadAppFromAsar` an
- [x] `EnableEmbeddedAsarIntegrityValidation` an
- [x] `EnableCookieEncryption` an. Vorher getestet: Bestehende Anmeldungen bleiben lesbar, neue werden verschlüsselt gespeichert. Ein späteres Abschalten würde einmalig abmelden. Ohne die Fuse lagen die Cookies im Klartext in der Cookie-Datei.
- [x] Keine Debug-Flags (Wächter-Test; Inspect ist zusätzlich per Fuse gesperrt)
- [x] Single-Instance-Lock aktiv; `second-instance` wertet nur `--hidden` aus; die App registriert sich nicht als Programm für Protokolle oder Deep-Links (kein `setAsDefaultProtocolClient`, kein `open-url`)

Alle Fuses prüft `npm run verify:release` am fertigen Build.

## 8. Abhängigkeiten und Supply Chain
- [x] `npm audit`: 0 hohe, 0 kritische Funde. 10 mittlere mit einer gemeinsamen Ursache (`sprintf-js`: Denial-of-Service bei Formatangaben) über `mammoth` (Laufzeit) und `electron-builder` (nur Build). Nicht ausnutzbar, weil weder fremde Formatzeichenfolgen verarbeitet noch Netzwerkdaten übergeben werden; der angebotene Fix würde ein veraltetes `mammoth` einspielen. CI scheitert ab Stufe „hoch“.
- [x] `package-lock.json` eingecheckt; CI installiert mit `npm ci`
- [x] Electron auf aktueller Version (44.7.0)
- [x] Nur notwendige Abhängigkeiten: Laufzeit nur `fflate`, `mammoth`, `pdfjs-dist`, `ts-fsrs`, `yauzl`; alles Übrige wird beim Bauen gebündelt oder ist Werkzeug
- [x] Native Module und Install-Skripte geprüft: keine nativen Laufzeitmodule; Install-Skripte nur in Werkzeugen (`esbuild`, `electron-winstaller`, `fsevents`)
- [x] Lizenzen geprüft (`LICENSE`, `THIRD-PARTY-LICENSES.md`)
- [x] Dependabot-Konfiguration (`.github/dependabot.yml`: npm wöchentlich, GitHub Actions monatlich); wird mit dem Hochladen auf GitHub aktiv

## 9. Updates und Distribution
- [~] Auto-Updates über HTTPS: nicht zutreffend, es gibt keine automatischen Updates. Neue Versionen kommen per Installer.
- [~] Update-Pakete signiert: nicht zutreffend (siehe oben)
- [ ] Installer Code-signiert: nicht erfüllt, es liegt kein Zertifikat vor. Windows SmartScreen warnt beim ersten Start.
- [x] Prüfsummen: `npm run dist` schreibt `release/SHA256SUMS.txt`; die Veröffentlichung bleibt ein manueller Schritt
- [x] Build-Pipeline: CI mit nur Lesezugriff, ohne Geheimnisse; der Installer wird lokal gebaut

## 10. Netzwerk
- [x] Zertifikatsfehler werden nie ignoriert (kein `certificate-error`-Handler, keine Umgehungs-Flags; Wächter-Test). Kalender-Abos nur über HTTPS, auch bei Weiterleitungen (jede Station wird geprüft); `http://` und `file://` werden abgelehnt (Test).
- [x] Keine unnötigen ausgehenden Verbindungen, keine Telemetrie: Verbindungen entstehen nur zu den genutzten Diensten und eingetragenen Kalender-Adressen (siehe `PRIVACY.md`)
- [x] Keine lokalen Server im Release (der Vite-Server existiert nur in der Entwicklung)
- [~] Proxy und Header: Dienst-Tabs nutzen die Windows-Proxyeinstellungen. Kalender-Abos laufen über Node-`fetch`, das weder den Windows-Proxy noch den Windows-Zertifikatsspeicher nutzt; hinter Firmen-Proxys mit eigenem Zertifikat kann ein Abo daher scheitern.

## 11. Datenschutz (DSGVO)
- [x] Datenminimierung: Es werden nur Daten gespeichert, die die Funktionen brauchen; keine Passwörter
- [x] Alle Daten bleiben lokal; keine Cloud-Synchronisation
- [x] Löschen und Exportieren: *Einstellungen → Daten & Wartung → Alle Daten löschen …* (mit Abfrage aus dem Hauptprozess, Test), Datenordner und Sicherungen öffnen, Exporte für Anki (`.apkg`) und Termine (`.ics`)
- [x] Datenschutzhinweise: `PRIVACY.md` (Datenablage, Datenflüsse, Rechte). Eine formale Erklärung ist nicht nötig, solange keine Daten an den Betreiber gehen.

## 12. Fehlerbehandlung und Monitoring
- [x] `uncaughtException` und `unhandledRejection` abgefangen und geloggt (`log.ts`); abgestürzte Fenster laden sich begrenzt neu
- [x] Meldungen ohne interne Details: Die Absturzmeldung ist allgemein gehalten, Einzelheiten stehen nur im Protokoll
- [~] Crash-Reporting: nicht vorhanden, bewusst (würde Daten übertragen); lokales Protokoll genügt
- [x] Verhalten bei beschädigten Daten: Integritätsprüfung beim Start mit klarer Meldung; nur intakte Daten überschreiben Sicherungen; Wiederherstellung dokumentiert

## 13. Tests und Review
- [x] Unit-Tests für Validierung, Pfad- und Adressprüfung und Sicherheitslogik (`tests/*.test.ts`, 52 Tests)
- [x] Selbsttest (`src/main/selftest.ts`) prüft Fenster-Härtung, Medien-Protokoll, Link-Regeln und CSP automatisch; `verify:release` prüft die Fuses
- [x] Navigation zu fremder URL, Öffnen von `file://`, Programm-Schemata und Popups sind automatisiert getestet. Drag&Drop externer Dateien läuft über denselben, gesperrten Navigationsweg (`navigateOnDragDrop: false`, Sperre im Hauptfenster).
- [ ] Code-Review mit Fokus auf IPC und Dateizugriffe vor jedem Release: Das ist ein Vorgehen, kein automatischer Test – bei Änderungen an `src/main` und `src/preload` bewusst einplanen.
- [x] Statische Analyse mit Electronegativity (3 Funde, alle Fehlalarme): „fehlende Navigationsbegrenzung“ und „fehlender Permission-Handler“ (beides vorhanden und getestet; das Werkzeug erkennt die verwendeten Schreibweisen nicht), „OPEN_EXTERNAL“ (betraf den missverständlichen Namen `docs.openExternal`, jetzt `openInDefaultApp`). Zusätzlich die bekannte CSP-Lockerung für Stile.

## Priorisierung
1. **Kritisch:** Abschnitte 1, 2, 3, 4 – erfüllt; neu geschlossen: Navigation des Hauptfensters auf `file://`, ungeprüftes `shell.openExternal` aus Dienst-Tabs.
2. **Hoch:** Abschnitte 5, 6, 7, 8 – erfüllt; neu: Zip-Bomben-Schutz, Cookie-Verschlüsselung.
3. **Mittel:** Abschnitte 9, 10, 11 – offen bleibt die Code-Signierung (Zertifikat nötig).
4. **Laufend:** Abschnitte 12, 13 – Tests laufen bei jeder Änderung; Review bleibt Aufgabe.
