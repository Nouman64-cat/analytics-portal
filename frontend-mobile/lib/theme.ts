import { useColorScheme } from "react-native";

const light = {
  bg: "#f8fafc",
  surface: "#ffffff",
  surfaceAlt: "#f1f5f9",
  border: "#e2e8f0",
  text: "#0f172a",
  textMuted: "#64748b",
  primary: "#6366f1",
  primaryText: "#ffffff",
  danger: "#ef4444",
  success: "#10b981",
};

const dark = {
  bg: "#0b1120",
  surface: "#131c31",
  surfaceAlt: "#1b2740",
  border: "#263652",
  text: "#f1f5f9",
  textMuted: "#94a3b8",
  primary: "#818cf8",
  primaryText: "#0b1120",
  danger: "#f87171",
  success: "#34d399",
};

export type Theme = typeof light;

export function useTheme(): Theme {
  const scheme = useColorScheme();
  return scheme === "dark" ? dark : light;
}
