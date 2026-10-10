# Datenschutz

Uni-Hub ist eine lokale Desktop-App ohne eigenen Server, ohne Benutzerkonto und ohne Telemetrie. Diese Seite beschreibt, welche Daten wo liegen und wann Verbindungen ins Netz entstehen.

## Welche Daten gespeichert werden

Alles liegt auf deinem Computer unter `%APPDATA%\uni-hub`:

| Daten | Ort |
| --- | --- |
| Aufgaben, Kategorien, Termine, Lernplan, Lernzeiten, Anki-Karten, Dokument-Index | Datenbank `unihub.db` |
| Importierte Dokumente | `docs\` |
| Anki-Bilder und -Audio | `anki\media\` |
| Tägliche Sicherungen der Datenbank (die letzten 7) | `backups\` |
| Anmeldungen bei Exchange, lehre.charite, AMBOSS, MOSES (Cookies, Browserdaten) | `Partitions\` (Cookies sind mit Windows verschlüsselt) |
| Protokoll mit Fehlermeldungen (ohne Passwörter, ohne Dokumentinhalte) | `logs\main.log` |

Passwörter speichert Uni-Hub nicht. Anmeldungen laufen in den eingebetteten Seiten selbst; gespeichert wird nur die Sitzung des jeweiligen Dienstes.

## Wann Daten das Gerät verlassen

Nur auf deine Veranlassung und nur an die jeweiligen Dienste:

- **Dienst-Tabs** (Exchange, lehre.charite, AMBOSS, MOSES): Du nutzt die Webseiten dieser Anbieter; es gelten deren Datenschutzbestimmungen. Uni-Hub liest ihre Inhalte nicht mit; Downloads aus Exchange und lehre.charite werden lokal im Doc-Hub bzw. in Anki abgelegt.
- **Kalender-Abos**: Uni-Hub ruft die iCal-Adresse ab, die du eingetragen hast (nur über HTTPS). Der Anbieter des Kalenders sieht dabei deine IP-Adresse.
- **Problem melden** (*Einstellungen → Problem melden*): Ein Klick öffnet GitHub im Standardbrowser mit einem vorausgefüllten Issue. Uni-Hub sendet dabei selbst nichts; abgeschickt wird erst auf GitHub (Microsoft, USA) mit deinem eigenen Konto und nur, wenn du es dort bestätigst. Issues sind öffentlich sichtbar. Optional angehängt werden nur Versionsnummern (Uni-Hub, Windows, Electron), die du vorher siehst und abwählen kannst; es gehen nie Daten, Pfade oder Inhalte aus der App mit.
- Sonst gibt es keine Verbindungen: keine Analyse, keine Absturzberichte, keine automatische Update-Prüfung.

Links aus der App öffnen im Standardbrowser, und zwar nur HTTPS-Adressen.

## Deine Rechte

- **Einsicht und Export**: Der Datenordner lässt sich über *Einstellungen → Daten & Wartung → Datenordner* öffnen. Dazu kommen die Exporte von Anki-Stapeln (`.apkg`) und eigenen Terminen (`.ics`) sowie die Datenbank-Sicherungen.
- **Löschung**: *Einstellungen → Daten & Wartung → Alle Daten löschen …* entfernt Datenbank, Dokumente, Anki-Daten, Sicherungen und alle Anmeldungen und startet die App neu. Einzelne Anmeldungen widerrufst du unter *Einstellungen → Dienste*. Das Deinstallieren der App behält die Daten absichtlich; zum vollständigen Entfernen danach den Datenordner löschen.

## Hinweis

Uni-Hub ist ein privates, inoffizielles Projekt ohne Verbindung zu den genannten Diensten (siehe Haftungsausschluss in der App).
