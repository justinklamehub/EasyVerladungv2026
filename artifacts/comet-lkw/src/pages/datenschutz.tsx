import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";

const API = import.meta.env.BASE_URL.replace(/\/$/, "") + "/api";

export default function DatenschutzPage() {
  const { data } = useQuery({
    queryKey: ["settings-public"],
    queryFn: async () => {
      const res = await fetch(`${API}/settings/public`);
      if (!res.ok) return {};
      return res.json();
    },
  });

  const customText: string | undefined = data?.datenschutz_text;

  return (
    <div className="min-h-screen bg-slate-50 p-4 flex justify-center">
      <div className="w-full max-w-2xl py-8">
        <Link href="/login" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 transition-colors mb-4">
          <ArrowLeft className="w-4 h-4" /> Zurück zur Anmeldung
        </Link>
        <Card className="shadow-lg border-slate-200">
          <CardHeader className="border-b border-slate-100">
            <CardTitle className="text-2xl font-bold tracking-tight text-slate-900">Datenschutzerklärung</CardTitle>
          </CardHeader>
          <CardContent className="pt-6 text-sm text-slate-700 leading-relaxed">
            {customText ? (
              <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: customText }} />
            ) : (
              <div className="space-y-6">
                <section>
                  <h2 className="font-semibold text-slate-900 mb-1">1. Verantwortlicher</h2>
                  <p>
                    Verantwortlich für die Datenverarbeitung im Sinne der Datenschutz-Grundverordnung (DSGVO) ist:<br />
                    [Firmenname]<br />
                    [Straße und Hausnummer]<br />
                    [PLZ] [Ort]<br />
                    E-Mail: [E-Mail-Adresse]
                  </p>
                </section>
                <section>
                  <h2 className="font-semibold text-slate-900 mb-1">2. Zweck der Anwendung</h2>
                  <p>
                    Diese Anwendung dient der internen LKW-Verladungsverwaltung und ist ausschließlich für autorisierte
                    Mitarbeiter und Vertragspartner (z. B. Speditionen) zugänglich. Es handelt sich nicht um eine öffentlich
                    zugängliche Website.
                  </p>
                </section>
                <section>
                  <h2 className="font-semibold text-slate-900 mb-1">3. Erhobene Daten</h2>
                  <p>
                    Im Rahmen der Nutzung werden Zugangsdaten (Benutzername, E-Mail-Adresse), Nutzungs- und Protokolldaten
                    (z. B. Anmeldezeitpunkte, IP-Adresse) sowie im System erfasste Geschäftsdaten (z. B. Sendungen,
                    Verladungen, Palettenbuchungen) verarbeitet.
                  </p>
                </section>
                <section>
                  <h2 className="font-semibold text-slate-900 mb-1">4. Rechtsgrundlage</h2>
                  <p>
                    Die Verarbeitung erfolgt auf Grundlage von Art. 6 Abs. 1 lit. b DSGVO (Erfüllung eines Vertrags bzw.
                    Arbeitsverhältnisses) sowie Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse an einem sicheren und
                    funktionsfähigen Betrieb der Anwendung).
                  </p>
                </section>
                <section>
                  <h2 className="font-semibold text-slate-900 mb-1">5. Speicherdauer</h2>
                  <p>
                    Daten werden nur so lange gespeichert, wie es für die genannten Zwecke oder aufgrund gesetzlicher
                    Aufbewahrungspflichten erforderlich ist.
                  </p>
                </section>
                <section>
                  <h2 className="font-semibold text-slate-900 mb-1">6. Ihre Rechte</h2>
                  <p>
                    Sie haben das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung,
                    Datenübertragbarkeit sowie Widerspruch gegen die Verarbeitung Ihrer personenbezogenen Daten. Wenden Sie
                    sich hierzu an die oben genannte verantwortliche Stelle.
                  </p>
                </section>
                <p className="text-xs text-slate-400 pt-2 border-t border-slate-100">
                  Diese Seite befindet sich derzeit im Aufbau. Die endgültigen Angaben werden in Kürze ergänzt.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
