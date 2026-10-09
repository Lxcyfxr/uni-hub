# Uni-Hub

Windows-Desktop-App zur Studienorganisation: Übersicht, To-Do (Board mit Kategorien), Lernplaner mit Pomodoro-Timer, Kalender (iCal), Doc-Hub (PDF/DOCX/PPTX mit Volltextsuche), Anki-kompatible Karteikarten (FSRS) sowie eingebettete Web-Dienste (Exchange, lehre.charite, AMBOSS, MOSES).

Technik: Electron · React · TypeScript · Ant Design · SQLite (`node:sqlite`) · electron-vite · electron-builder.

## Dokumentation

| Dokument | Für wen | Inhalt |
| --- | --- | --- |
| [Benutzerhandbuch](docs/BENUTZERHANDBUCH.md) | Anwender | Installation, alle Bereiche Schritt für Schritt, Sicherung, Fehlerbehebung |
| [Entwicklerdokumentation](docs/ENTWICKLUNG.md) | Entwickler | Architektur, Ordnerstruktur, Schnittstellen und Migrationen erweitern, Tests, Release |
| [PRIVACY.md](PRIVACY.md) | alle | Welche Daten wo liegen, wann etwas das Gerät verlässt, Löschen und Export |
| [SECURITY-CHECKLIST.md](SECURITY-CHECKLIST.md) | Entwickler | Sicherheitsvorgaben mit Status und Nachweisen |
| [OPTIMIZATION.md](OPTIMIZATION.md) | Entwickler | Optimierungen mit Messwerten vorher/nachher |
| [CHANGELOG.md](CHANGELOG.md) | alle | Änderungen je Version |

## Funktionen

- **Übersicht:** Tagesplan, Fristen, Lernfortschritt und Anki-Stand auf einen Blick
- **To-Do:** Board (Offen / In Bearbeitung / Erledigt) mit Kategorien und Drag&Drop
- **Lernplaner:** Fächer, Themen mit Fortschrittsbalken, Prüfungs-Countdown, Pomodoro-Timer
- **Kalender:** iCal-Abos, `.ics`-Import/-Export, eigene Termine, Terminerinnerungen
- **Doc-Hub:** PDF, DOCX, PPTX, Bilder, Text mit Ordnern, Tags und Volltextsuche
- **Anki:** Import/Export von `.apkg`, eigene Karten (auch Lückentext), Lernen mit FSRS
- **Web-Dienste:** Exchange, lehre.charite, AMBOSS, MOSES mit dauerhafter Anmeldung
- Infobereich, Autostart, Hell/Dunkel, tägliche Datenbank-Sicherung

## Schnellstart

Anwender: Installer `Uni-Hub-Setup-<Version>.exe` ausführen (siehe [Benutzerhandbuch](docs/BENUTZERHANDBUCH.md#1-erste-schritte)).

Entwickler: Node.js 22 oder neuer, dann `npm install` und `npm run dev` (Details unten und in der [Entwicklerdokumentation](docs/ENTWICKLUNG.md)).

## Entwickeln

```bash
npm install
npm run dev          # Entwicklungsmodus mit Hot-Reload
npm run typecheck    # TypeScript prüfen
npm test             # Unit-Tests (Vitest)
npm run test:electron # Sicherheitstests im echten Electron (Navigation, Berechtigungen, Importgrenzen, Löschen)
```

Änderungen im Hauptprozess (`src/main`) und in der Brücke (`src/preload`) erfordern einen **kompletten Neustart** von `npm run dev`, nicht nur ein Neuladen des Fensters.

## Installer bauen

```bash
npm run dist         # erzeugt release/Uni-Hub-Setup-<Version>.exe (NSIS, pro Benutzer)
npm run pack         # nur entpackte App in release/win-unpacked (schneller)
npm run verify:release # prüft den Build: Electron-Fuses, Paketinhalt, CSP (nach pack/dist)
```

### Selbsttest der fertigen App

Prüft in der **verpackten** App, dass Datenbank mit Volltextsuche, PDF/DOCX/PPTX-Auslesen, Kalender, Lernalgorithmus und Verschlüsselung funktionieren. Er arbeitet mit temporären Daten und berührt weder echte Nutzerdaten noch eine laufende Instanz.

```bash
release\win-unpacked\Uni-Hub.exe --selftest=ergebnis.json
```

Exit-Code `0` = alles bestanden; Details stehen in der JSON-Datei. Vor einer Weitergabe des Installers sollte das nach jedem `npm run dist` laufen.

## Daten und Wartung

Alles liegt lokal unter `%APPDATA%\uni-hub` (bzw. `Uni-Hub`; unter Windows ist die Groß-/Kleinschreibung egal):

| Pfad | Inhalt |
| --- | --- |
| `unihub.db` | Aufgaben, Termine, Lernplan, Anki-Karten, Dokument-Index |
| `backups\` | tägliche Sicherungen der Datenbank (die letzten 7) |
| `logs\main.log` | Protokoll (rotiert bei 1 MB, enthält keine Passwörter) |
| `docs\`, `anki\media\` | importierte Dokumente und Anki-Medien |
| `Partitions\` | Anmeldesitzungen der Web-Dienste (Cookies) |

Die Einstellungen enthalten den Bereich **Daten & Wartung** mit „Jetzt sichern“ und Verknüpfungen zu Datenordner, Sicherungen und Protokoll.

**Wiederherstellen:** Uni-Hub beenden, eine Datei aus `backups\` als `unihub.db` in den Datenordner kopieren (die Dateien `unihub.db-wal` und `unihub.db-shm` dort löschen), App starten.

Beim Start prüft die App die Datenbank (`PRAGMA quick_check`). Nur eine intakte Datenbank wird gesichert, damit eine beschädigte keine gute Sicherung überschreibt.

## Sicherheit und Datenschutz

Ausführlich: [PRIVACY.md](PRIVACY.md) (Datenflüsse, Löschen, Export) und [SECURITY-CHECKLIST.md](SECURITY-CHECKLIST.md).

- Hauptfenster: `contextIsolation`, `sandbox`, keine Node-Integration; Entwicklerwerkzeuge und Menüleiste nur in der Entwicklung.
- Web-Dienste laufen in getrennten, dauerhaften Sitzungen. Berechtigungen wie Kamera, Mikrofon oder Standort werden abgelehnt (erlaubt: Benachrichtigungen, Vollbild, Zwischenablage schreiben).
- Anki-Karten aus importierten Stapeln werden in einer Sandbox ohne Skriptausführung angezeigt.
- Passwörter werden nicht gespeichert; Anmeldesitzungen bleiben lokal und lassen sich in den Einstellungen widerrufen.
- Das Protokoll enthält Fehlermeldungen und Dateipfade, aber keine Zugangsdaten.

## Bekannte Grenzen

- **Nicht signiert:** Der Installer trägt kein Code-Signing-Zertifikat. Windows SmartScreen zeigt beim ersten Start „Unbekannter Herausgeber“ (Weitere Informationen → Trotzdem ausführen).
- **Keine automatischen Updates:** Neue Versionen werden per neuem Installer eingespielt (Daten bleiben erhalten).
- Anki: keine getippten Antworten, keine gefilterten Stapel; Exporte sind auf 1 GB Medien begrenzt. Die Kompatibilität mit echten Anki-Paketen ist mit nachgebauten Testdateien geprüft, nicht mit dem Original-Anki.
- Gescannte PDFs sind nicht durchsuchbar (keine Texterkennung).

## Lizenz

Uni-Hub steht unter der [MIT-Lizenz](LICENSE). Die Lizenzen der gebündelten Open-Source-Pakete stehen in [THIRD-PARTY-LICENSES.md](THIRD-PARTY-LICENSES.md); sie werden mit `npm run licenses` neu erzeugt (läuft automatisch bei `npm run dist`), sind in der App unter *Einstellungen → Über Uni-Hub* einsehbar und liegen im Installer. Nach dem Hinzufügen neuer Dependencies die Datei neu erzeugen und mitcommitten.
