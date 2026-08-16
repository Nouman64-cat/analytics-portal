import React from "react";
import { View, Text, ScrollView, RefreshControl } from "react-native";
import { Header } from "../../../components/Header";
import { Card, LoadingView, ErrorBanner, EmptyState } from "../../../components/ui";
import { useTheme, Theme } from "../../../lib/theme";
import { dashboardService } from "../../../lib/api";
import { useApi } from "../../../lib/useApi";

function sumFor(periods: Record<string, Record<string, number>>, candidate: string): number {
  const bucket = periods[candidate];
  if (!bucket) return 0;
  return Object.values(bucket).reduce((a, b) => a + b, 0);
}

export default function PerformanceScreen() {
  const t = useTheme();
  const { data, loading, refreshing, error, refresh } = useApi(() => dashboardService.getLeadOutcomesByCandidate());

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Header title="Performance" />
      {loading && !data ? (
        <LoadingView />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, gap: 12 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={t.primary} />}
        >
          {error && <ErrorBanner message={error} onRetry={refresh} />}
          {data && data.candidates.length === 0 && <EmptyState icon="pie-chart-outline" title="No performance data yet" />}
          {data?.candidates.map((candidate) => {
            const converted = sumFor(data.converted.monthly, candidate);
            const dropped = sumFor(data.dropped.monthly, candidate);
            const rejected = sumFor(data.rejected.monthly, candidate);
            const total = converted + dropped + rejected;
            const rate = total > 0 ? ((converted / total) * 100).toFixed(0) : "0";
            return (
              <Card key={candidate} style={{ gap: 8 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={{ color: t.text, fontWeight: "700", fontSize: 15 }}>{candidate}</Text>
                  <Text style={{ color: t.primary, fontWeight: "700" }}>{rate}% converted</Text>
                </View>
                <View style={{ flexDirection: "row", gap: 16 }}>
                  <Metric label="Converted" value={converted} color="#8b5cf6" t={t} />
                  <Metric label="Dropped" value={dropped} color="#f59e0b" t={t} />
                  <Metric label="Rejected" value={rejected} color="#ef4444" t={t} />
                </View>
              </Card>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

function Metric({ label, value, color, t }: { label: string; value: number; color: string; t: Theme }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ color, fontWeight: "700", fontSize: 18 }}>{value}</Text>
      <Text style={{ color: t.textMuted, fontSize: 12 }}>{label}</Text>
    </View>
  );
}
