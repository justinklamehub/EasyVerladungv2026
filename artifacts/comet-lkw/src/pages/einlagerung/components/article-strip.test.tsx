import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ArticleStrip, articleTextColor } from "./article-strip";

test("Artikelbalken zeigen Artikelnummer und Farbe der zugeordneten Gruppe", () => {
  for (const color of ["#8ed047", "#00b8e4", "#b4c7e7", "#111111"]) {
    const html = renderToStaticMarkup(createElement(ArticleStrip, {
      number: "1714800", name: "Artikel", group: "Testgruppe", color, priority: 1,
    }));
    assert.ok(html.includes(`background-color:${color}`));
    assert.ok(html.includes("1714800"));
    assert.ok(html.includes("Testgruppe"));
    assert.ok(html.includes("rounded-full"));
  }
  assert.equal(articleTextColor("#111111"), "#ffffff");
  assert.equal(articleTextColor("#ffffff"), "#0f172a");
});

test("Kompakte Matrixbalken behalten auch lange Artikelnummern vollständig", () => {
  const html = renderToStaticMarkup(createElement(ArticleStrip, {
    number: "603231033", name: "Artikel", group: "Gruppe", color: "#8ed047", priority: 1, compact: true,
  }));
  assert.ok(html.includes("603231033"));
  assert.ok(html.includes("font-size:7.5px"));
  assert.ok(!html.includes("overflow-hidden"));
  assert.ok(html.includes("title=\"603231033"));
});

test("Matrixzoom skaliert auch Artikelnummern und Zeilenhöhe, ohne Gruppenfarbe zu ändern", () => {
  for (const [scale, font, line] of [[0.6, 5.4, 9.6], [1.6, 14.4, 25.6]]) {
    const html = renderToStaticMarkup(createElement(ArticleStrip, {
      number: "1714800", name: "Artikel", group: "Gruppe", color: "#8ed047", priority: 1, compact: true, scale,
    }));
    assert.ok(html.includes(`font-size:${font}px`));
    assert.ok(html.includes(`line-height:${line}px`));
    assert.ok(html.includes("background-color:#8ed047"));
    assert.ok(html.includes("1714800"));
  }
});
