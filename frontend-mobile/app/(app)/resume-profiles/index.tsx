import React, { useCallback, useState } from "react";
import { View, FlatList, RefreshControl } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Header } from "../../../components/Header";
import { LoadingView, ErrorBanner, EmptyState, ListRow, Fab, SearchBar, Badge } from "../../../components/ui";
import { useTheme } from "../../../lib/theme";
import { profilesService } from "../../../lib/api";
import type { ResumeProfile } from "../../../lib/types";

export default function ResumeProfilesListScreen() {
  const t = useTheme();
  const [items, setItems] = useState<ResumeProfile[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    isRefresh ? setRefreshing(true) : setLoading(true);
    setError(null);
    try {
      setItems(await profilesService.list());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load resume profiles");
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

  const filtered = items.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Header title={`Resume Profiles (${items.length})`} />
      <View style={{ padding: 16, paddingBottom: 8 }}>
        <SearchBar value={search} onChangeText={setSearch} placeholder="Search resume profiles…" />
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
          ListEmptyComponent={<EmptyState icon="document-text-outline" title="No resume profiles found" />}
          renderItem={({ item }) => (
            <ListRow
              title={item.name}
              subtitle={item.department_name || item.location || undefined}
              onPress={() => router.push(`/resume-profiles/${item.id}`)}
              right={!item.is_active ? <Badge label="Inactive" bg="#94a3b826" color="#64748b" /> : undefined}
            />
          )}
        />
      )}
      <Fab onPress={() => router.push("/resume-profiles/new")} />
    </View>
  );
}
