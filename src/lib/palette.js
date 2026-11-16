import { createContext, useContext } from "react";

// Chart colours (charts need real colour values, not CSS variables).
// Keep in sync with src/styles/tokens.css.
export const PALETTES = {
  dark: { text: "#E2E8F0", muted: "#7D8FB0", grid: "#1A2D4A", card: "#111D33",
    teal: "#00E5C3", orange: "#F97316", red: "#F05252", green: "#10B981", yellow: "#FBBF24" },
  light: { text: "#0F172A", muted: "#55667F", grid: "#E2EAF3", card: "#FFFFFF",
    teal: "#008A76", orange: "#EA580C", red: "#DC2626", green: "#15803D", yellow: "#B45309" },
};

export const ThemeContext = createContext(PALETTES.dark);
export const usePalette = () => useContext(ThemeContext);
