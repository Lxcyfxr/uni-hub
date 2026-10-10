# Uni-Hub – Release Notes

## 0.1.0 – Erste Version

Uni-Hub ist eine Windows-App zur Studienorganisation: Kalender, Aufgaben, Lernplaner, Karteikarten, Dokumente und deine Uni-Webdienste an einem Ort. Alle Daten bleiben lokal auf deinem Rechner.

### Funktionen
- **Übersicht:** Termine, Aufgaben und Lernfortschritt auf einen Blick.
- **To-Do:** Board mit Status (offen / in Arbeit / erledigt), Kategorien mit Farben, Fälligkeit und Priorität.
- **Lernplaner:** Fächer und Themen mit Prüfungsdatum, Pomodoro-Timer und Lernstatistik.
- **Kalender:** iCal-Abos per Link oder Datei, eigene Termine, Export als `.ics`, Erinnerungen als Windows-Benachrichtigung.
- **Doc-Hub:** PDF-, DOCX- und PPTX-Dateien importieren (auch per Drag & Drop), Ordner, Vorschau und Volltextsuche. Downloads aus Exchange und lehre.charite landen automatisch hier.
- **Anki-Karteikarten:** Stapel anlegen, `.apkg` und Text importieren, Stapel exportieren, Lernen mit dem FSRS-Algorithmus.
- **Webdienste eingebettet:** Exchange, lehre.charite, AMBOSS und MOSES mit dauerhafter Anmeldung. Sitzungen lassen sich in den Einstellungen widerrufen.
- **Komfort:** Hell- und Dunkelmodus, Infobereich-Symbol, optionaler Autostart.

### Daten und Sicherheit
- Tägliche automatische Sicherung der Datenbank (die letzten 7), „Jetzt sichern“ in den Einstellungen.
- Integritätsprüfung der Datenbank beim Start; Protokolle ohne Passwörter.
- Abgeschottetes Fenster (Context Isolation, Sandbox), eingebettete Dienste mit abgelehnten Berechtigungen wie Kamera, Mikrofon und Standort.
- Anki-Karten aus fremden Stapeln werden ohne Skriptausführung angezeigt.
- Keine Telemetrie. Passwörter werden nicht gespeichert.

### Lizenz
- Uni-Hub steht unter der **MIT-Lizenz**.
- Lizenzen der verwendeten Open-Source-Pakete: in der App unter *Einstellungen → Über Uni-Hub → Open-Source-Lizenzen* und im Installer.

### Bekannte Einschränkungen
- **Nicht signiert:** Windows SmartScreen zeigt „Unbekannter Herausgeber“. Über *Weitere Informationen → Trotzdem ausführen* startest du den Installer.
- **Keine automatischen Updates:** Neue Versionen installierst du über den neuen Installer; deine Daten bleiben erhalten.
- **Anki:** keine getippten Antworten, keine gefilterten Stapel; Exporte sind auf 1 GB Medien begrenzt.
- **PDFs:** Gescannte PDFs sind nicht durchsuchbar (keine Texterkennung).
- Die Kompatibilität mit Anki-Paketen ist mit nachgebauten Testdateien geprüft, nicht mit dem Original-Anki.

### Installation
`Uni-Hub-Setup-0.1.0.exe` ausführen (Windows 10/11, 64 Bit, pro Benutzer, keine Adminrechte nötig). Der Installer ist etwa 100 MB groß.
