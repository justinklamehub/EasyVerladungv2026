import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileClock } from "lucide-react";

const API = import.meta.env.BASE_URL.replace(/\/$/, "") + "/api";

interface ChangelogEntry {
  id: number;
  title: string;
  bodyHtml: string;
  version: string | null;
  publishedAt: string;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export default function ChangelogPage() {
  const { data: entries, isLoading } = useQuery<ChangelogEntry[]>({
    queryKey: ["changelog-public"],
    queryFn: async () => {
      const res = await fetch(`${API}/changelog/public`);
      if (!res.ok) return [];
      return res.json();
    },
  });

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div>
        <div className="flex items-center gap-3 mb-1">
          <FileClock className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Änderungsprotokoll</h1>
        </div>
        <p className="text-sm text-slate-500">Übersicht der letzten Systemänderungen und Neuerungen.</p>
      </div>

      <div>
        {isLoading ? (
          <p className="text-sm text-slate-400">Lädt…</p>
        ) : !entries || entries.length === 0 ? (
          <Card className="shadow-sm border-slate-200">
            <CardContent className="py-10 text-center text-sm text-slate-400">
              Es liegen noch keine Änderungen vor.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {entries.map(entry => (
              <Card key={entry.id} className="shadow-sm border-slate-200">
                <CardHeader className="border-b border-slate-100 pb-3">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <CardTitle className="text-lg font-semibold text-slate-900">{entry.title}</CardTitle>
                    <div className="flex items-center gap-2 shrink-0">
                      {entry.version && <Badge variant="outline" className="text-xs">v{entry.version}</Badge>}
                      <span className="text-xs text-slate-400">{formatDate(entry.publishedAt)}</span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-4 text-sm text-slate-700 leading-relaxed">
                  <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: entry.bodyHtml }} />
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
