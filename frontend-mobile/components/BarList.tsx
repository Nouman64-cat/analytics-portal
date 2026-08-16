import React from "react";
import { View, Text } from "react-native";
import { useTheme } from "../lib/theme";
import { CHART_COLORS } from "../lib/constants";

export function BarList({ data, limit = 8 }: { data: Record<string, number>; limit?: number }) {
  const t = useTheme();
  const entries = Object.entries(data)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
  const max = Math.max(1, ...entries.map(([, v]) => v));

  if (entries.length === 0) {
    return <Text style={{ color: t.textMuted }}>No data available.</Text>;
  }

  return (
    <View style={{ gap: 10 }}>
      {entries.map(([label, value], i) => (
        <View key={label}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
            <Text style={{ color: t.text, fontSize: 13, fontWeight: "600", flex: 1 }} numberOfLines={1}>
              {label}
            </Text>
            <Text style={{ color: t.textMuted, fontSize: 13 }}>{value}</Text>
          </View>
          <View style={{ height: 8, borderRadius: 4, backgroundColor: t.surfaceAlt, overflow: "hidden" }}>
            <View
              style={{
                height: 8,
                width: `${Math.max(4, (value / max) * 100)}%`,
                borderRadius: 4,
                backgroundColor: CHART_COLORS[i % CHART_COLORS.length],
              }}
            />
          </View>
        </View>
      ))}
    </View>
  );
}
