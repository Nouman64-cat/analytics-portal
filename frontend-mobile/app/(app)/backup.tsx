import React, { useCallback, useState } from "react";
import { View, Text, ScrollView, RefreshControl, Linking, Alert } from "react-native";
import { useFocusEffect } from "expo-router";
import { Header } from "../../components/Header";
import { Card, Button, LoadingView, ErrorBanner, EmptyState, ListRow } from "../../components/ui";
import { useTheme } from "../../lib/theme";
import { backupService } from "../../lib/api";
import type { DatabaseBackupListResponse } from "../../lib/types";
import { formatDateTime } from "../../lib/statusMeta";
import { useAuth } from "../../lib/AuthContext";
import { isSuperadmin } from "../../lib/permissions";

function formatBytes(n: number | null): string {
  if (!n) return "—";
  const mb = n / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${(n / 1024).toFixed(0)} KB`;
}

export default function BackupScreen() {
  const t = useTheme();
  const { payload } = useAuth();
  const canAccess = isSuperadmin(payload?.role ?? null);
  const [data, setData] = useState<DatabaseBackupListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (!canAccess) {
      setLoading(false);
      return;
    }
    isRefresh ? setRefreshing(true) : setLoading(true);
    setError(null);
    try {
      setData(await backupService.list());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load backups");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAccess]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function handleCreate() {
    setCreating(true);
    try {
      await backupService.create();
      await load();
      Alert.alert("Backup created", "A new database backup has been created.");
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to create backup");
    } finally {
      setCreating(false);
    }
  }

  if (!canAccess) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <Header title="Database Backup" />
        <EmptyState icon="lock-closed-outline" title="Access denied" subtitle="Only superadmins can create backups and view stored files." />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Header title="Database Backup" />
      {loading && !data ? (
        <LoadingView />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, gap: 12 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={t.primary} />}
        >
          {error && <ErrorBanner message={error} onRetry={() => load()} />}
          <Button title="Create New Backup" icon="server-outline" onPress={handleCreate} loading={creating} />
          {data?.list_unavailable_reason && (
            <ErrorBanner message={`Listing unavailable: ${data.list_unavailable_reason}`} />
          )}
          <Card style={{ gap: 4 }}>
            <Text style={{ color: t.text, fontWeight: "700", fontSize: 15, marginBottom: 4 }}>Backups</Text>
            {(!data || data.items.length === 0) && <EmptyState icon="server-outline" title="No backups yet" />}
            {data?.items.map((b) => (
              <ListRow
                key={b.s3_key}
                title={b.s3_key.split("/").pop() ?? b.s3_key}
                subtitle={`${formatBytes(b.size_bytes)} • ${b.last_modified ? formatDateTime(b.last_modified) : "—"}`}
                onPress={b.download_url ? () => Linking.openURL(b.download_url!) : undefined}
              />
            ))}
          </Card>
        </ScrollView>
      )}
    </View>
  );
}
