import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";

const API = import.meta.env.BASE_URL.replace(/\/$/, "") + "/api";

export default function ImpressumPage() {
  const { data } = useQuery({
    queryKey: ["settings-public"],
    queryFn: async () => {
      const res = await fetch(`${API}/settings/public`);
      if (!res.ok) return {};
      return res.json();
    },
  });

  const customText: string | undefined = data?.impressum_text;

  return (
    <div className="min-h-screen bg-slate-50 p-4 flex justify-center">
      <div className="w-full max-w-2xl py-8">
        <Link href="/login" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 transition-colors mb-4">
          <ArrowLeft className="w-4 h-4" /> Zurück zur Anmeldung
        </Link>
        <Card className="shadow-lg border-slate-200">
          <CardHeader className="border-b border-slate-100">
            <CardTitle className="text-2xl font-bold tracking-tight text-slate-900">Impressum</CardTitle>
          </CardHeader>
          <CardContent className="pt-6 text-sm text-slate-700 leading-relaxed">
            {customText ? (
              <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: customText }} />
            ) : (
              <div className="space-y-6">
                <section>
                  <h2 className="font-semibold text-slate-900 mb-1">Angaben gemäß § 5 TMG</h2>
                  <p>
                    [Firmenname]<br />
                    [Straße und Hausnummer]<br />
                    [PLZ] [Ort]
                  </p>
                </section>
                <section>
                  <h2 className="font-semibold text-slate-900 mb-1">Vertreten durch</h2>
                  <p>[Name der Geschäftsführung / vertretungsberechtigten Person(en)]</p>
                </section>
                <section>
                  <h2 className="font-semibold text-slate-900 mb-1">Kontakt</h2>
                  <p>
                    Telefon: [Telefonnummer]<br />
                    E-Mail: [E-Mail-Adresse]
                  </p>
                </section>
                <section>
                  <h2 className="font-semibold text-slate-900 mb-1">Registereintrag</h2>
                  <p>
                    Eintragung im Handelsregister<br />
                    Registergericht: [Registergericht]<br />
                    Registernummer: [Registernummer]
                  </p>
                </section>
                <section>
                  <h2 className="font-semibold text-slate-900 mb-1">Umsatzsteuer-ID</h2>
                  <p>
                    Umsatzsteuer-Identifikationsnummer gemäß §27a Umsatzsteuergesetz:<br />
                    [USt-IdNr.]
                  </p>
                </section>
                <section>
                  <h2 className="font-semibold text-slate-900 mb-1">Verantwortlich für den Inhalt nach § 55 Abs. 2 RStV</h2>
                  <p>
                    [Name]<br />
                    [Anschrift wie oben]
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
