import React, { useCallback, useState } from "react";
import { View, Text, FlatList, RefreshControl } from "react-native";
import { useFocusEffect } from "expo-router";
import { Header } from "../../components/Header";
import { LoadingView, ErrorBanner, EmptyState, Button } from "../../components/ui";
import { useTheme } from "../../lib/theme";
import { activitiesService } from "../../lib/api";
import type { ActivityLog } from "../../lib/types";
import { formatDateTime } from "../../lib/statusMeta";

const PAGE_SIZE = 30;

export default function ActivitiesScreen() {
  const t = useTheme();
  const [items, setItems] = useState<ActivityLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    isRefresh ? setRefreshing(true) : setLoading(true);
    setError(null);
    try {
      const page = await activitiesService.list({ limit: PAGE_SIZE, offset: 0 });
      setItems(page.items);
      setTotal(page.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load activities");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  async function loadMore() {
    if (loadingMore || items.length >= total) return;
    setLoadingMore(true);
    try {
      const page = await activitiesService.list({ limit: PAGE_SIZE, offset: items.length });
      setItems((prev) => [...prev, ...page.items]);
    } catch {
      // silent — user can pull to refresh
    } finally {
      setLoadingMore(false);
    }
  }

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Header title={`Activities (${total})`} />
      {error && (
        <View style={{ padding: 16, paddingBottom: 0 }}>
          <ErrorBanner message={error} onRetry={() => load()} />
        </View>
      )}
      {loading ? (
        <LoadingView />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={t.primary} />}
          ListEmptyComponent={<EmptyState icon="time-outline" title="No activity yet" />}
          onEndReachedThreshold={0.4}
          onEndReached={loadMore}
          renderItem={({ item }) => (
            <View style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: t.border }}>
              <Text style={{ color: t.text, fontSize: 14 }}>{item.message}</Text>
              <Text style={{ color: t.textMuted, fontSize: 12, marginTop: 2 }}>
                {item.actor_email} • {formatDateTime(item.created_at)}
              </Text>
            </View>
          )}
          ListFooterComponent={
            items.length < total ? (
              <Button title={loadingMore ? "Loading…" : "Load More"} variant="secondary" onPress={loadMore} loading={loadingMore} style={{ marginTop: 8 }} />
            ) : null
          }
        />
      )}
    </View>
  );
}
