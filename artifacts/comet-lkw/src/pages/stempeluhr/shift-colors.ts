import type { CSSProperties } from "react";

export const DEFAULT_SHIFT_COLOR = "#0284c7";
export const SHIFT_COLORS = [
  { value: "#0284c7", label: "Blau" }, { value: "#16a34a", label: "Grün" },
  { value: "#d97706", label: "Orange" }, { value: "#dc2626", label: "Rot" },
  { value: "#7c3aed", label: "Violett" }, { value: "#0891b2", label: "Türkis" },
  { value: "#db2777", label: "Pink" }, { value: "#475569", label: "Grau" },
];
export const shiftColor = (color?: string) => color && /^#[0-9a-fA-F]{6}$/.test(color) ? color : DEFAULT_SHIFT_COLOR;
// Pale fill keeps the name readable even for very dark or very bright custom colors.
export const shiftStyle = (color?: string): CSSProperties => {
  const c = shiftColor(color);
  return { backgroundColor: `${c}20`, borderColor: c, color: "#0f172a" };
};
