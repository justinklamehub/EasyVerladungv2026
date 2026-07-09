import { useAuth } from "@/contexts/auth-context";
import { RelationenTab } from "@/pages/speditionen/components/relationen-tab";
import { Route } from "lucide-react";

export default function RelationenPage() {
  const { user } = useAuth();

  if (!user || user.role !== "speditions_admin" || !user.speditionId) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-2 py-20">
        <Route className="w-8 h-8 opacity-30" />
        <p className="text-sm">Kein Zugriff.</p>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto py-8 px-4 space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-800 flex items-center gap-2">
          <Route className="w-5 h-5 text-primary" />
          Relationen
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Hier können Sie typische Routen für Ihre Spedition hinterlegen. Diese erscheinen als Vorschläge im Verladungsformular.
        </p>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg p-4">
        <RelationenTab speditionId={user.speditionId} />
      </div>
    </div>
  );
}
