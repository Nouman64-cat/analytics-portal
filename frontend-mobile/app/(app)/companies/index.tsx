import React, { useCallback, useState } from "react";
import { View, FlatList, RefreshControl } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Header } from "../../../components/Header";
import { LoadingView, ErrorBanner, EmptyState, ListRow, Fab, SearchBar, Badge } from "../../../components/ui";
import { useTheme } from "../../../lib/theme";
import { companiesService } from "../../../lib/api";
import type { Company } from "../../../lib/types";

export default function CompaniesListScreen() {
  const t = useTheme();
  const [items, setItems] = useState<Company[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    isRefresh ? setRefreshing(true) : setLoading(true);
    setError(null);
    try {
      setItems(await companiesService.list());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load companies");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const filtered = items.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Header title={`Companies (${items.length})`} />
      <View style={{ padding: 16, paddingBottom: 8 }}>
        <SearchBar value={search} onChangeText={setSearch} placeholder="Search companies…" />
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
          ListEmptyComponent={<EmptyState icon="business-outline" title="No companies found" />}
          renderItem={({ item }) => (
            <ListRow
              title={item.name}
              subtitle={item.detail || undefined}
              onPress={() => router.push(`/companies/${item.id}`)}
              right={item.is_staffing_firm ? <Badge label="Staffing Firm" bg="#6366f126" color="#4f46e5" /> : undefined}
            />
          )}
        />
      )}
      <Fab onPress={() => router.push("/companies/new")} />
    </View>
  );
}
