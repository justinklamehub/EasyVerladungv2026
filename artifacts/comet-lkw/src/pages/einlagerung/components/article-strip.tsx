import * as React from "react";

export function articleTextColor(background: string) {
  const channels = [1, 3, 5].map((offset) => parseInt(background.slice(offset, offset + 2), 16) / 255);
  const [r, g, b] = channels.map((c) => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.179 ? "#0f172a" : "#ffffff";
}

export function ArticleStrip({ number, name, group, color, priority, compact = false }: {
  number: string; name: string; group: string; color: string; priority: number; compact?: boolean;
}) {
  return (
    <span
      className={compact ? "block w-full rounded-full px-0.5 text-[9px] leading-4 font-bold text-center tracking-tight break-all" : "block w-full rounded-full px-2 py-0.5 text-[11px] leading-4 font-bold break-all"}
      style={{ backgroundColor: color, color: articleTextColor(color),
        ...(compact ? { fontSize: `${Math.max(7, Math.min(9, 67.5 / Math.max(1, number.length)))}px` } : {}) }}
      title={[number, name, group || "Ohne Gruppe", `Priorität ${priority}`].filter(Boolean).join(" · ")}
      aria-label={`Artikel ${number}, ${group || "ohne Gruppe"}, Priorität ${priority}`}
      data-testid={`article-strip-${number}`}
    >
      {number}
    </span>
  );
}
