import React, { useCallback, useState } from "react";
import { View, Text, FlatList, RefreshControl } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Header } from "../../../components/Header";
import { LoadingView, ErrorBanner, EmptyState, ListRow, Fab, SearchBar, Badge } from "../../../components/ui";
import { useTheme } from "../../../lib/theme";
import { leadsService } from "../../../lib/api";
import type { LeadListItem } from "../../../lib/types";
import { statusBadge } from "../../../lib/statusMeta";

export default function LeadsListScreen() {
  const t = useTheme();
  const [items, setItems] = useState<LeadListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false, searchValue = search) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const page = await leadsService.list({ page: 1, page_size: 50, search: searchValue, sort: "last_activity_desc" });
      setItems(page.items);
      setTotal(page.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load leads");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Header title={`Leads (${total})`} />
      <View style={{ padding: 16, paddingBottom: 8 }}>
        <SearchBar value={search} onChangeText={(v) => { setSearch(v); load(false, v); }} placeholder="Search company, role, candidate…" />
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
          data={items}
          keyExtractor={(item) => item.thread_id}
          contentContainerStyle={{ padding: 16, paddingTop: 4, paddingBottom: 100 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={t.primary} />}
          ListEmptyComponent={<EmptyState icon="locate-outline" title="No leads found" subtitle="Try a different search or add a new lead." />}
          renderItem={({ item }) => {
            const badge = statusBadge(item.lead_outcome);
            return (
              <ListRow
                leftDot={badge.dot}
                title={`${item.company_name ?? "Unknown company"} — ${item.primary_role ?? "Role TBD"}`}
                subtitle={`${item.candidate_name ?? "Unassigned"} • ${item.interview_count} round${item.interview_count === 1 ? "" : "s"}`}
                onPress={() => router.push(`/leads/${item.thread_id}`)}
                right={<Badge label={badge.label} bg={badge.bg} color={badge.color} />}
              />
            );
          }}
        />
      )}
      <Fab onPress={() => router.push("/leads/new")} />
    </View>
  );
}
