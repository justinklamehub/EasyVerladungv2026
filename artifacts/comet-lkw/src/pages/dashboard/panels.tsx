import { ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const AX = { fontSize: 11, fill: "hsl(var(--muted-foreground))" };
const TT = { borderRadius: 8, border: "1px solid hsl(var(--border))", background: "hsl(var(--popover))", color: "hsl(var(--popover-foreground))", fontSize: 12 };
export const C = { eta: "hsl(215 60% 58%)", ata: "hsl(165 55% 40%)", ok: "hsl(160 55% 40%)", late: "hsl(8 70% 55%)", unk: "hsl(215 12% 62%)", bar: "hsl(222 35% 45%)" };
export const STATUS_COLORS: Record<string, string> = {
  Angemeldet: "hsl(215 16% 52%)", Erwartet: "hsl(220 65% 55%)", Angekommen: "hsl(160 55% 42%)", "in Verladung": "hsl(25 85% 55%)",
  Verladen: "hsl(45 75% 48%)", Abgefertigt: "hsl(173 55% 38%)", Storniert: "hsl(0 70% 58%)",
};

export function Panel({ title, desc, testid, children, className = "" }: { title: string; desc?: ReactNode; testid: string; children: ReactNode; className?: string }) {
  return (
    <Card className={`shadow-none ${className}`} data-testid={testid}>
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-sm">{title}</CardTitle>
        {desc && <CardDescription className="text-xs">{desc}</CardDescription>}
      </CardHeader>
      <CardContent className="p-4 pt-2">{children}</CardContent>
    </Card>
  );
}
export const Empty = ({ text, testid }: { text: string; testid: string }) => (
  <div data-testid={testid} className="flex h-24 items-center justify-center rounded-md border border-dashed text-center text-xs text-muted-foreground px-3">{text}</div>
);

export function Kpi({ label, value, tone, testid }: { label: string; value: number; tone?: string; testid: string }) {
  return (
    <Card className="shadow-none" data-testid={testid}>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`mt-1 text-2xl font-semibold tabular-nums ${tone ?? ""}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

export function FlowChart({ data, hourly }: { data: { label: string; eta: number; ata: number }[]; hourly: boolean }) {
  const total = data.reduce((s, d) => s + d.eta + d.ata, 0);
  if (!total) return <Empty testid="empty-flow" text={hourly ? "Keine ETA- oder ATA-Ereignisse mit Uhrzeit im Zeitraum." : "Keine ETA- oder ATA-Ereignisse im Zeitraum."} />;
  return (
    <div className="h-64" role="img" aria-label="Gruppierte Säulen: erwartete (ETA) und tatsächliche (ATA) Ankünfte">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }} barGap={2}>
          <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeDasharray="3 3" />
          <XAxis dataKey="label" tick={AX} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={hourly ? 16 : 24}
            tickFormatter={(v: string) => (hourly ? v.slice(0, 2) : v.slice(5).split("-").reverse().join("."))} />
          <YAxis tick={AX} axisLine={false} tickLine={false} allowDecimals={false} />
          <Tooltip contentStyle={TT} cursor={{ fill: "hsl(var(--muted) / 0.5)" }} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="eta" name="ETA (erwartet)" fill={C.eta} radius={[3, 3, 0, 0]} />
          <Bar dataKey="ata" name="ATA (angekommen)" fill={C.ata} radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function Punctuality({ p }: { p: { onTime: number; delayed: number; unknown: number; onTimePercent: number | null } }) {
  const parts = [
    { name: "Pünktlich oder früher", value: p.onTime, color: C.ok },
    { name: "Verspätet", value: p.delayed, color: C.late },
    { name: "Unbekannt (Zeit fehlt)", value: p.unknown, color: C.unk },
  ];
  const total = p.onTime + p.delayed + p.unknown;
  const comparable = p.onTime + p.delayed;
  const donutParts = (comparable ? parts.slice(0, 2) : parts.slice(2)).filter((x) => x.value > 0);
  if (!total) return <Empty testid="empty-punctuality" text="Keine Ankünfte (ohne Stornierte) im Zeitraum." />;
  return (
    <div className="flex flex-col items-center gap-3" data-testid="punctuality-body">
      <div className="relative h-40 w-40 shrink-0" role="img" aria-label="Pünktlichkeit der Ankünfte">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={donutParts} dataKey="value" nameKey="name" innerRadius={48} outerRadius={70} paddingAngle={2} stroke="none">
              {donutParts.map((x) => <Cell key={x.name} fill={x.color} />)}
            </Pie>
            <Tooltip contentStyle={TT} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-semibold tabular-nums" data-testid="text-punctuality-percent">
            {p.onTimePercent === null ? "–" : `${p.onTimePercent.toFixed(1).replace(".", ",")} %`}
          </span>
          <span className="text-[10px] text-muted-foreground">pünktlich</span>
        </div>
      </div>
      <ul className="w-full space-y-1.5 text-sm">
        {parts.map((x) => (
          <li key={x.name} className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: x.color }} />{x.name}</span>
            <span className="font-medium tabular-nums">{x.value}</span>
          </li>
        ))}
        <li className="pt-1 text-xs text-muted-foreground">Anteil ohne unbekannte Fälle; Vergleich der erfassten ETA- und ATA-Zeiten.</li>
      </ul>
    </div>
  );
}

export function HBar({ data, color, testid, unit = "LKW" }: { data: { name: string; count: number }[]; color?: (n: string) => string; testid: string; unit?: string }) {
  if (!data.length) return <Empty testid={`empty-${testid}`} text="Keine Daten für diesen Zeitraum." />;
  const h = Math.max(120, data.length * 30 + 20);
  return (
    <div style={{ height: h }} role="img" aria-label={`Balkendiagramm ${testid}`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid horizontal={false} stroke="hsl(var(--border))" strokeDasharray="3 3" />
          <XAxis type="number" tick={AX} axisLine={false} tickLine={false} allowDecimals={false} />
          <YAxis type="category" dataKey="name" width={110} tick={AX} axisLine={false} tickLine={false}
            tickFormatter={(v: string) => (v.length > 16 ? `${v.slice(0, 15)}…` : v)} />
          <Tooltip contentStyle={TT} cursor={{ fill: "hsl(var(--muted) / 0.5)" }} formatter={(v: number) => [v, unit]} />
          <Bar dataKey="count" name={unit} radius={[0, 3, 3, 0]} barSize={16}>
            {data.map((d) => <Cell key={d.name} fill={color ? color(d.name) : C.bar} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
