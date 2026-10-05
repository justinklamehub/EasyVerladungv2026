import { useLocation } from "wouter";
import { ChevronLeft } from "lucide-react";
import { ArticleLookup } from "@/pages/einlagerung/components/article-lookup";
import { useEinlagerungAccess } from "@/pages/einlagerung/lib";

export default function ScannerEinlagerungPage() {
  const [, setLocation] = useLocation();
  const { has } = useEinlagerungAccess();
  return (
    <div className="min-h-[100dvh] bg-slate-100 text-slate-900">
      <header className="sticky top-0 z-10 bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3">
        <button onClick={() => setLocation("/scanner")} className="flex items-center gap-1 text-sm text-slate-600 border border-slate-200 rounded-md px-2.5 py-1.5" data-testid="button-scanner-back">
          <ChevronLeft className="w-4 h-4" />Zurück
        </button>
        <div>
          <div className="text-[11px] uppercase tracking-[0.15em] text-slate-500">COMET LKW - Scanner</div>
          <div className="font-bold">Einlagerung</div>
        </div>
      </header>
      <div className="max-w-xl mx-auto px-4 pt-3">
        <button className="text-sm underline text-slate-600" onClick={() => setLocation("/scanner/einlagerung-auftraege")} data-testid="button-orders-scanner">Zur Aufträge Übersicht</button>
      </div>
      <main className="max-w-xl mx-auto p-4"><ArticleLookup has={has} large /></main>
    </div>
  );
}
