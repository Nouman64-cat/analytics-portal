import { useColorScheme } from "react-native";

const light = {
  bg: "#f6f7fb",
  surface: "#ffffff",
  surfaceAlt: "#f1f3f9",
  border: "#e6e9f2",
  text: "#0f172a",
  textMuted: "#64748b",
  primary: "#6366f1",
  primaryAlt: "#818cf8",
  primaryText: "#ffffff",
  danger: "#ef4444",
  success: "#10b981",
  shadow: "#1e293b",
  gradientFrom: "#6366f1",
  gradientTo: "#8b5cf6",
};

const dark = {
  bg: "#090d18",
  surface: "#141b2d",
  surfaceAlt: "#1c2540",
  border: "#263252",
  text: "#f1f5f9",
  textMuted: "#94a3b8",
  primary: "#818cf8",
  primaryAlt: "#a5b4fc",
  primaryText: "#0b1120",
  danger: "#f87171",
  success: "#34d399",
  shadow: "#000000",
  gradientFrom: "#6366f1",
  gradientTo: "#a855f7",
};

export type Theme = typeof light;

export function useTheme(): Theme {
  const scheme = useColorScheme();
  return scheme === "dark" ? dark : light;
}
