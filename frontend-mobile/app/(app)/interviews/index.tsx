import React, { useCallback, useState } from "react";
import { View, FlatList, RefreshControl } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Header } from "../../../components/Header";
import { LoadingView, ErrorBanner, EmptyState, ListRow, Fab, SearchBar, Badge } from "../../../components/ui";
import { useTheme } from "../../../lib/theme";
import { interviewsService } from "../../../lib/api";
import type { Interview } from "../../../lib/types";
import { statusBadge, formatDate, prettify } from "../../../lib/statusMeta";
import { useDepartmentContext } from "../../../lib/DepartmentContext";

export default function InterviewsListScreen() {
  const t = useTheme();
  const { departmentId } = useDepartmentContext();
  const [items, setItems] = useState<Interview[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    isRefresh ? setRefreshing(true) : setLoading(true);
    setError(null);
    try {
      const data = await interviewsService.list(departmentId ? { department_id: departmentId } : undefined);
      setItems(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load interviews");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [departmentId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const filtered = items.filter((i) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      i.company_name?.toLowerCase().includes(q) ||
      i.candidate_name?.toLowerCase().includes(q) ||
      i.role?.toLowerCase().includes(q)
    );
  });

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Header title={`Interviews (${items.length})`} />
      <View style={{ padding: 16, paddingBottom: 8 }}>
        <SearchBar value={search} onChangeText={setSearch} placeholder="Search company, candidate, role…" />
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
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16, paddingTop: 4, paddingBottom: 100 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={t.primary} />}
          ListEmptyComponent={<EmptyState icon="checkmark-done-circle-outline" title="No interviews found" />}
          renderItem={({ item }) => {
            const badge = statusBadge(item.computed_status);
            return (
              <ListRow
                leftDot={badge.dot}
                title={`${item.company_name ?? "Unknown"} — ${item.role}`}
                subtitle={`${item.candidate_name ?? "Unassigned"} • ${item.round} • ${formatDate(item.interview_date)}`}
                onPress={() => router.push(`/interviews/${item.id}`)}
                right={<Badge label={badge.label} bg={badge.bg} color={badge.color} />}
              />
            );
          }}
        />
      )}
      <Fab onPress={() => router.push("/interviews/new")} />
    </View>
  );
}
