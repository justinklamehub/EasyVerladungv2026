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

Artikelnummern sollen direkt in der Lagerübersicht einsehbar sein, und die Farben der Lageranzeige sollen definierbar sein.

**Why:** Der Nutzer hat beide Anforderungen für die Einlagerungsansicht ausdrücklich ergänzt.

**How to apply:** Artikelnummern ohne Öffnen eines Regaldetails anzeigen; anpassbare Farben in den Einlagerungs-Einstellungen anbieten, ohne die bestehenden Artikel-, Gruppen- und Speditionszuordnungen zu verändern.
