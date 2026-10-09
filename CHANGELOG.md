# Änderungsprotokoll

Alle nennenswerten Änderungen an Uni-Hub. Format angelehnt an [Keep a Changelog](https://keepachangelog.com/de/1.1.0/), Versionierung nach [SemVer](https://semver.org/lang/de/).

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
