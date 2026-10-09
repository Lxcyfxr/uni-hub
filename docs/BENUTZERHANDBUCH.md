# Uni-Hub – Benutzerhandbuch

Uni-Hub bündelt Studienorganisation an einem Ort: Übersicht, Aufgaben, Lernplan mit Pomodoro-Timer, Kalender, Dokumente, Karteikarten (Anki-kompatibel) und deine Uni-Webdienste. Alle Daten bleiben auf deinem Computer ([PRIVACY.md](../PRIVACY.md)).

## Inhalt

1. [Erste Schritte](#1-erste-schritte)
2. [Die Oberfläche](#2-die-oberfläche)
3. [Übersicht](#3-übersicht)
4. [To-Do](#4-to-do)
5. [Lernplaner und Pomodoro-Timer](#5-lernplaner-und-pomodoro-timer)
6. [Kalender](#6-kalender)
7. [Doc-Hub](#7-doc-hub)
8. [Anki](#8-anki)
9. [Web-Dienste: Exchange, lehre.charite, AMBOSS, MOSES](#9-web-dienste)
10. [Einstellungen](#10-einstellungen)
11. [Sicherung, Wiederherstellung und Löschen](#11-sicherung-wiederherstellung-und-löschen)
12. [Tastaturkürzel](#12-tastaturkürzel)
13. [Fehlerbehebung](#13-fehlerbehebung)

---

## 1. Erste Schritte

**Installieren:** `Uni-Hub-Setup-<Version>.exe` ausführen und den Anweisungen folgen (Installation nur für deinen Benutzer, Zielordner wählbar). Beim ersten Start zeigt Windows möglicherweise „Der Computer wurde durch Windows geschützt“, weil der Installer nicht signiert ist: *Weitere Informationen → Trotzdem ausführen*. Die Prüfsumme der Datei steht in `SHA256SUMS.txt`:

```powershell
(Get-FileHash .\Uni-Hub-Setup-0.1.0.exe -Algorithm SHA256).Hash
```

**Aktualisieren:** Den neuen Installer einfach über die alte Version installieren. Deine Daten bleiben erhalten.

**Deinstallieren:** Über *Windows-Einstellungen → Apps*. Die Daten bleiben absichtlich im Ordner `%APPDATA%\uni-hub` erhalten; wer sie loswerden will, nutzt vorher *Einstellungen → Daten & Wartung → Alle Daten löschen …*.

**Im Hintergrund:** Schließt du das Fenster, läuft Uni-Hub im Infobereich neben der Uhr weiter, damit Terminerinnerungen und der Pomodoro-Timer aktiv bleiben. Ein Klick auf das Symbol öffnet das Fenster; mit der rechten Maustaste erscheint ein Menü (*Uni-Hub öffnen*, Sprungziele wie *To-Do* oder *Anki*, *Beenden*). Zum vollständigen Beenden: *Beenden* im Menü des Symbols.

## 2. Die Oberfläche

Links liegt die Seitenleiste mit den Bereichen **Übersicht, To-Do, Lernplaner, Kalender, Doc-Hub, Anki** und den Web-Diensten **Exchange, lehre.charite, AMBOSS, MOSES**. Unten stehen die **Einstellungen**. Das Menü-Symbol oben links klappt die Leiste ein (nur Symbole). Läuft ein Pomodoro-Timer, erscheint die Restzeit in der Seitenleiste; ein Klick führt zum Lernplaner.

Das Design (dunkel oder hell) stellst du unter *Einstellungen → Darstellung* ein. Fenstergröße und -position merkt sich die App.

## 3. Übersicht

Die Startseite zeigt den Tag auf einen Blick:

- **Kennzahlen** oben, u. a. Termine heute, fällige Aufgaben und deine Lernserie.
- **Heute:** Termine des Tages (aktueller und nächster Termin sind hervorgehoben) sowie fällige und überfällige Aufgaben, die du direkt abhaken kannst.
- **Demnächst:** Termine und Fristen der nächsten sieben Tage.
- **Lernfortschritt:** Fortschritt je Fach, Lernzeit der Woche und Prüfungs-Countdown.
- **Fokus-Timer:** Pomodoro starten oder pausieren.
- **Anki:** wie viele Karten heute fällig sind, mit Sprung ins Lernen.
- **Zuletzt im Doc-Hub:** die neuesten Dokumente.

Ein Klick auf eine Karte öffnet den jeweiligen Bereich.

## 4. To-Do

Aufgaben haben drei Stati: **Offen**, **In Bearbeitung**, **Erledigt**.

- **Schnell eintragen:** Titel oben eingeben, optional Kategorie, Fälligkeit und Priorität wählen, *Enter* drücken.
- **Board:** Drei Spalten. Karten per Ziehen (Drag&Drop) in eine andere Spalte verschieben, oder mit den Knöpfen auf der Karte (Starten, Fertig, Zurück). Klick auf die Karte öffnet die Details (Titel, Notizen, Kategorie, Fälligkeit, Priorität, Status, Löschen). Erledigte Aufgaben stehen unten in der Spalte; ältere sind eingeklappt.
- **Nach Kategorie:** Die Listenansicht gruppiert Aufgaben nach Kategorie. Mit dem Haken erledigst du eine Aufgabe, über das Status-Etikett wechselst du den Status.
- **Kategorien:** Mit *Kategorien* legst du Namen und Farben an, änderst oder löschst sie (Aufgaben bleiben erhalten). Neue Kategorien kannst du auch direkt in der Auswahl anlegen. Die Filter über dem Board zeigen je Kategorie die offenen Aufgaben.
- **Fälligkeit:** rot = überfällig, orange = heute, gelb = morgen. Hohe Priorität zeigt eine rote Flagge. Aufgaben mit Fälligkeit erscheinen auch im Kalender.

Board oder Liste und der gewählte Filter bleiben beim nächsten Start gespeichert.

## 5. Lernplaner und Pomodoro-Timer

**Fächer und Themen:** Mit *Fach* legst du ein Fach an (Name, Farbe, optional Prüfungstermin). Themen trägst du im Feld der Fachkarte ein; mit *Umschalt+Enter* fügst du mehrere Zeilen auf einmal ein, ein Klick auf den Titel benennt um. Setzt du einen Haken, rückt der Fortschrittsbalken des Fachs vor; oben steht der Gesamtfortschritt. Ein Etikett zeigt den Prüfungs-Countdown (rot ab sieben Tagen davor).

**Pomodoro-Timer:** Fokusrunden mit Pausen.

| Einstellung (Zahnrad) | Standard |
| --- | --- |
| Fokus-Zeit | 25 Minuten |
| Kurze Pause | 5 Minuten |
| Lange Pause | 15 Minuten |
| Runden bis zur langen Pause | 4 |
| Nächste Phase automatisch starten | aus |
| Signalton | an |

Optional wählst du unter *Lernen für …* ein Fach oder Thema; mit dem Play-Knopf an einem Thema startest du direkt dafür. Beendete Fokusrunden werden dem Fach gutgeschrieben (daraus entstehen „Heute“, „7 Tage“ und die Lernserie).

- *Zurücksetzen* verwirft die laufende Runde (keine Gutschrift).
- *Überspringen* beendet die Phase; angefangene Fokuszeit ab einer vollen Minute wird gutgeschrieben.
- Am Ende jeder Phase kommen eine Windows-Benachrichtigung und ein Piepton.
- Der Timer läuft weiter, wenn du den Bereich wechselst oder das Fenster in den Infobereich schließt. Beendest du die App, geht die laufende Runde verloren.

## 6. Kalender

Monatsansicht mit Farbpunkten pro Termin. Ein Klick auf einen Tag zeigt rechts die Termine mit Uhrzeit und Ort.

- **iCal-Abo:** *iCal-Abo* → Name und Adresse (`https://…` oder `webcal://…`) eintragen, Farbe wählen. Abos aktualisieren sich beim Start, alle 30 Minuten und nach dem Aufwachen aus dem Standby; *Aktualisieren* löst es sofort aus. Wiederkehrende Termine (z. B. Vorlesungen) werden für ein Jahr zurück und voraus aufgelöst. Aus Sicherheitsgründen werden nur HTTPS-Adressen angenommen.
- **.ics importieren:** einmaliger Import einer Datei (wird nicht aktualisiert).
- **Eigene Termine:** *Termin* → Titel, ganztägig oder mit Uhrzeit, Ort, Notizen. Eigene Termine (violett) klickst du in der Tagesliste zum Bearbeiten oder Löschen an. Termine aus Abos und Dateien sind schreibgeschützt.
- **Export:** *Eigene exportieren* speichert deine Termine als `.ics`, z. B. zum Import in Outlook.
- Offene Aufgaben mit Fälligkeit erscheinen orange im Kalender.
- **Exchange-Kalender:** Wenn dein Outlook-Kalender einen veröffentlichten ICS-Link anbietet, kannst du ihn als Abo eintragen (je nach Einstellung der Einrichtung nicht immer möglich).

**Terminerinnerungen:** Für Termine mit Uhrzeit sendet Uni-Hub eine Windows-Benachrichtigung (Standard: 10 Minuten vorher; einstellbar von „zum Beginn“ bis 1 Stunde). Sie funktionieren nur, solange Uni-Hub läuft – am besten im Infobereich oder mit Autostart.

## 7. Doc-Hub

Deine Lernunterlagen an einem Ort, mit Volltextsuche.

- **Importieren:** *Importieren* (Mehrfachauswahl) oder Dateien und Ordner auf die **Liste links** ziehen. Beim Import eines Ordners wird sein Name der Ordner im Hub, Unterordner werden einbezogen. Die Dateien werden kopiert, das Original bleibt unberührt.
- **Formate:** PDF, Word (DOCX), PowerPoint (PPTX), Bilder (PNG, JPG, GIF, WebP, BMP), Text, Markdown und CSV lassen sich anzeigen und durchsuchen. Ältere und weitere Formate (DOC, PPT, XLS, XLSX, ODT, ODP, RTF) werden verwaltet und im Standardprogramm geöffnet.
- **Anzeigen:** PDFs, Bilder und Text direkt in der App; DOCX als Seite; PPTX als Text je Folie (für Layout und Bilder *Extern öffnen*).
- **Suchen:** Das Suchfeld durchsucht Titel, Ordner, Tags und den Inhalt aller Dokumente und zeigt Treffer-Auszüge. Gescannte PDFs und Bilder haben keinen Text und sind nicht durchsuchbar; Dateien über 300 MB werden nicht ausgelesen.
- **Ordnen:** Mit dem Stift vergibst du Titel, Ordner und Tags; die Auswahl oben filtert nach Ordner. Das Papierkorb-Symbol entfernt nur die Kopie in Uni-Hub, nie das Original.
- **Automatisch:** Dateien, die du in Exchange oder lehre.charite herunterlädst, landen im Ordner „Exchange“ bzw. „lehre.charite“.

## 8. Anki

Karteikarten, kompatibel mit Anki-Paketen, mit Lernalgorithmus FSRS.

**Stapel:** *Neuer Stapel* legt einen Stapel an. Mit `::` im Namen entstehen Unterstapel (z. B. `Medizin::Anatomie`). Die Liste zeigt je Stapel Neu, Lernen, Fällig und die Kartenzahl. Über die Symbole an der Zeile siehst du die Karten, exportierst, benennst um (oder verschiebst durch neuen Pfad) oder löschst den Stapel samt Unterstapeln.

**Importieren:**
- **.apkg/.colpkg:** *Importieren (.apkg)*. „Lernfortschritt übernehmen“ behält bereits gelernte Karten (näherungsweise auf FSRS umgerechnet), sonst starten alle Karten neu. Alte und neue Anki-Formate werden gelesen, Bilder und Audio übernommen. Bereits vorhandene Karten werden übersprungen. Große Stapel können einige Minuten dauern; ein Fortschrittsdialog läuft mit.
- **Text/CSV:** Spalte 1 = Vorderseite, Spalte 2 = Rückseite, Spalte 3 = Tags (optional). Trennzeichen Tab, Semikolon oder Komma.
- **Aus lehre.charite:** Ein dort heruntergeladenes `.apkg` wird automatisch importiert (ohne Lernfortschritt) und per Windows-Benachrichtigung gemeldet; ein Klick darauf öffnet Anki.

**Exportieren:** Das Paket enthält Unterstapel und Medien und lässt sich in Anki öffnen. Optional mit Lernfortschritt.

**Karten anlegen:** *Karte hinzufügen* – Stapel und Kartentyp wählen:
- **Einfach:** Vorder- und Rückseite.
- **Einfach (+ umgekehrte Karte):** zusätzlich Rückseite → Vorderseite.
- **Lückentext:** `{{c1::Antwort}}` oder mit Hinweis `{{c1::Antwort::Hinweis}}`; jede Nummer ergibt eine eigene Karte.

Tags, Bilder (*Bild einfügen*) und eine Live-Vorschau gibt es im Editor. *Hinzufügen & weiter* behält Stapel und Typ für die nächste Karte.

**Lernen:** *Lernen* an einem Stapel (Unterstapel inklusive). Mit *Antwort zeigen* siehst du die Rückseite, dann bewertest du mit **Nochmal, Schwer, Gut, Einfach**; auf den Knöpfen steht, wann die Karte wiederkommt. Oben zählen Neu, Lernen und Fällig. Du kannst die Karte bearbeiten oder pausieren. Wie viele neue Karten pro Tag kommen, stellst du unten in der Stapelliste ein (Standard 20).

**Karten durchsuchen:** *Karten* zeigt eine Tabelle mit Suche, Stapelfilter und Status. Zeilen anklicken zum Bearbeiten; markierte Karten lassen sich pausieren, fortsetzen oder (samt Notiz) löschen.

Nicht enthalten: getippte Antworten, gefilterte Stapel, Rückgängig beim Bewerten.

## 9. Web-Dienste

**Exchange** (Outlook im Web), **lehre.charite**, **AMBOSS** und **MOSES** öffnen sich direkt in der App mit Zurück-, Vor- und Neu-laden-Knopf.

- **Anmelden:** einmal, wie im Browser (auch mit Single Sign-on). Anmelde-Fenster erscheinen in der App. Die Sitzung bleibt gespeichert (bis zu 30 Tage, sofern der Dienst sie nicht früher beendet); die Dienste sind voneinander getrennt.
- **Links** aus den Seiten öffnen im Standardbrowser (nur `https`).
- **Abmelden/zurücksetzen:** *Einstellungen → Sitzungen widerrufen*.
- Manche Seiten sind möglicherweise nur im Uni-Netz oder per VPN erreichbar.

## 10. Einstellungen

| Bereich | Inhalt |
| --- | --- |
| **Darstellung** | dunkel oder hell |
| **Benachrichtigungen** | Terminerinnerungen ein/aus, Vorlaufzeit, Testbenachrichtigung |
| **Hintergrund** | Beim Schließen im Infobereich weiterlaufen (Standard: an); mit Windows starten (nur installierte App; startet ohne Fenster im Infobereich) |
| **Sitzungen widerrufen** | Anmeldung je Dienst löschen |
| **Daten & Wartung** | Version, *Jetzt sichern*, Ordner (Sicherungen, Datenordner, Protokoll), *Alle Daten löschen …* |
| **Über Uni-Hub** | Autor, Haftungsausschluss, Lizenzen |

## 11. Sicherung, Wiederherstellung und Löschen

- **Automatische Sicherung:** Beim Start (nach dem ersten Bild) prüft Uni-Hub die Datenbank und legt einmal täglich eine Sicherung an; die letzten 7 bleiben. Nur eine intakte Datenbank wird gesichert.
- **Manuell:** *Einstellungen → Daten & Wartung → Jetzt sichern*.
- **Wiederherstellen:** Uni-Hub beenden (auch im Infobereich), im Ordner `%APPDATA%\uni-hub\backups` die gewünschte Datei als `unihub.db` in den Datenordner `%APPDATA%\uni-hub` kopieren und die Dateien `unihub.db-wal` und `unihub.db-shm` dort löschen. Danach starten.
- **Alles löschen:** *Alle Daten löschen …* entfernt Datenbank, Dokumente, Anki-Daten, Sicherungen und alle Anmeldungen und startet Uni-Hub neu. Das lässt sich nicht rückgängig machen.
- **Datenmitnahme:** Anki-Stapel als `.apkg` exportieren, eigene Termine als `.ics`; der Datenordner enthält alles andere.

Gescannte Dokumente, Anki-Medien und Sicherungen belegen Platz im Datenordner.

## 12. Tastaturkürzel

| Wo | Taste | Wirkung |
| --- | --- | --- |
| Anki-Lernen | `Leertaste` oder `Enter` | Antwort zeigen; danach „Gut“ |
| Anki-Lernen | `1` `2` `3` `4` | Nochmal, Schwer, Gut, Einfach |
| To-Do, Fach, Kategorie, Stapel | `Enter` | Eintrag bestätigen |
| Thema im Fach | `Umschalt+Enter` | neue Zeile (mehrere Themen auf einmal) |

## 13. Fehlerbehebung

**Windows warnt vor dem Installer („Unbekannter Herausgeber“).** Der Installer ist nicht signiert. *Weitere Informationen → Trotzdem ausführen*; vorher kannst du die Prüfsumme vergleichen (Abschnitt 1).

**Das Fenster ist weg, nachdem ich es geschlossen habe.** Uni-Hub läuft im Infobereich weiter (bei den versteckten Symbolen neben der Uhr). Zum Beenden: Rechtsklick auf das Symbol → *Beenden*. Das Verhalten ändert *Einstellungen → Hintergrund*.

**Ich bekomme keine Terminerinnerungen.** Erinnerungen kommen nur, solange Uni-Hub läuft, und nur für Termine mit Uhrzeit. Prüfe *Einstellungen → Benachrichtigungen* (*Test senden*) und in Windows „Nicht stören“ bzw. den Fokus-Assistenten.

**Ein Web-Dienst lädt nicht oder die Anmeldung hängt.** Prüfe die Verbindung (Uni-Netz/VPN). Hilft das nicht: *Einstellungen → Sitzungen widerrufen* für den Dienst und neu anmelden.

**Ein Kalender-Abo zeigt einen Fehler.** Die Adresse muss mit `https://` oder `webcal://` beginnen. In Netzen mit Firmen-Proxy oder eigenem Zertifikat kann der Abruf scheitern; als Ersatz die `.ics`-Datei herunterladen und importieren.

**Ein PDF findet die Suche nicht.** Vermutlich ist es gescannt (nur Bild, kein Text). Texterkennung gibt es nicht.

**Der Anki-Import dauert lange oder bricht ab.** Große Stapel mit vielen Bildern brauchen Zeit; der Fortschritt wird angezeigt. Abgelehnt werden Pakete mit unplausibel großem Inhalt (Schutz vor manipulierten Dateien) – bei einem abgebrochenen Import bleibt nichts Halbes zurück. Doppelte Karten werden übersprungen.

**„Datenbank beschädigt“ beim Start.** Uni-Hub beenden und eine Sicherung zurückkopieren (Abschnitt 11).

**Etwas anderes geht schief.** Das Protokoll liegt unter *Einstellungen → Daten & Wartung → Protokoll* (`main.log`, ohne Passwörter). Es hilft bei der Fehlersuche.
