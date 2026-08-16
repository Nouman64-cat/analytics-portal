import React from "react";
import { View, Text, ScrollView, RefreshControl } from "react-native";
import { Header } from "../../components/Header";
import { Card, LoadingView, ErrorBanner } from "../../components/ui";
import { BarList } from "../../components/BarList";
import { useTheme } from "../../lib/theme";
import { dashboardService } from "../../lib/api";
import { useApi } from "../../lib/useApi";

export default function StatsScreen() {
  const t = useTheme();
  const { data, loading, refreshing, error, refresh } = useApi(() => dashboardService.getStats());

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Header title="Stats" />
      {loading && !data ? (
        <LoadingView />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, gap: 12 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={t.primary} />}
        >
          {error && <ErrorBanner message={error} onRetry={refresh} />}
          {data && (
            <>
              <Card style={{ gap: 10 }}>
                <Text style={{ color: t.text, fontWeight: "700", fontSize: 15 }}>Interviews by Status</Text>
                <BarList data={data.interviews_by_status} />
              </Card>
              <Card style={{ gap: 10 }}>
                <Text style={{ color: t.text, fontWeight: "700", fontSize: 15 }}>Interviews by Company</Text>
                <BarList data={data.interviews_by_company} />
              </Card>
              <Card style={{ gap: 10 }}>
                <Text style={{ color: t.text, fontWeight: "700", fontSize: 15 }}>Interviews by Candidate</Text>
                <BarList data={data.interviews_by_candidate} />
              </Card>
              <Card style={{ gap: 10 }}>
                <Text style={{ color: t.text, fontWeight: "700", fontSize: 15 }}>Leads — Weekly Frequency</Text>
                <BarList data={data.leads_frequency_weekly} limit={6} />
              </Card>
              <Card style={{ gap: 10 }}>
                <Text style={{ color: t.text, fontWeight: "700", fontSize: 15 }}>Leads — Monthly Frequency</Text>
                <BarList data={data.leads_frequency_monthly} limit={6} />
              </Card>
              {data.candidate_metrics && Object.keys(data.candidate_metrics).length > 0 && (
                <Card style={{ gap: 10 }}>
                  <Text style={{ color: t.text, fontWeight: "700", fontSize: 15 }}>Candidate Conversion Rates</Text>
                  {Object.entries(data.candidate_metrics).map(([name, m]) => (
                    <View key={name} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 6 }}>
                      <Text style={{ color: t.text, fontSize: 13 }}>{name}</Text>
                      <Text style={{ color: t.textMuted, fontSize: 13 }}>
                        {m.converted}/{m.total_resolved} ({(m.rate * 100).toFixed(0)}%)
                      </Text>
                    </View>
                  ))}
                </Card>
              )}
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}
