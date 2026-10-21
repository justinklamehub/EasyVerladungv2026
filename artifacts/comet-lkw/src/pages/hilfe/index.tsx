import { useState } from "react";
import { driver } from "driver.js";
import "driver.js/dist/driver.css";
import { useAuth } from "@/contexts/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import {
  LayoutDashboard, Truck, CalendarDays, PackageSearch,
  FileCheck2, Users, ShieldAlert, BarChart2, Settings,
  Play, ChevronRight, ChevronLeft, BookOpen, X,
  MousePointerClick, Lightbulb, CheckCircle2, HelpCircle, Calculator,
} from "lucide-react";

const ROLE_LABELS: Record<string, string> = {
  comet_admin: "COMET Admin",
  comet_leitstand: "Leitstand",
  comet_lager: "Lager",
  comet_viewer: "Betrachter",
  speditions_admin: "Speditions-Admin",
  speditions_viewer: "Speditions-Betrachter",
};

interface Step {
  title: string;
  text: string;
  tip?: string;
}

interface Topic {
  key: string;
  icon: React.ElementType;
  color: string;
  bg: string;
  label: string;
  description: string;
  roles: string[];
  steps: Step[];
  tourPath?: string;
  hasTour?: boolean;
}

const TOPICS: Topic[] = [
  {
    key: "dashboard",
    icon: LayoutDashboard,
    color: "text-blue-600",
    bg: "bg-blue-50",
    label: "Dashboard",
    description: "Tagesuebersicht mit aktuellen Verladungen, Status-Zusammenfassung und Schnellzugriff",
    roles: ["comet_admin", "comet_leitstand", "comet_lager", "comet_viewer", "speditions_admin", "speditions_viewer"],
    hasTour: true,
    steps: [
      {
        title: "Dashboard aufrufen",
        text: 'Klicken Sie auf "Dashboard" in der linken Seitenleiste. Hier sehen Sie sofort den aktuellen Tag auf einen Blick.',
        tip: "Das Dashboard aktualisiert sich automatisch in Echtzeit.",
      },
      {
        title: "Status-Kacheln lesen",
        text: "Die farbigen Kacheln oben zeigen Verladungen nach Status: Offen (grau), In Beladung (blau), Beladen (gruen), Storniert (rot). Klicken Sie auf eine Kachel, um direkt gefiltert zur Liste zu springen.",
      },
      {
        title: "Heutige Verladungen",
        text: "Die Tabelle darunter listet alle heutigen Fahrten. Sie sehen Kennzeichen, Spedition, Status und Uhrzeit auf einen Blick.",
      },
      {
        title: "Wer ist online?",
        text: "Unten links in der Seitenleiste sehen Sie unter der Online-Kachel, welche Kollegen gerade im System aktiv sind.",
        tip: "Gruener Punkt = aktiv in den letzten 5 Minuten.",
      },
    ],
  },
  {
    key: "verladung",
    icon: Truck,
    color: "text-emerald-600",
    bg: "bg-emerald-50",
    label: "Verladung anlegen",
    description: "Einzelne LKW-Verladung erfassen - Kennzeichen, Spedition, Tabelle, Datum und mehr",
    roles: ["comet_admin", "comet_leitstand", "comet_lager"],
    hasTour: true,
    steps: [
      {
        title: "Seite oeffnen",
        text: 'Navigieren Sie zu "Verladungen" in der linken Seitenleiste. Klicken Sie oben rechts auf den Button "+ Neue Verladung".',
      },
      {
        title: "Pflichtfelder ausfullen",
        text: "Tragen Sie mindestens Bezeichnung, Kennzeichen und Tabelle ein. Das Datum ist vorausgefuellt mit heute.",
      },
      {
        title: "Spedition zuweisen",
        text: "Waehlen Sie die Spedition aus dem Dropdown. Nur aktive Speditionen erscheinen in der Liste.",
        tip: "Speditionen werden unter dem Menuepunkt Speditionen verwaltet (nur Leitstand/Admin).",
      },
      {
        title: "Status setzen",
        text: "Der Anfangsstatus ist immer Offen. Der Status kann spaeter per Klick auf den Status-Badge direkt in der Tabelle geaendert werden.",
      },
      {
        title: "Speichern",
        text: "Klicken Sie Speichern. Die Verladung erscheint sofort in der Liste - und alle angemeldeten Benutzer sehen sie in Echtzeit.",
      },
    ],
  },
  {
    key: "massenanlage",
    icon: Truck,
    color: "text-teal-600",
    bg: "bg-teal-50",
    label: "Massenanlage",
    description: "Mehrere Verladungen auf einmal schnell anlegen",
    roles: ["comet_admin", "comet_leitstand", "comet_lager"],
    steps: [
      {
        title: "Massenanlage oeffnen",
        text: 'Navigieren Sie zu "Verladungen" und klicken Sie auf "Massenanlage" direkt neben "+ Neue Verladung".',
      },
      {
        title: "Daten eingeben",
        text: 'Jede Zeile entspricht einer Verladung. Tragen Sie Bezeichnung, Kennzeichen und Spedition ein - ein Klick auf "+ Zeile hinzufuegen" erweitert die Liste.',
      },
      {
        title: "Pruefen",
        text: "Die Vorschau zeigt alle Eintraege. Fehlerhafte Zeilen werden rot markiert - korrigieren Sie diese vor dem Speichern.",
      },
      {
        title: "Anlegen",
        text: "Klicken Sie Alle anlegen. Die Verladungen werden in einem Durchgang gespeichert und erscheinen sofort in der Tabelle.",
        tip: "Bei Massenanlagen wird automatisch eine Benachrichtigungs-E-Mail versendet (sofern konfiguriert).",
      },
    ],
  },
  {
    key: "kanban",
    icon: Truck,
    color: "text-violet-600",
    bg: "bg-violet-50",
    label: "Kanban-Board",
    description: "Visuelle Drag-and-Drop Ansicht aller Verladungen - nach Status in Spalten sortiert",
    roles: ["comet_admin", "comet_leitstand", "comet_lager", "comet_viewer"],
    tourPath: "/shipments/kanban",
    steps: [
      {
        title: "Kanban aufrufen",
        text: "Klicken Sie in der Seitenleiste auf Verladungen und dann oben rechts auf das Kachel-Symbol oder wechseln Sie ueber den Tab Kanban.",
      },
      {
        title: "Spalten verstehen",
        text: "Jede Spalte ist ein Status: Offen, In Beladung, Beladen, Storniert. Die Zahl in der Spalten-Ueberschrift zeigt die Anzahl der Karten.",
      },
      {
        title: "Per Drag and Drop verschieben",
        text: "Ziehen Sie eine Karte von einer Spalte in eine andere, um den Status zu aendern - ohne ein Formular oeffnen zu muessen.",
        tip: "Nur Benutzer mit Schreibrechten (Lager, Leitstand, Admin) koennen Karten verschieben.",
      },
      {
        title: "Karte oeffnen",
        text: "Klicken Sie auf eine Karte, um alle Details anzuzeigen und Aenderungen vorzunehmen.",
      },
    ],
  },
  {
    key: "wochenplan",
    icon: CalendarDays,
    color: "text-orange-600",
    bg: "bg-orange-50",
    label: "Wochenplan",
    description: "Kalenderuebersicht aller Verladungen der laufenden und naechsten Wochen",
    roles: ["comet_admin", "comet_leitstand", "comet_lager", "comet_viewer", "speditions_admin"],
    steps: [
      {
        title: "Wochenplan aufrufen",
        text: "Klicken Sie auf Wochenplan in der Seitenleiste.",
      },
      {
        title: "Woche navigieren",
        text: "Mit den Pfeilen links/rechts blaettern Sie wochenweise vor und zurueck. Der Heute-Button bringt Sie sofort zur aktuellen Woche.",
      },
      {
        title: "Verladung im Kalender lesen",
        text: "Jede Verladung erscheint als farbiger Block am entsprechenden Tag. Die Farbe zeigt den Status. Klicken Sie darauf fuer Details.",
      },
      {
        title: "Neue Verladung im Kalender anlegen",
        text: "Klicken Sie auf einen leeren Bereich in einer Tageszelle, um eine neue Verladung fuer diesen Tag vorzubereiten.",
      },
    ],
  },
  {
    key: "paletten",
    icon: PackageSearch,
    color: "text-amber-600",
    bg: "bg-amber-50",
    label: "Palettenkonto",
    description: "Palettenein- und -ausgaenge erfassen, Kontostand je Spedition verwalten",
    roles: ["comet_admin", "comet_leitstand", "comet_lager", "comet_viewer"],
    steps: [
      {
        title: "Palettenkonto oeffnen",
        text: "Klicken Sie auf Palettenkonto in der Seitenleiste.",
      },
      {
        title: "Spedition auswaehlen",
        text: "Waehlen Sie oben die Spedition aus dem Dropdown. Das Konto zeigt dann den aktuellen Saldo und alle Buchungen.",
      },
      {
        title: "Buchung erfassen",
        text: "Klicken Sie auf + Buchung. Waehlen Sie ob Eingang oder Ausgang und tragen Sie Menge und Datum ein.",
        tip: "Jede Buchung kann einer Verladung zugeordnet werden - optional, aber empfohlen fuer die Nachvollziehbarkeit.",
      },
      {
        title: "Saldo verstehen",
        text: "Positiver Saldo = wir haben Schulden (Tauschpaletten ausstehend). Negativer Saldo = Spedition hat Schulden bei uns.",
      },
    ],
  },
  {
    key: "abstimmungen",
    icon: FileCheck2,
    color: "text-cyan-600",
    bg: "bg-cyan-50",
    label: "Abstimmungen",
    description: "Monatsabschluesse und Abrechnungen mit Speditionen pruefen und bestaetigen",
    roles: ["comet_admin", "comet_leitstand", "comet_lager", "comet_viewer"],
    steps: [
      {
        title: "Abstimmungen oeffnen",
        text: "Klicken Sie auf Abstimmungen in der Seitenleiste.",
      },
      {
        title: "Zeitraum waehlen",
        text: "Waehlen Sie Monat und Jahr oben aus. Die Tabelle zeigt dann alle relevanten Verladungen des Zeitraums.",
      },
      {
        title: "Positionen pruefen",
        text: "Jede Zeile ist eine Verladung. Gruene Haekchen bedeuten bereits abgestimmt, rote Kreise stehen fuer noch offen.",
      },
      {
        title: "Abstimmen",
        text: "Klicken Sie auf eine Zeile, um sie als abgestimmt zu markieren. Sie koennen auch alle auf einmal bestaetigen.",
      },
      {
        title: "Export",
        text: "Laden Sie die Abstimmung als Excel-Datei herunter - fuer Weiterverarbeitung oder Archivierung.",
      },
    ],
  },
  {
    key: "gefahrgut",
    icon: ShieldAlert,
    color: "text-red-600",
    bg: "bg-red-50",
    label: "Gefahrgut-Scanner",
    description: "QR-Code-Scanner fuer Gefahrgutdaten - mobil per Browser oder Handscanner",
    roles: ["comet_admin", "comet_leitstand", "comet_lager"],
    steps: [
      {
        title: "Scanner aufrufen",
        text: "Oeffnen Sie Gefahrgut in der Seitenleiste - oder rufen Sie /scanner/gefahrgut direkt auf einem Tablet oder Handy auf.",
      },
      {
        title: "QR-Code scannen",
        text: "Halten Sie den QR-Code vor die Kamera. Das System erkennt ihn automatisch und zeigt die Gefahrgutnummer an.",
        tip: "Der Scanner funktioniert auch ohne Login - der oeffentliche Link /scanner/gefahrgut ist fuer den Lagerbetrieb gedacht.",
      },
      {
        title: "Ergebnis pruefen",
        text: "Nach erfolgreichem Scan sehen Sie Klasse, UN-Nummer und Bezeichnung des Gefahrguts. Ein Tonsignal bestaetigt die Erkennung.",
      },
    ],
  },
  {
    key: "benutzer",
    icon: Users,
    color: "text-indigo-600",
    bg: "bg-indigo-50",
    label: "Benutzer verwalten",
    description: "Benutzerkonten anlegen, Rollen vergeben, Passwoerter zuruecksetzen",
    roles: ["comet_admin", "comet_leitstand"],
    steps: [
      {
        title: "Benutzerverwaltung oeffnen",
        text: "Klicken Sie auf Benutzer in der Seitenleiste.",
      },
      {
        title: "Neuen Benutzer anlegen",
        text: "Klicken Sie auf + Neuer Benutzer. Tragen Sie Benutzername, E-Mail (optional) und Passwort ein.",
      },
      {
        title: "Rolle zuweisen",
        text: "Waehlen Sie die passende Rolle: Admin (voller Zugriff), Leitstand (Disposition), Lager (Verladung bearbeiten), Viewer (nur lesen), Speditions-Admin/-Viewer (Speditionssicht).",
      },
      {
        title: "Spedition zuordnen",
        text: "Fuer Speditions-Rollen muss eine Spedition ausgewaehlt werden - der Benutzer sieht dann nur deren Daten.",
        tip: "Passwoerter koennen jederzeit unter Benutzer > Bearbeiten > Passwort zuruecksetzen geaendert werden.",
      },
      {
        title: "Benutzer aktivieren/deaktivieren",
        text: "Inaktive Benutzer koennen sich nicht mehr anmelden, bleiben aber im System fuer Auswertungen erhalten.",
      },
    ],
  },
  {
    key: "einstellungen",
    icon: Settings,
    color: "text-slate-600",
    bg: "bg-slate-50",
    label: "Einstellungen",
    description: "App-Name, E-Mail-Vorlagen und System-Parameter konfigurieren",
    roles: ["comet_admin"],
    tourPath: "/settings",
    steps: [
      {
        title: "Einstellungen oeffnen",
        text: "Klicken Sie auf Einstellungen in der Seitenleiste (nur fuer COMET-Admins sichtbar).",
      },
      {
        title: "Tab: Allgemein",
        text: "Hier aendern Sie App-Name, Unternehmensname und Login-Untertitel. Klicken Sie auf Speichern nach jeder Aenderung - die Aenderung ist sofort sichtbar.",
      },
      {
        title: "Tab: E-Mail-Vorlagen",
        text: "Aktivieren Sie automatische E-Mail-Benachrichtigungen ueber den Schalter. Tragen Sie Empfaenger-Adresse, Betreff und Text ein und klicken Sie dann separat auf Speichern.",
        tip: "Platzhalter wie {{bezeichnung}} werden beim Versand automatisch ersetzt.",
      },
      {
        title: "Tab: Postausgang",
        text: "Hier sehen Sie alle versendeten E-Mails mit Status (Gesendet/Fehler) und koennen den Inhalt in der Vorschau pruefen.",
      },
    ],
  },
  {
    key: "auswertung",
    icon: BarChart2,
    color: "text-purple-600",
    bg: "bg-purple-50",
    label: "Auswertung",
    description: "Statistiken, Grafiken und Kennzahlen zu Verladungen und Speditionen",
    roles: ["comet_admin", "comet_leitstand", "comet_lager", "comet_viewer"],
    steps: [
      {
        title: "Auswertung aufrufen",
        text: "Klicken Sie auf Auswertung in der Seitenleiste.",
      },
      {
        title: "Zeitraum filtern",
        text: "Waehlen Sie oben Datumsbereich und Spedition. Die Grafiken und Tabellen aktualisieren sich sofort.",
      },
      {
        title: "Grafiken lesen",
        text: "Das Balkendiagramm zeigt Verladungen pro Woche oder Monat. Das Kreisdiagramm zeigt die Verteilung nach Status.",
      },
      {
        title: "Excel-Export",
        text: "Klicken Sie auf Export fuer eine Excel-Datei mit allen gefilterten Daten - fuer externe Berichte.",
        tip: "Der Export enthaelt alle Spalten - auch interne Bemerkungen.",
      },
    ],
  },
  {
    key: "kalkulation",
    icon: Calculator,
    color: "text-sky-600",
    bg: "bg-sky-50",
    label: "Spediteur-Kostenvergleich",
    description: "Transportkosten aller Speditionen fuer eine Route auf einen Blick berechnen und vergleichen",
    roles: ["comet_admin", "comet_leitstand"],
    tourPath: "/kalkulation",
    steps: [
      {
        title: "Kalkulation aufrufen",
        text: "Klicken Sie auf Kalkulation in der linken Seitenleiste. Die Seite zeigt links Eingabefelder und rechts eine interaktive Karte.",
      },
      {
        title: "Route eingeben",
        text: "Tragen Sie Startort und Zielort ein - zum Beispiel 'Hamburg' und 'Muenchen'. Druecken Sie auf Route berechnen oder Enter.",
        tip: "Den Standard-Startort koennen Sie dauerhaft unter Einstellungen → Kalkulation hinterlegen, damit er automatisch vorausgefuellt wird.",
      },
      {
        title: "Karte mit Route",
        text: "Nach der Berechnung zeichnet die Karte automatisch die Fahrtstrecke als blaue Linie ein. Der gruene Punkt ist der Startort, der rote Punkt das Ziel. Die Karte zoomt sich automatisch auf die Route.",
      },
      {
        title: "Kilometer anpassen",
        text: "Die errechneten Kilometer werden automatisch eingetragen. Sie koennen den Wert bei Bedarf auch manuell ueberschreiben - zum Beispiel wenn eine andere Route gefahren wird.",
      },
      {
        title: "Paletten eingeben",
        text: "Tragen Sie die Anzahl der Paletten ein. Dieser Wert beeinflusst den Palettenaufschlag, sofern er bei der Spedition hinterlegt ist.",
      },
      {
        title: "Kosten vergleichen",
        text: "Klicken Sie auf Kosten vergleichen. Die Tabelle zeigt alle aktiven Speditionen sortiert nach Gesamtkosten - die guenstigste wird gruen hervorgehoben.",
        tip: "Speditionen ohne hinterlegte Tarife erscheinen separat mit einem Hinweis. Tarife werden unter Speditionen → Tarife gepflegt.",
      },
      {
        title: "Ergebnis lesen",
        text: "Die Tabelle schluessel die Kosten auf: Transportkosten, Kraftstoffzuschlag, Palettenaufschlag, Fixkosten und Maut. Ganz rechts steht der Gesamtbetrag. Unten erscheint die Ersparnis gegenueber der teuersten Option.",
      },
    ],
  },
];

function StepGuide({ topic, onClose }: { topic: Topic; onClose: () => void }) {
  const [current, setCurrent] = useState(0);
  const step = topic.steps[current];
  const Icon = topic.icon;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="absolute top-0 left-0 right-0 h-1 bg-slate-100">
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${((current + 1) / topic.steps.length) * 100}%` }}
          />
        </div>

        <div className="p-6 pt-7">
          <div className="flex items-center justify-between mb-4">
            <div className={`flex items-center gap-2 px-2.5 py-1 rounded-full ${topic.bg}`}>
              <Icon className={`w-3.5 h-3.5 ${topic.color}`} />
              <span className={`text-xs font-medium ${topic.color}`}>{topic.label}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">
                {current + 1} / {topic.steps.length}
              </span>
              <button
                onClick={onClose}
                className="p-1 rounded-md hover:bg-slate-100 text-slate-400 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex items-start gap-3 mb-4">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
              <span className="text-primary font-bold text-sm">{current + 1}</span>
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 text-base leading-tight mb-2">
                {step.title}
              </h3>
              <p className="text-sm text-slate-600 leading-relaxed">{step.text}</p>
            </div>
          </div>

          {step.tip && (
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-100 rounded-lg p-3 mb-4">
              <Lightbulb className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700 leading-relaxed">{step.tip}</p>
            </div>
          )}

          <div className="flex items-center justify-between mt-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCurrent((c) => c - 1)}
              disabled={current === 0}
              className="gap-1"
            >
              <ChevronLeft className="w-4 h-4" /> Zurueck
            </Button>

            <div className="flex gap-1">
              {topic.steps.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setCurrent(i)}
                  className={`h-1.5 rounded-full transition-all ${
                    i === current ? "bg-primary w-4" : "bg-slate-200 w-1.5"
                  }`}
                />
              ))}
            </div>

            {current < topic.steps.length - 1 ? (
              <Button size="sm" onClick={() => setCurrent((c) => c + 1)} className="gap-1">
                Weiter <ChevronRight className="w-4 h-4" />
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={onClose}
                className="gap-1 bg-emerald-600 hover:bg-emerald-700"
              >
                <CheckCircle2 className="w-4 h-4" /> Fertig
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function launchGlobalTour() {
  const d = driver({
    showProgress: true,
    progressText: "Schritt {{current}} von {{total}}",
    nextBtnText: "Weiter",
    prevBtnText: "Zurueck",
    doneBtnText: "Fertig",
    smoothScroll: true,
    steps: [
      {
        popover: {
          title: "Willkommen bei COMET LKW",
          description:
            "Dieser interaktive Rundgang zeigt Ihnen die wichtigsten Bereiche der Anwendung. Klicken Sie auf Weiter, um zu beginnen.",
          align: "center",
        },
      },
      {
        element: "nav",
        popover: {
          title: "Seitenleiste",
          description:
            "Die Navigation auf der linken Seite fuehrt Sie zu allen Bereichen: Dashboard, Verladungen, Wochenplan, Auswertung und mehr.",
          side: "right",
        },
      },
      {
        element: "[data-tour='sidebar-footer']",
        popover: {
          title: "Schnellzugriff",
          description:
            "Hier finden Sie: Online-Benutzer, Nachrichten, Hell/Dunkel-Modus und Ihr Profil - sowie den Abmelden-Button.",
          side: "right",
        },
      },
      {
        element: "[data-tour='help-link']",
        popover: {
          title: "Diese Hilfe-Seite",
          description:
            "Ueber diesen Link kommen Sie jederzeit zur Hilfe und Anleitung zurueck.",
          side: "right",
        },
      },
    ],
  });
  d.drive();
}

export default function HilfePage() {
  const { user } = useAuth();
  const [activeTopic, setActiveTopic] = useState<Topic | null>(null);
  const [, navigate] = useLocation();

  const role = user?.role ?? "";

  const visible = TOPICS.filter(
    (t) => t.roles.includes(role) || role === "comet_admin"
  );

  const handleTour = (e: React.MouseEvent, topic: Topic) => {
    e.stopPropagation();
    if (topic.tourPath) {
      navigate(topic.tourPath);
    } else {
      launchGlobalTour();
    }
  };

  return (
    <div className="w-full min-w-0 space-y-6">
      {activeTopic && (
        <StepGuide topic={activeTopic} onClose={() => setActiveTopic(null)} />
      )}

      <div>
        <div className="flex items-center gap-3 mb-1">
          <BookOpen className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Hilfe &amp; Anleitung
          </h1>
        </div>
        <p className="text-sm text-slate-500">
          Schritt-fuer-Schritt-Guides und interaktive Touren fuer alle Funktionen des Systems.
          {user && (
            <span className="ml-2">
              Angezeigt fuer Rolle:{" "}
              <Badge variant="secondary" className="text-xs">
                {ROLE_LABELS[role] ?? role}
              </Badge>
            </span>
          )}
        </p>
      </div>

      <div className="bg-gradient-to-r from-primary/5 to-blue-50 border border-primary/20 rounded-xl p-5 flex items-center gap-4">
        <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center shrink-0">
          <MousePointerClick className="w-6 h-6 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-slate-900 text-sm">Interaktive Rundtour starten</p>
          <p className="text-xs text-slate-500 mt-0.5">
            Lassen Sie sich durch die wichtigsten Bereiche fuehren - direkt in der Anwendung mit
            Erklaerungen an Ort und Stelle.
          </p>
        </div>
        <Button onClick={launchGlobalTour} className="gap-2 shrink-0">
          <Play className="w-4 h-4" /> Tour starten
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {visible.map((topic) => {
          const Icon = topic.icon;
          return (
            <Card
              key={topic.key}
              className="cursor-pointer hover:shadow-md transition-all border-slate-200 hover:border-primary/30 group"
              onClick={() => setActiveTopic(topic)}
            >
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div
                    className={`w-10 h-10 rounded-lg ${topic.bg} flex items-center justify-center shrink-0`}
                  >
                    <Icon className={`w-5 h-5 ${topic.color}`} />
                  </div>
                  <Badge variant="outline" className="text-xs font-normal shrink-0">
                    {topic.steps.length} Schritte
                  </Badge>
                </div>
                <CardTitle className="text-sm font-semibold text-slate-900 mt-2 group-hover:text-primary transition-colors">
                  {topic.label}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <p className="text-xs text-slate-500 leading-relaxed mb-3">{topic.description}</p>
                <div className="flex items-center justify-between">
                  <button
                    className="flex items-center gap-1 text-xs text-primary font-medium hover:underline"
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveTopic(topic);
                    }}
                  >
                    Anleitung lesen <ChevronRight className="w-3 h-3" />
                  </button>
                  {(topic.tourPath || topic.hasTour) && (
                    <button
                      className="flex items-center gap-1 text-xs text-slate-400 hover:text-primary font-medium transition-colors"
                      onClick={(e) => handleTour(e, topic)}
                    >
                      <Play className="w-3 h-3" /> Tour
                    </button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="border-t border-slate-100 pt-4 flex items-center justify-center gap-2">
        <HelpCircle className="w-4 h-4 text-slate-300" />
        <p className="text-xs text-slate-400">
          Haben Sie eine Frage, die hier nicht beantwortet wird? Wenden Sie sich an Ihren
          COMET-Administrator.
        </p>
      </div>
    </div>
  );
}
