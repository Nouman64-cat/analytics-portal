import React, { useCallback, useState } from "react";
import { View, Image, RefreshControl, FlatList, Text } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Header } from "../../../components/Header";
import { LoadingView, ErrorBanner, EmptyState, ListRow, Fab, SearchBar, Badge } from "../../../components/ui";
import { useTheme } from "../../../lib/theme";
import { candidatesService } from "../../../lib/api";
import type { Candidate } from "../../../lib/types";
import { useDepartmentContext } from "../../../lib/DepartmentContext";

export default function CandidatesListScreen() {
  const t = useTheme();
  const { departmentId } = useDepartmentContext();
  const [items, setItems] = useState<Candidate[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    isRefresh ? setRefreshing(true) : setLoading(true);
    setError(null);
    try {
      setItems(await candidatesService.list({ department_id: departmentId }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load candidates");
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

  const filtered = items.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Header title={`Candidates (${items.length})`} />
      <View style={{ padding: 16, paddingBottom: 8 }}>
        <SearchBar value={search} onChangeText={setSearch} placeholder="Search candidates…" />
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
          ListEmptyComponent={<EmptyState icon="people-outline" title="No candidates found" />}
          renderItem={({ item }) => (
            <ListRow
              title={item.name}
              subtitle={item.department_names?.join(", ") || "No department"}
              onPress={() => router.push(`/candidates/${item.id}`)}
              right={
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  {!item.is_active && <Badge label="Inactive" bg="#94a3b826" color="#64748b" />}
                  {item.avatar_url ? (
                    <Image source={{ uri: item.avatar_url }} style={{ width: 32, height: 32, borderRadius: 16 }} />
                  ) : (
                    <View
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 16,
                        backgroundColor: item.color || t.primary,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>
                        {item.name.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                  )}
                </View>
              }
            />
          )}
        />
      )}
      <Fab onPress={() => router.push("/candidates/new")} />
    </View>
  );
}
