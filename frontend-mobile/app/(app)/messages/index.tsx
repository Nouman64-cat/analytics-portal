import React, { useCallback, useState } from "react";
import { View, Text, FlatList, RefreshControl, TouchableOpacity, StyleSheet } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Header } from "../../../components/Header";
import { LoadingView, ErrorBanner, EmptyState, Fab, SearchBar, Badge } from "../../../components/ui";
import { ThreadAvatar } from "../../../components/messages/ThreadAvatar";
import { formatMessageTime } from "../../../components/messages/format";
import { useTheme } from "../../../lib/theme";
import { messagesService } from "../../../lib/api";
import type { MessageThreadSummary } from "../../../lib/types";

const POLL_MS = 6000;

function ThreadRow({ thread, onPress }: { thread: MessageThreadSummary; onPress: () => void }) {
  const t = useTheme();
  const unread = thread.unread_count > 0;
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.6}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 11,
        paddingVertical: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: t.border,
      }}
    >
      <ThreadAvatar title={thread.title} kind={thread.kind} size={44} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <Text
            style={{ flex: 1, color: t.text, fontSize: 15, fontWeight: unread ? "800" : "600" }}
            numberOfLines={1}
          >
            {thread.title}
          </Text>
          <Text style={{ color: t.textMuted, fontSize: 11 }}>{formatMessageTime(thread.updated_at)}</Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 2 }}>
          <Text style={{ flex: 1, color: t.textMuted, fontSize: 13 }} numberOfLines={1}>
            {thread.last_message
              ? `${thread.last_message.sender_name}: ${thread.last_message.body}`
              : "No messages yet"}
          </Text>
          {unread && <Badge label={String(thread.unread_count > 99 ? "99+" : thread.unread_count)} bg={t.primary} color={t.primaryText} />}
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function MessagesListScreen() {
  const t = useTheme();
  const [threads, setThreads] = useState<MessageThreadSummary[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (opts?: { isRefresh?: boolean; silent?: boolean }) => {
    if (opts?.isRefresh) setRefreshing(true);
    else if (!opts?.silent) setLoading(true);
    try {
      const data = await messagesService.getThreads();
      setThreads(data);
      setError(null);
    } catch (e) {
      if (!opts?.silent) setError(e instanceof Error ? e.message : "Failed to load messages");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
      const interval = setInterval(() => load({ silent: true }), POLL_MS);
      return () => clearInterval(interval);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [load]),
  );

  function handleSelect(thread: MessageThreadSummary) {
    setThreads((prev) => prev.map((th) => (th.id === thread.id ? { ...th, unread_count: 0 } : th)));
    router.push({
      pathname: "/messages/[id]",
      params: { id: thread.id, title: thread.title, kind: thread.kind },
    });
  }

  const filtered = search.trim()
    ? threads.filter((th) => th.title.toLowerCase().includes(search.trim().toLowerCase()))
    : threads;

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Header title="Messages" />
      <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 }}>
        <SearchBar value={search} onChangeText={setSearch} placeholder="Search conversations…" />
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
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 100 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load({ isRefresh: true })} tintColor={t.primary} />}
          ListEmptyComponent={
            <EmptyState
              icon="chatbubble-ellipses-outline"
              title={threads.length === 0 ? "No conversations yet" : "No matches"}
              subtitle={threads.length === 0 ? "Tap + to start a new one." : undefined}
            />
          }
          renderItem={({ item }) => <ThreadRow thread={item} onPress={() => handleSelect(item)} />}
        />
      )}
      <Fab onPress={() => router.push("/messages/new")} />
    </View>
  );
}
