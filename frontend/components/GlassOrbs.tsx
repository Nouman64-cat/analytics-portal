"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { getAccentColor, type AccentId } from "@/lib/accent";

// Base HSL hue for each accent
const ACCENT_HUES: Record<AccentId, number> = {
  indigo:  239,
  blue:    217,
  violet:  258,
  rose:    347,
  emerald: 160,
  teal:    175,
  cyan:    187,
  amber:    38,
  orange:   24,
};

// Each orb gets a hue derived from the accent's base hue via a color-theory offset.
// Offsets: base, analogous ±35°, triadic ±120°, split-complementary ±150°/−60°
const ORBS: { pos: string; w: number; blur: number; hOff: number }[] = [
  { pos: "absolute -top-24 -left-24",          w: 420, blur: 55, hOff:    0 },
  { pos: "absolute -top-16 right-[10%]",       w: 340, blur: 50, hOff:  -35 },
  { pos: "absolute top-[35%] -left-16",        w: 300, blur: 45, hOff:   35 },
  { pos: "absolute top-[30%] right-[5%]",      w: 360, blur: 50, hOff:  120 },
  { pos: "absolute -bottom-16 left-[35%]",     w: 380, blur: 52, hOff: -120 },
  { pos: "absolute bottom-[10%] left-[10%]",   w: 260, blur: 45, hOff:  150 },
  { pos: "absolute bottom-[5%] right-[8%]",    w: 280, blur: 48, hOff:  -60 },
];

function orbColor(hue: number, dark: boolean): string {
  const h = ((hue % 360) + 360) % 360;
  return dark
    ? `hsla(${h}, 82%, 60%, 0.88)`
    : `hsla(${h}, 78%, 66%, 0.70)`;
}

export default function GlassOrbs() {
  const [accentId, setAccentId] = useState<AccentId>("indigo");
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  // Sync with stored accent on mount
  useEffect(() => {
    setAccentId(getAccentColor());
  }, []);

  // React to live accent changes from the settings page
  useEffect(() => {
    const handler = (e: Event) => {
      setAccentId((e as CustomEvent<{ id: AccentId }>).detail.id);
    };
    window.addEventListener("accent-changed", handler);
    return () => window.removeEventListener("accent-changed", handler);
  }, []);

  const baseHue = ACCENT_HUES[accentId] ?? 239;

  return (
    <div aria-hidden="true" className="glass-orbs pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {ORBS.map((orb, i) => (
        <div
          key={i}
          className={`${orb.pos} rounded-full`}
          style={{
            width: orb.w,
            height: orb.w,
            backgroundColor: orbColor(baseHue + orb.hOff, isDark),
            filter: `blur(${orb.blur}px)`,
            transition: "background-color 0.6s ease",
          }}
        />
      ))}
    </div>
  );
}
