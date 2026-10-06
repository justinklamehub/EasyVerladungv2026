---
name: Einlagerungsstrategie integration
description: User requirements for integrating the legacy storage strategy into COMET.
---

Die Einlagerungsstrategie soll in das aktuelle COMET-Projekt integriert werden: Aufbau und Styling wie im aktuellen Projekt, alles dynamisch, mit Einstellungen und Rechtevergabe.

**Why:** Der Nutzer hat diese Anforderungen ausdrücklich für die Integration seiner alten Einlagerungsanwendung genannt.

**How to apply:** Bei der Umsetzung bestehende Gestaltung und Berechtigungsverwaltung verwenden; Lagerstruktur und Strategie nicht fest im Programm vorgeben.

Bestände, Retouren und eingelagerte Aufträge sollen weiterhin per CSV-Upload aktualisiert werden, nicht über eine automatische Anbindung.

**Why:** Der Nutzer hat „CSV-Upload wie bisher“ gewählt.

**How to apply:** Für diese Daten CSV-Importe vorsehen; eine automatische Datenanbindung gehört nicht zum vereinbarten Umfang.

Palettenkonten, Werkbestand, Salden und Eigentumsberechnungen dürfen durch die Einlagerungsintegration nicht verändert werden.

**Why:** Diese Bereiche gehören ausdrücklich nicht zum freigegebenen Umfang.

**How to apply:** Lagerstrategie, Vormerkungen und CSV-Bestandsstände getrennt von den bestehenden Palettenbuchungen behandeln.

Die Altdaten müssen vollständig in das neue Modul übernommen werden, auch Bestände, Retouren, eingelagerte Aufträge, Vormerkungen, alte Vollmeldungen und inaktive Zuordnungen.

**Why:** Der Nutzer hat ausdrücklich die vollständige Übernahme der übrigen alten Daten verlangt.

**How to apply:** Historie und Quelldaten erhalten; erledigte Vollmeldungen nicht als aktuelle Vollsperren behandeln und neuere COMET-Änderungen nicht überschreiben.

Es gibt zwei getrennte Handscanner-Abläufe: Die „Lagerübersicht“ zeigt von der Lagerleitung gepflegte Artikelzuordnungen nach Priorität und erlaubt Vollmeldungen. Die „Aufträge Übersicht“ sucht eingelagerte Aufträge und erfasst Lager-Vormerkungen nach Spedition und Kalenderwoche.

**Why:** Der Nutzer hat die unterschiedlichen Aufgaben der beiden bisherigen Module beschrieben.

**How to apply:** Separate Scannerfenster anbieten. Historische Kalenderwochenangaben und Speditionsnamen müssen auch ohne passende COMET-Speditionszuordnung nutzbar bleiben.

In der Auftrags-Scanneransicht sollen „Aufträge suchen“ und „Regal vormerken“ oben getrennt auswählbar sein. Das Regal soll frei eingebbar sein, aber vom System vorgeschlagen werden.

**Why:** Der Nutzer hat diesen getrennten Ablauf und die freie Eingabe mit Vorschlag ausdrücklich verlangt.

**How to apply:** Einen Vorschlag nicht als unveränderbare Auswahl behandeln; eine manuell eingegebene Regalbezeichnung eindeutig dem vorgesehenen Regal zuordnen und bei fehlender oder mehrdeutiger Zuordnung ausdrücklich warnen.

Artikelnummern sollen direkt in der Lagerübersicht einsehbar sein, und die Farben der Lageranzeige sollen definierbar sein.

**Why:** Der Nutzer hat beide Anforderungen für die Einlagerungsansicht ausdrücklich ergänzt.

**How to apply:** Artikelnummern ohne Öffnen eines Regaldetails anzeigen; anpassbare Farben in den Einlagerungs-Einstellungen anbieten, ohne die bestehenden Artikel-, Gruppen- und Speditionszuordnungen zu verändern.

Die Artikelnummern sollen als abgerundete Farbbalken wie in der Bildvorlage erscheinen. Die Farbe richtet sich nach der Gruppe der Artikel-Regal-Zuordnung, nicht nach dem Regalstatus.

**Why:** Der Nutzer hat die Darstellung anhand einer Bildvorlage und die Farbzuordnung ausdrücklich vorgegeben.

**How to apply:** Die gepflegten Gruppenfarben verwenden; bei mehreren Artikeln pro Regal jeden Artikel separat darstellen. Statusfarben der Regalkacheln bleiben davon unabhängig.

Beim Klick auf ein Regal sollen IST-Bestand, Retouren und Aufträge in drei separaten aufklappbaren Listen im Regaldetail erscheinen.

**Why:** Der Nutzer hat die getrennten „Drops“ anhand der Screenshots ausdrücklich verlangt.

**How to apply:** Jede Datenart unabhängig aufklappbar machen, Palettenanzahl und Daten des ausgewählten Regals anzeigen und leere Bestände eindeutig kennzeichnen.

Die primäre Lagerübersicht soll die Matrix der Bildvorlage verwenden: Hallen nebeneinander, Gänge als Spalten. Die bisherige Kachelansicht bleibt als zweite Ansicht erhalten. Regale immer vom letzten oben zum ersten unten sortieren.

**Why:** Der Nutzer hat diese Ansichten und die absteigende Sortierung ausdrücklich vorgegeben.

**How to apply:** Nach tatsächlicher Regalposition absteigend sortieren, nicht nach Importreihenfolge; Hallen, Gänge und Positionen weiterhin aus den gepflegten Daten ableiten.

Die Matrix soll professioneller aussehen und Zoom/Vollbild, Belegungs- und Auftragsfilter, Regalsuche mit direktem Sprung sowie Vollmelden und Freigeben direkt am Regal bieten.

**Why:** Der Nutzer hat alle vier Funktionsbereiche ausdrücklich ausgewählt.

**How to apply:** Bei Weiterentwicklungen diese operativen Funktionen und die getrennten Berechtigungen für Vollmelden und Freigeben erhalten.

In der Matrix Such- und Belegungsfilter über Hervorheben und Abblenden darstellen; nur die Hallen- und Gangauswahl verändert den angezeigten Ausschnitt.

**Why:** Entfernte Zeilen und Spalten würden die räumliche Orientierung zwischen realen Lagerplätzen während der Suche verändern.

**How to apply:** Treffer weiterhin an ihren tatsächlichen Positionen zeigen und die Treffernavigation auf passende Regale begrenzen.

In der Lageransicht soll zwischen geplanten Artikeln und Aufträgen / Retouren umgeschaltet werden können. Die importierten Aufträge sollen direkt je Regal mit Spedition, Relation, Termin und Palettenzahl sichtbar sein.

**Why:** Der Nutzer hat den Inhaltswechsel ausdrücklich verlangt und dafür die Artikelbalken und Speditionskarten seiner bisherigen Ansicht als Bildvorlagen gezeigt.

**How to apply:** Die Inhaltsauswahl getrennt von Matrix/Kacheln und Belegungsfiltern behandeln; geplante Artikelzuordnungen nicht durch tatsächliche Aufträge oder Retouren ersetzen.
