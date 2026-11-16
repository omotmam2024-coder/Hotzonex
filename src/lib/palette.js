import { createContext, useContext } from "react";

// Chart colours (charts need real colour values, not CSS variables).
// Keep in sync with src/styles/tokens.css.
export const PALETTES = {
  light: { text: "#1F2937", muted: "#6B7280", grid: "#EEF1F6", card: "#FFFFFF",
    brand: "#2E3A87", orange: "#F59E0B", red: "#EF4444", green: "#16A34A", cyan: "#06B6D4", grey: "#9CA3AF", yellow: "#B45309" },
  dark: { text: "#E2E8F0", muted: "#94A3B8", grid: "#1F2A44", card: "#111A2E",
    brand: "#8B9BFF", orange: "#FBBF24", red: "#F87171", green: "#4ADE80", cyan: "#22D3EE", grey: "#64748B", yellow: "#FBBF24" },
};
// Older chart code asked for "teal"; it now means the brand colour.
for (const p of Object.values(PALETTES)) p.teal = p.brand;

export const ThemeContext = createContext(PALETTES.light);
export const usePalette = () => useContext(ThemeContext);
