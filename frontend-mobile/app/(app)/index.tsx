import React from "react";
import { View, Text, ScrollView, RefreshControl } from "react-native";
import { router } from "expo-router";
import { Header } from "../../components/Header";
import { Card, StatTile, LoadingView, ErrorBanner, ListRow } from "../../components/ui";
import { useTheme } from "../../lib/theme";
import { dashboardService } from "../../lib/api";
import { useApi } from "../../lib/useApi";
import { interviewStatusBadge, formatDate } from "../../lib/statusMeta";
import { useDepartmentContext } from "../../lib/DepartmentContext";

export default function DashboardScreen() {
  const t = useTheme();
  const { departmentId } = useDepartmentContext();
  const { data, loading, refreshing, error, refresh } = useApi(() => dashboardService.getStats(departmentId), [departmentId]);

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Header title="Dashboard" />
      {loading && !data ? (
        <LoadingView label="Loading dashboard…" />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, gap: 12 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={t.primary} />}
        >
          {error && <ErrorBanner message={error} onRetry={refresh} />}
          {data && (
            <>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
                <StatTile label="Total Interviews" value={data.total_interviews} color={t.primary} icon="checkmark-done-circle" />
                <StatTile label="Legit Interviews" value={data.legit_interviews} color="#06b6d4" icon="shield-checkmark" />
                <StatTile label="Companies" value={data.total_companies} color="#f97316" icon="business" />
                <StatTile label="Candidates" value={data.total_candidates} color="#22c55e" icon="people" />
                <StatTile label="Jobs Closed" value={data.total_jobs_closed} color="#10b981" icon="trophy" />
                {data.conversion_rate_percent != null && (
                  <StatTile label="Conversion Rate" value={`${data.conversion_rate_percent.toFixed(1)}%`} color="#8b5cf6" icon="trending-up" />
                )}
              </View>

              {data.leads_by_status && Object.keys(data.leads_by_status).length > 0 && (
                <Card>
                  <Text style={{ color: t.text, fontWeight: "700", fontSize: 15, marginBottom: 4 }}>
                    Leads by Status
                  </Text>
                  {Object.entries(data.leads_by_status).map(([label, count]) => (
                    <ListRow key={label} title={label} right={<Text style={{ color: t.text, fontWeight: "700" }}>{count}</Text>} />
                  ))}
                </Card>
              )}

              <Card>
                <Text style={{ color: t.text, fontWeight: "700", fontSize: 15, marginBottom: 4 }}>
                  Recent Interviews
                </Text>
                {data.recent_interviews.length === 0 && (
                  <Text style={{ color: t.textMuted, paddingVertical: 8 }}>No recent interviews.</Text>
                )}
                {data.recent_interviews.slice(0, 10).map((ri) => (
                  <ListRow
                    key={ri.id}
                    title={`${ri.company ?? "Unknown"} — ${ri.role}`}
                    subtitle={`${ri.candidate ?? "Unassigned"} • ${interviewStatusBadge(ri.computed_status).label} • ${formatDate(ri.date)}`}
                    onPress={() => router.push(`/interviews/${ri.id}`)}
                  />
                ))}
              </Card>
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}
