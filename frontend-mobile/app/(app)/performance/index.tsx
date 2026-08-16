import React, { useCallback, useMemo, useState } from "react";
import { View, Text, FlatList, RefreshControl, TouchableOpacity } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Header } from "../../../components/Header";
import { LoadingView, ErrorBanner, EmptyState, SearchBar, Card } from "../../../components/ui";
import { useTheme } from "../../../lib/theme";
import { useAuth } from "../../../lib/AuthContext";
import { candidatesService, leadsService, interviewsService } from "../../../lib/api";
import { useDepartmentContext } from "../../../lib/DepartmentContext";
import type { Candidate, LeadListItem, Interview } from "../../../lib/types";
import {
  computeLeadsMetrics,
  computeInterviewsMetrics,
  pct,
  METRIC_STYLE,
  DROPPED_COLOR,
  PERFORMANCE_ROLES,
  OutcomeMetrics,
} from "../../../lib/performanceMetrics";

type Mode = "leads" | "interviews";
type StatusFilter = "active" | "inactive" | "all";

interface Row {
  candidate: Candidate;
  metrics: OutcomeMetrics;
}

function Pill<T extends string>({ value, options, active, onChange }: { value: T; options: readonly T[]; active: T; onChange: (v: T) => void }) {
  const t = useTheme();
  return (
    <TouchableOpacity
      onPress={() => onChange(value)}
      style={{
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: 999,
        backgroundColor: active === value ? t.primary : "transparent",
      }}
    >
      <Text
        style={{
          fontSize: 12,
          fontWeight: "600",
          textTransform: "capitalize",
          color: active === value ? t.primaryText : t.textMuted,
        }}
      >
        {value}
      </Text>
    </TouchableOpacity>
  );
}

function PillGroup<T extends string>({ options, value, onChange }: { options: readonly T[]; value: T; onChange: (v: T) => void }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: "row", backgroundColor: t.surfaceAlt, borderRadius: 999, padding: 3, gap: 2 }}>
      {options.map((o) => (
        <Pill key={o} value={o} options={options} active={value} onChange={onChange} />
      ))}
    </View>
  );
}

export default function PerformanceScreen() {
  const t = useTheme();
  const { payload } = useAuth();
  const { departmentId } = useDepartmentContext();
  const role = payload?.role ?? null;
  const hasAccess = !!role && PERFORMANCE_ROLES.has(role);

  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [leads, setLeads] = useState<LeadListItem[]>([]);
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [mode, setMode] = useState<Mode>("leads");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [search, setSearch] = useState("");

  const load = useCallback(
    async (isRefresh = false) => {
      if (!hasAccess) {
        setLoading(false);
        return;
      }
      isRefresh ? setRefreshing(true) : setLoading(true);
      setError(null);
      try {
        const [candidatesData, leadsPage, interviewsData] = await Promise.all([
          candidatesService.list({ department_id: departmentId }),
          leadsService.list({ page: 1, page_size: 5000, department_id: departmentId ?? undefined }),
          interviewsService.list(departmentId ? { department_id: departmentId } : undefined),
        ]);
        setCandidates(candidatesData);
        setLeads(leadsPage.items);
        setInterviews(interviewsData);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load candidate analysis");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [departmentId, hasAccess],
  );

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const rows = useMemo<Row[]>(() => {
    if (mode === "leads") {
      const byCandidate = new Map<string, LeadListItem[]>();
      leads.forEach((l) => {
        if (!l.candidate_id) return;
        const arr = byCandidate.get(l.candidate_id) ?? [];
        arr.push(l);
        byCandidate.set(l.candidate_id, arr);
      });
      return candidates
        .filter((c) => byCandidate.has(c.id))
        .map((candidate) => ({ candidate, metrics: computeLeadsMetrics(byCandidate.get(candidate.id)!) }));
    }
    const byCandidate = new Map<string, Interview[]>();
    interviews.forEach((i) => {
      if (!i.candidate_id) return;
      const arr = byCandidate.get(i.candidate_id) ?? [];
      arr.push(i);
      byCandidate.set(i.candidate_id, arr);
    });
    return candidates
      .filter((c) => byCandidate.has(c.id))
      .map((candidate) => ({ candidate, metrics: computeInterviewsMetrics(byCandidate.get(candidate.id)!) }));
  }, [mode, candidates, leads, interviews]);

  const filteredRows = useMemo(() => {
    let base = rows;
    if (statusFilter !== "all") {
      base = base.filter((r) => (statusFilter === "active" ? r.candidate.is_active !== false : r.candidate.is_active === false));
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      base = base.filter((r) => r.candidate.name.toLowerCase().includes(q));
    }
    return [...base].sort((a, b) => b.metrics.legit - a.metrics.legit);
  }, [rows, statusFilter, search]);

  if (!hasAccess) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <Header title="Performance" />
        <EmptyState icon="shield-outline" title="Access Denied" subtitle="This page is restricted to Superadmins, Dept Leads, and BD Team Leads." />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Header title="Performance" />
      <View style={{ padding: 16, paddingBottom: 8, gap: 10 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={{ color: t.textMuted, fontSize: 13 }}>
            {filteredRows.length} candidate{filteredRows.length !== 1 ? "s" : ""} with {mode} data
          </Text>
          <PillGroup options={["leads", "interviews"] as const} value={mode} onChange={setMode} />
        </View>
        <SearchBar value={search} onChangeText={setSearch} placeholder="Search candidates…" />
        <PillGroup options={["active", "inactive", "all"] as const} value={statusFilter} onChange={setStatusFilter} />
      </View>

      {error && (
        <View style={{ paddingHorizontal: 16 }}>
          <ErrorBanner message={error} onRetry={() => load()} />
        </View>
      )}

      {loading ? (
        <LoadingView />
      ) : (
        <FlatList
          data={filteredRows}
          keyExtractor={(r) => r.candidate.id}
          contentContainerStyle={{ padding: 16, paddingTop: 4, gap: 10, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={t.primary} />}
          ListEmptyComponent={<EmptyState icon="pie-chart-outline" title={`No candidates with ${mode} data in this scope yet`} />}
          renderItem={({ item }) => <PerformanceRow row={item} onPress={() => router.push(`/performance/${item.candidate.id}`)} />}
        />
      )}
    </View>
  );
}

function PerformanceRow({ row, onPress }: { row: Row; onPress: () => void }) {
  const t = useTheme();
  const { candidate, metrics } = row;
  const pctByKey: Record<string, number> = {
    closed: pct(metrics.closed, metrics.legit),
    progressed: pct(metrics.progressed, metrics.legit),
    rejected: pct(metrics.rejected, metrics.legit),
    unresponsive: pct(metrics.unresponsive, metrics.legit),
  };
  const droppedPct = pct(metrics.dropped, metrics.total);

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
      <Card style={{ gap: 10 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={{ color: t.text, fontWeight: "700", fontSize: 15, flex: 1 }} numberOfLines={1}>
            {candidate.name}
          </Text>
          <Text style={{ color: t.textMuted, fontSize: 12 }}>
            {metrics.legit} / {metrics.total}
          </Text>
        </View>

        <View style={{ flexDirection: "row", height: 6, borderRadius: 3, overflow: "hidden", backgroundColor: t.surfaceAlt }}>
          {METRIC_STYLE.map(({ key, color }) => {
            const v = pctByKey[key];
            if (v <= 0) return null;
            return <View key={key} style={{ width: `${v}%`, backgroundColor: color }} />;
          })}
        </View>

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 14 }}>
          {METRIC_STYLE.map(({ key, label, color }) => (
            <View key={key} style={{ minWidth: 70 }}>
              <Text style={{ color, fontWeight: "700", fontSize: 14 }}>{pctByKey[key]}%</Text>
              <Text style={{ color: t.textMuted, fontSize: 11 }}>{label}</Text>
            </View>
          ))}
          <View style={{ minWidth: 70 }}>
            <Text style={{ color: DROPPED_COLOR, fontWeight: "700", fontSize: 14 }}>{droppedPct}%</Text>
            <Text style={{ color: t.textMuted, fontSize: 11 }}>Dropped</Text>
          </View>
          {metrics.finalRounds > 0 && (
            <View style={{ minWidth: 70 }}>
              <Text style={{ color: "#14b8a6", fontWeight: "700", fontSize: 14 }}>{metrics.finalRounds}</Text>
              <Text style={{ color: t.textMuted, fontSize: 11 }}>Final Rounds</Text>
            </View>
          )}
        </View>
      </Card>
    </TouchableOpacity>
  );
}
