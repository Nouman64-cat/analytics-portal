import { useState, useEffect } from "react";
import { getAccentColor, ACCENT_OPTIONS, type AccentId } from "@/lib/accent";

/**
 * Per-accent canvas palette used by the AbstractArt component.
 * Each palette defines: bg gradient stops, orb hues, and mesh line hues.
 */
export interface AccentPalette {
  bg: [string, string, string];        // 3 gradient stops for canvas bg
  orbHueBase: number;                  // base hue for floating orbs (degrees)
  meshHue: number;                     // base hue for wave/mesh lines
  faceColors: string[];                // hex colors for polygon mesh faces
  starColor: string;                   // constellation node color
  dotHueBase: number;                  // base hue for dot grid
}

const PALETTES: Record<AccentId, AccentPalette> = {
  indigo: {
    bg: ["#0f0c29", "#302b63", "#24243e"],
    orbHueBase: 240,
    meshHue: 238,
    faceColors: ["#4f46e5","#6366f1","#7c3aed","#4338ca","#818cf8","#5b21b6","#4f46e5","#7c3aed","#6366f1","#4338ca","#818cf8","#4f46e5","#7c3aed"],
    starColor: "#c7d2fe",
    dotHueBase: 248,
  },
  blue: {
    bg: ["#071629", "#0c2548", "#0a1e3d"],
    orbHueBase: 214,
    meshHue: 210,
    faceColors: ["#2563eb","#3b82f6","#1d4ed8","#60a5fa","#1e40af","#93c5fd","#2563eb","#3b82f6","#1d4ed8","#60a5fa","#1e40af","#2563eb","#3b82f6"],
    starColor: "#bfdbfe",
    dotHueBase: 217,
  },
  violet: {
    bg: ["#180f2e", "#2d1b56", "#1e1040"],
    orbHueBase: 267,
    meshHue: 263,
    faceColors: ["#7c3aed","#8b5cf6","#6d28d9","#a78bfa","#5b21b6","#c4b5fd","#7c3aed","#8b5cf6","#6d28d9","#a78bfa","#5b21b6","#7c3aed","#8b5cf6"],
    starColor: "#e9d5ff",
    dotHueBase: 270,
  },
  rose: {
    bg: ["#1f0a12", "#3d1120", "#2e0d18"],
    orbHueBase: 345,
    meshHue: 340,
    faceColors: ["#e11d48","#f43f5e","#be123c","#fb7185","#9f1239","#fda4af","#e11d48","#f43f5e","#be123c","#fb7185","#9f1239","#e11d48","#f43f5e"],
    starColor: "#fecdd3",
    dotHueBase: 348,
  },
  emerald: {
    bg: ["#061a12", "#0d3320", "#061e16"],
    orbHueBase: 160,
    meshHue: 155,
    faceColors: ["#059669","#10b981","#047857","#34d399","#065f46","#6ee7b7","#059669","#10b981","#047857","#34d399","#065f46","#059669","#10b981"],
    starColor: "#a7f3d0",
    dotHueBase: 162,
  },
  teal: {
    bg: ["#061a1a", "#0d3333", "#061e1e"],
    orbHueBase: 175,
    meshHue: 172,
    faceColors: ["#0d9488","#14b8a6","#0f766e","#2dd4bf","#115e59","#99f6e4","#0d9488","#14b8a6","#0f766e","#2dd4bf","#115e59","#0d9488","#14b8a6"],
    starColor: "#ccfbf1",
    dotHueBase: 177,
  },
  cyan: {
    bg: ["#061a1f", "#0c3040", "#071e28"],
    orbHueBase: 192,
    meshHue: 189,
    faceColors: ["#0891b2","#06b6d4","#0e7490","#22d3ee","#164e63","#a5f3fc","#0891b2","#06b6d4","#0e7490","#22d3ee","#164e63","#0891b2","#06b6d4"],
    starColor: "#cffafe",
    dotHueBase: 195,
  },
  amber: {
    bg: ["#1a1200", "#362400", "#281b00"],
    orbHueBase: 43,
    meshHue: 38,
    faceColors: ["#d97706","#f59e0b","#b45309","#fbbf24","#92400e","#fde68a","#d97706","#f59e0b","#b45309","#fbbf24","#92400e","#d97706","#f59e0b"],
    starColor: "#fef3c7",
    dotHueBase: 45,
  },
  orange: {
    bg: ["#1a0e00", "#341e00", "#281600"],
    orbHueBase: 25,
    meshHue: 22,
    faceColors: ["#ea580c","#f97316","#c2410c","#fb923c","#9a3412","#fdba74","#ea580c","#f97316","#c2410c","#fb923c","#9a3412","#ea580c","#f97316"],
    starColor: "#fed7aa",
    dotHueBase: 27,
  },
};

/** Returns the current accent palette and re-renders when the accent changes. */
export function useAccentPalette(): AccentPalette {
  const [palette, setPalette] = useState<AccentPalette>(() => {
    if (typeof window === "undefined") return PALETTES.indigo;
    return PALETTES[getAccentColor()] ?? PALETTES.indigo;
  });

  useEffect(() => {
    const refresh = () => {
      const id = getAccentColor();
      setPalette(PALETTES[id] ?? PALETTES.indigo);
    };

    // Listen to the custom event fired by saveAccentColor()
    window.addEventListener("accent-changed", refresh);

    // Also observe data-accent attribute changes directly on <html>
    const observer = new MutationObserver(refresh);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-accent"],
    });

    // Sync on mount in case localStorage already has a non-default value
    refresh();

    return () => {
      window.removeEventListener("accent-changed", refresh);
      observer.disconnect();
    };
  }, []);

  return palette;
}
