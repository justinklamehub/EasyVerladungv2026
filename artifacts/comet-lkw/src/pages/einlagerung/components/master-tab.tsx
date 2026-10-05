import type { EinlagerungState } from "@workspace/api-client-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EntityTable, ActiveBadge } from "./entity-table";
import type { FieldSpec } from "./record-dialog";
import { P, type Model } from "../lib";

const active: FieldSpec = { key: "active", label: "Aktiv", type: "bool" };
const sort: FieldSpec = { key: "sort", label: "Sortierung", type: "number" };

export function MasterTab({ state, model, has }: { state: EinlagerungState; model: Model; has: (k: string) => boolean }) {
  const can = has(P.master);
  const opt = (l: { id: number; d: Record<string, any> }[], f = "name") => l.map((r) => ({ value: String(r.id), label: String(r.d[f]) }));
  const t = (v: unknown) => String(v ?? "");
  return (
    <Tabs defaultValue="hall" className="space-y-4">
      <TabsList className="flex flex-wrap h-auto justify-start">
        {[["hall", "Hallen"], ["aisle", "Gänge"], ["shelf", "Regale"], ["article", "Artikel"], ["group", "Gruppen"], ["carrier", "Speditions-Zuordnung"]].map(([v, l]) => <TabsTrigger key={v} value={v} data-testid={`subtab-${v}`}>{l}</TabsTrigger>)}
      </TabsList>
      <TabsContent value="hall">
        <EntityTable kind="hall" noun="Halle" records={model.halls} canEdit={can} defaults={{ active: true, sort: 0 }} searchText={(r) => t(r.d.name)}
          fields={[{ key: "name", label: "Name", type: "text", required: true }, sort, active]}
          columns={[{ label: "Name", render: (r) => <span className="font-medium">{t(r.d.name)}</span> }, { label: "Sortierung", render: (r) => t(r.d.sort) }, { label: "Status", render: (r) => <ActiveBadge on={r.d.active} /> }]} />
      </TabsContent>
      <TabsContent value="aisle">
        <EntityTable kind="aisle" noun="Gang" records={model.aisles} canEdit={can} defaults={{ active: true, sort: 0 }} searchText={(r) => t(r.d.name) + t(model.hallById.get(Number(r.d.hallId))?.d.name)}
          fields={[{ key: "name", label: "Name", type: "text", required: true }, { key: "hallId", label: "Halle", type: "select", numeric: true, required: true, options: opt(model.halls) }, sort, active]}
          columns={[{ label: "Name", render: (r) => <span className="font-medium">{t(r.d.name)}</span> }, { label: "Halle", render: (r) => t(model.hallById.get(Number(r.d.hallId))?.d.name) }, { label: "Sortierung", render: (r) => t(r.d.sort) }, { label: "Status", render: (r) => <ActiveBadge on={r.d.active} /> }]} />
      </TabsContent>
      <TabsContent value="shelf">
        <EntityTable kind="shelf" noun="Regal" records={model.shelves} canEdit={can} defaults={{ active: true, sort: 0, position: 0 }} searchText={(r) => model.shelfLabel(r)}
          fields={[{ key: "name", label: "Name", type: "text", required: true }, { key: "aisleId", label: "Gang", type: "select", numeric: true, required: true, options: model.aisles.map((a) => ({ value: String(a.id), label: `${t(model.hallById.get(Number(a.d.hallId))?.d.name)} / ${t(a.d.name)}` })) }, { key: "position", label: "Position", type: "number" }, sort, active]}
          columns={[{ label: "Regal", render: (r) => <span className="font-medium">{t(r.d.name)}</span> }, { label: "Lage", render: (r) => model.shelfLabel(r) }, { label: "Position", render: (r) => t(r.d.position) }, { label: "Status", render: (r) => r.d.full ? <span className="text-red-700 font-medium">Voll</span> : <ActiveBadge on={r.d.active} /> }]} />
      </TabsContent>
      <TabsContent value="article">
        <EntityTable kind="article" noun="Artikel" records={model.articles} canEdit={can} defaults={{ active: true }} searchText={(r) => t(r.d.number) + t(r.d.ean) + t(r.d.name)}
          fields={[{ key: "number", label: "Artikelnummer", type: "text", required: true, hint: "Als Text, führende Nullen bleiben erhalten." }, { key: "ean", label: "EAN", type: "text" }, { key: "name", label: "Bezeichnung", type: "text" }, active]}
          columns={[{ label: "Artikelnummer", render: (r) => <span className="font-mono">{t(r.d.number)}</span> }, { label: "EAN", render: (r) => <span className="font-mono">{t(r.d.ean)}</span> }, { label: "Bezeichnung", render: (r) => t(r.d.name) }, { label: "Status", render: (r) => <ActiveBadge on={r.d.active} /> }]} />
      </TabsContent>
      <TabsContent value="group">
        <EntityTable kind="group" noun="Gruppe" records={model.groups} canEdit={can} defaults={{ active: true, color: "#64748b" }} searchText={(r) => t(r.d.name)}
          fields={[{ key: "name", label: "Name", type: "text", required: true }, { key: "color", label: "Farbe", type: "color" }, active]}
          columns={[{ label: "Name", render: (r) => <span className="font-medium">{t(r.d.name)}</span> }, { label: "Farbe", render: (r) => <span className="inline-flex items-center gap-2"><span className="w-3 h-3 rounded-full" style={{ background: t(r.d.color) }} />{t(r.d.color)}</span> }, { label: "Status", render: (r) => <ActiveBadge on={r.d.active} /> }]} />
      </TabsContent>
      <TabsContent value="carrier">
        <EntityTable kind="carrier" noun="Zuordnung" records={model.carriers} canEdit={can} defaults={{ active: true, color: "#0f172a", textColor: "#ffffff" }} searchText={(r) => t(r.d.name) + t(r.d.number) + model.spedName(r.d.speditionId)}
           fields={[{ key: "name", label: "Name aus Quelldaten", type: "text", required: true }, { key: "number", label: "Nummer", type: "text" }, { key: "speditionId", label: "COMET-Spedition (optional)", type: "select", numeric: true, nullable: true, options: state.speditionen.map((s) => ({ value: String(s.id), label: s.name })) }, { key: "color", label: "Farbe", type: "color" }, { key: "textColor", label: "Textfarbe", type: "color" }, active]}
          columns={[{ label: "Name", render: (r) => <span className="inline-block rounded px-2 py-0.5 text-xs font-medium" style={{ background: t(r.d.color), color: t(r.d.textColor) }}>{t(r.d.name)}</span> }, { label: "Nummer", render: (r) => t(r.d.number) }, { label: "COMET-Spedition", render: (r) => model.spedName(r.d.speditionId) || "-" }, { label: "Status", render: (r) => <ActiveBadge on={r.d.active} /> }]} />
      </TabsContent>
    </Tabs>
  );
}
