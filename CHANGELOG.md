# Änderungsprotokoll

Alle nennenswerten Änderungen an Uni-Hub. Format angelehnt an [Keep a Changelog](https://keepachangelog.com/de/1.1.0/), Versionierung nach [SemVer](https://semver.org/lang/de/).

## [0.2.0] – 2026-10-11

### Hinzugefügt
- **Prüfungsplan:** Trage bei einem Fach den Prüfungstermin ein und lege je Thema Umfang (S/M/L) und Schwierigkeit fest. Uni-Hub verteilt die offenen Themen auf deine freien Lerntage, berücksichtigt deine Lernzeit pro Wochentag und passt den Plan an, wenn etwas liegen bleibt. Mit genug Daten lernt er deine tatsächliche Lerngeschwindigkeit.
- Der heutige Lernplan steht in der Morgenmeldung und im Tray-Popup.
- **Kalender** mit Tages-, Wochen-, Monats- und Jahresansicht.
- **Fristen- und Pausenerinnerung:** tägliche Meldung zu anstehenden Aufgaben und Erinnerung an eine Lernpause nach längerer aktiver Nutzung.
- **Tray-Popup** mit den heutigen Terminen, Fristen und dem Lernplan.
- **Globale Suche** (Strg+K) über Aufgaben, Termine, Lernplan, Karteikarten und Dokumente.
- **Dokumentnotizen** im Doc-Hub (durchsuchbar).
- **Problem melden** in den Einstellungen: öffnet ein vorausgefülltes GitHub-Issue; Uni-Hub sendet selbst nichts.
- **Builds für macOS und Linux** (`.dmg`, `.AppImage`, `.deb`), plattformspezifischer Tray, Autostart und Menü sowie ein Release-Workflow für Tags.
- Zentrale Theme-Farben für Hell und Dunkel.

### Geändert
- **Schneller:** Neue Datenbank-Indizes beschleunigen das Löschen von Karten und Stapeln (2.000 Karten: 7,5 s → 15 ms) und die Lernzeit-Summen im Lernplan; die globale Suche liest nur noch, was sie braucht.
- Der Lernplan rechnet höchstens zwei Jahre voraus.
- Linux-Autostart maskiert Sonderzeichen im Startpfad vollständig.
- Build-Einstellungen liegen getrennt je Plattform in `config/`.

### Technik
- 92 Unit-Tests, 14 Sicherheitstests in Electron.
- Neue Datenbank-Migrationen 9 (Umfang und Schwierigkeit je Thema) und 10 (Indizes); bestehende Daten bleiben erhalten.

## [0.1.0] – 2026-10-09

Erste Version.

### Hinzugefügt
- **Übersicht** mit Tagesplan, Fristen, Lernfortschritt, Fokus-Timer, Anki-Stand und neuesten Dokumenten.
- **To-Do** als Board (Offen, In Bearbeitung, Erledigt) mit Drag&Drop, farbigen Kategorien, Filter und Listenansicht.
- **Lernplaner** mit Fächern, Themen, Fortschrittsbalken, Prüfungs-Countdown und **Pomodoro-Timer** (einstellbare Zeiten, Lernzeit-Statistik, Serie).
- **Kalender** mit iCal-Abos (https/webcal), `.ics`-Import und -Export, eigenen Terminen, wiederkehrenden Terminen und Terminerinnerungen.
- **Doc-Hub** für PDF, DOCX, PPTX, Bilder und Text mit Ordnern, Tags, Volltextsuche und eingebetteter Anzeige.
- **Anki-kompatible Karteikarten** mit FSRS: Import/Export von `.apkg`/`.colpkg` (altes und neues Format), Text/CSV-Import, Kartentypen Einfach, Umgekehrt und Lückentext, Kartenbrowser, Tageslimit.
- **Web-Dienste** Exchange, lehre.charite, AMBOSS und MOSES mit dauerhafter Anmeldung; Downloads aus Exchange und lehre.charite landen im Doc-Hub, Anki-Pakete aus lehre.charite werden direkt importiert.
- Infobereich-Symbol, Autostart, Hell-/Dunkel-Design, Fenstergröße merken.
- **Daten & Wartung:** tägliche Datenbank-Sicherung mit Integritätsprüfung, Protokoll, „Alle Daten löschen“.
- Installer (NSIS, pro Benutzer), Selbsttest der verpackten App (`--selftest`), Prüfsummen.

### Sicherheit
- Fenster und Ansichten mit Isolation, Sandbox, ohne Node und ohne `<webview>`; Hauptfenster lädt nur die eigene Oberfläche.
- Externe Links nur über https; Dienst-Tabs können nicht auf `file:` oder Programm-Schemata navigieren.
- Eingabe- und Absenderprüfung für alle Schnittstellen-Aufrufe.
- Schutz vor manipulierten Paketen (Größen- und Mengengrenzen bei Anki-, DOCX-, PPTX-, iCal- und CSV-Import).
- Electron-Fuses (u. a. Cookie-Verschlüsselung), Berechtigungen standardmäßig abgelehnt, strenge CSP.

### Technik
- 52 Unit-Tests, 14 Sicherheitstests in Electron, Release-Prüfung, Größenbudget, CI-Ablauf und Dependabot-Konfiguration.
- Bereiche der Oberfläche laden beim ersten Öffnen nach; kleinerer Installer (ca. 101 MB).

### Bekannte Grenzen
- Installer nicht code-signiert (Windows SmartScreen warnt beim ersten Start); keine automatischen Updates.
- Anki: keine getippten Antworten, keine gefilterten Stapel; Exporte bis 1 GB Medien. Kompatibilität mit echten Anki-Paketen nur mit nachgebauten Testdateien geprüft.
- Keine Texterkennung für gescannte PDFs.
