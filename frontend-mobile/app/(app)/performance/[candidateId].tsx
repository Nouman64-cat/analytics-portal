import React, { useCallback, useMemo, useState } from "react";
import { View, Text, ScrollView, RefreshControl, TouchableOpacity } from "react-native";
import { router, useLocalSearchParams, useFocusEffect } from "expo-router";
import { Header } from "../../../components/Header";
import { Card, StatTile, LoadingView, ErrorBanner, EmptyState, ListRow, Badge } from "../../../components/ui";
import { useTheme } from "../../../lib/theme";
import { useAuth } from "../../../lib/AuthContext";
import { useDepartmentContext } from "../../../lib/DepartmentContext";
import { candidatesService, leadsService, interviewsService } from "../../../lib/api";
import type { Candidate, LeadListItem, Interview } from "../../../lib/types";
import {
  computeLeadsMetrics,
  computeInterviewsMetrics,
  pct,
  METRIC_STYLE,
  DROPPED_COLOR,
  PERFORMANCE_ROLES,
} from "../../../lib/performanceMetrics";
import { leadOutcomeBadge, interviewStatusBadge, formatDate } from "../../../lib/statusMeta";

type Mode = "leads" | "interviews";

export default function CandidatePerformanceScreen() {
  const t = useTheme();
  const { candidateId } = useLocalSearchParams<{ candidateId: string }>();
  const { payload } = useAuth();
  const { departmentId } = useDepartmentContext();
  const role = payload?.role ?? null;
  const hasAccess = !!role && PERFORMANCE_ROLES.has(role);

  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [leads, setLeads] = useState<LeadListItem[]>([]);
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("leads");

  const load = useCallback(
    async (isRefresh = false) => {
      if (!hasAccess || !candidateId) {
        setLoading(false);
        return;
      }
      isRefresh ? setRefreshing(true) : setLoading(true);
      setError(null);
      try {
        const [candidatesData, leadsPage, interviewsData] = await Promise.all([
          candidatesService.list({ department_id: departmentId }),
          leadsService.list({ page: 1, page_size: 5000, candidate_id: candidateId, department_id: departmentId ?? undefined }),
          interviewsService.list(departmentId ? { department_id: departmentId } : undefined),
        ]);
        setCandidate(candidatesData.find((c) => c.id === candidateId) ?? null);
        setLeads(leadsPage.items);
        setInterviews(interviewsData.filter((i) => i.candidate_id === candidateId));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load candidate data");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [candidateId, departmentId, hasAccess],
  );

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const m = useMemo(
    () => (mode === "leads" ? computeLeadsMetrics(leads) : computeInterviewsMetrics(interviews)),
    [mode, leads, interviews],
  );

  const recentLeads = useMemo(
    () =>
      [...leads]
        .sort((a, b) => (b.last_interview_date ?? b.first_interview_date ?? "").localeCompare(a.last_interview_date ?? a.first_interview_date ?? ""))
        .slice(0, 8),
    [leads],
  );
  const recentInterviews = useMemo(
    () => [...interviews].sort((a, b) => (b.interview_date ?? "").localeCompare(a.interview_date ?? "")).slice(0, 8),
    [interviews],
  );

  if (!hasAccess) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <Header title="Performance" showBack />
        <EmptyState icon="shield-outline" title="Access Denied" />
      </View>
    );
  }

  if (loading && !candidate) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <Header title="Performance" showBack />
        <LoadingView />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Header title={candidate?.name ?? "Candidate"} showBack />
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={t.primary} />}
      >
        {error && <ErrorBanner message={error} onRetry={() => load()} />}
        {!error && !candidate && <EmptyState icon="person-outline" title="Candidate not found" />}

        {candidate && (
          <>
            <View style={{ flexDirection: "row", backgroundColor: t.surfaceAlt, borderRadius: 999, padding: 3, alignSelf: "flex-start" }}>
              {(["leads", "interviews"] as const).map((tab) => (
                <TouchableOpacity
                  key={tab}
                  onPress={() => setMode(tab)}
                  style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, backgroundColor: mode === tab ? t.primary : "transparent" }}
                >
                  <Text style={{ fontSize: 12, fontWeight: "600", textTransform: "capitalize", color: mode === tab ? t.primaryText : t.textMuted }}>
                    {tab}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
              <StatTile label="Total" value={m.total} color="#6366f1" />
              <StatTile label="Closed" value={`${m.closed} (${pct(m.closed, m.legit)}%)`} color="#10b981" />
              <StatTile label="Progressed" value={`${m.progressed} (${pct(m.progressed, m.legit)}%)`} color="#8b5cf6" />
              <StatTile label="Rejected" value={`${m.rejected} (${pct(m.rejected, m.legit)}%)`} color="#ef4444" />
              <StatTile label="Unresponsive" value={`${m.unresponsive} (${pct(m.unresponsive, m.legit)}%)`} color="#f59e0b" />
              <StatTile label="Dropped" value={`${m.dropped} (${pct(m.dropped, m.total)}%)`} color={DROPPED_COLOR} />
              <StatTile label="Final Rounds" value={m.finalRounds} color="#14b8a6" />
            </View>

            <Card style={{ gap: 10 }}>
              <Text style={{ color: t.text, fontWeight: "700", fontSize: 15 }}>Outcome Breakdown</Text>
              {METRIC_STYLE.map(({ key, label, color }) => {
                const count = (m as unknown as Record<string, number>)[key];
                if (!count) return null;
                return (
                  <View key={key} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: color }} />
                    <Text style={{ color: t.text, fontSize: 13, flex: 1 }}>{label}</Text>
                    <Text style={{ color: t.textMuted, fontSize: 13 }}>{count}</Text>
                  </View>
                );
              })}
              {m.dropped > 0 && (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: DROPPED_COLOR }} />
                  <Text style={{ color: t.text, fontSize: 13, flex: 1 }}>Dropped</Text>
                  <Text style={{ color: t.textMuted, fontSize: 13 }}>{m.dropped}</Text>
                </View>
              )}
            </Card>

            <Card style={{ gap: 8 }}>
              <Text style={{ color: t.text, fontWeight: "700", fontSize: 15 }}>
                Recent {mode === "leads" ? "Leads" : "Interviews"}
              </Text>
              {mode === "leads" ? (
                recentLeads.length === 0 ? (
                  <Text style={{ color: t.textMuted, paddingVertical: 8 }}>No leads found</Text>
                ) : (
                  recentLeads.map((lead) => {
                    const badge = leadOutcomeBadge(lead.lead_outcome, lead.lead_status_label);
                    return (
                      <ListRow
                        key={lead.thread_id}
                        title={`${lead.company_name ?? "—"} — ${lead.primary_role ?? "—"}`}
                        subtitle={`${lead.interview_count} interview${lead.interview_count === 1 ? "" : "s"} • ${formatDate(lead.last_interview_date)}`}
                        onPress={() => router.push(`/leads/${lead.thread_id}`)}
                        right={<Badge label={badge.label} bg={badge.bg} color={badge.color} />}
                      />
                    );
                  })
                )
              ) : recentInterviews.length === 0 ? (
                <Text style={{ color: t.textMuted, paddingVertical: 8 }}>No interviews found</Text>
              ) : (
                recentInterviews.map((iv) => {
                  const badge = interviewStatusBadge(iv.computed_status);
                  return (
                    <ListRow
                      key={iv.id}
                      title={`${iv.company_name ?? "—"} — ${iv.role}`}
                      subtitle={`${iv.round} • ${formatDate(iv.interview_date)}`}
                      onPress={() => router.push(`/interviews/${iv.id}`)}
                      right={<Badge label={badge.label} bg={badge.bg} color={badge.color} />}
                    />
                  );
                })
              )}
            </Card>
          </>
        )}
      </ScrollView>
    </View>
  );
}
