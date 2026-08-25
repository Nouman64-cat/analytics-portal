import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Header } from "../../../components/Header";
import { EmptyState, LoadingView } from "../../../components/ui";
import { useTheme } from "../../../lib/theme";
import { useAuth } from "../../../lib/AuthContext";
import { messagesService } from "../../../lib/api";
import { subscribeToMessages } from "../../../lib/messagesSocket";
import type { MessageThreadKind, TeamMessage } from "../../../lib/types";
import { dayKey, formatDateDivider, formatMessageTime } from "../../../components/messages/format";

// Safety-net only — live updates arrive over the WebSocket in lib/messagesSocket.ts.
const POLL_MS = 30000;
const SEARCH_DEBOUNCE_MS = 250;

type Row = { kind: "divider"; key: string; label: string } | { kind: "message"; key: string; message: TeamMessage };

export default function ConversationScreen() {
  const t = useTheme();
  const { payload } = useAuth();
  const params = useLocalSearchParams<{ id: string; title?: string; kind?: MessageThreadKind }>();
  const myId = payload?.user_id;

  const [messages, setMessages] = useState<TeamMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList<Row>>(null);

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<TeamMessage[]>([]);
  const [searching, setSearching] = useState(false);
  const [historyMode, setHistoryMode] = useState(false);
  const historyModeRef = useRef(false);
  historyModeRef.current = historyMode;
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const pendingScrollIdRef = useRef<string | null>(null);

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!opts?.silent) setLoading(true);
      try {
        const data = await messagesService.getMessages(params.id);
        setMessages(data);
      } catch {
        // keep the last known messages on a transient poll failure
      } finally {
        if (!opts?.silent) setLoading(false);
      }
    },
    [params.id],
  );

  useFocusEffect(
    useCallback(() => {
      setHistoryMode(false);
      setSearchOpen(false);
      setSearchQuery("");
      setSearchResults([]);
      load();
      messagesService.markRead(params.id).catch(() => {});
      const interval = setInterval(() => {
        if (historyModeRef.current) return;
        load({ silent: true });
      }, POLL_MS);
      const unsubscribe = subscribeToMessages((evt) => {
        if (evt.thread_id !== params.id) return;
        if (historyModeRef.current) return;
        setMessages((prev) => (prev.some((m) => m.id === evt.message.id) ? prev : [...prev, evt.message]));
        messagesService.markRead(params.id).catch(() => {});
      });
      return () => {
        clearInterval(interval);
        unsubscribe();
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [load, params.id]),
  );

  useEffect(() => {
    if (!searchOpen) return;
    const q = searchQuery.trim();
    if (!q) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const data = await messagesService.searchMessages(params.id, q);
        setSearchResults(data);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchOpen, searchQuery, params.id]);

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    let lastDay = "";
    for (const m of messages) {
      const key = dayKey(m.created_at);
      if (key !== lastDay) {
        out.push({ kind: "divider", key: `d-${key}`, label: formatDateDivider(m.created_at) });
        lastDay = key;
      }
      out.push({ kind: "message", key: m.id, message: m });
    }
    return out;
  }, [messages]);

  useEffect(() => {
    if (!pendingScrollIdRef.current) return;
    const targetId = pendingScrollIdRef.current;
    const index = rows.findIndex((r) => r.kind === "message" && r.message.id === targetId);
    if (index >= 0) {
      requestAnimationFrame(() => {
        listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.5 });
      });
      setHighlightedId(targetId);
      pendingScrollIdRef.current = null;
      const timer = setTimeout(() => setHighlightedId(null), 2000);
      return () => clearTimeout(timer);
    }
  }, [rows]);

  async function handleJumpToResult(result: TeamMessage) {
    setSearchOpen(false);
    setSearchQuery("");
    setSearchResults([]);
    setLoading(true);
    try {
      const window = await messagesService.getMessages(params.id, { around: result.id });
      setMessages(window);
      setHistoryMode(true);
      pendingScrollIdRef.current = result.id;
    } catch {
      // leave the current view as-is on failure
    } finally {
      setLoading(false);
    }
  }

  function handleJumpToLatest() {
    setHistoryMode(false);
    load();
  }

  async function handleSend() {
    const body = input.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      const sent = await messagesService.sendMessage(params.id, body);
      if (historyModeRef.current) {
        setHistoryMode(false);
        await load();
      } else {
        setMessages((prev) => [...prev, sent]);
      }
      setInput("");
    } catch {
      // leave the composer text in place so the user can retry
    } finally {
      setSending(false);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: t.bg }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={90}
    >
      <Header
        title={params.title ?? "Conversation"}
        showBack
        right={
          <TouchableOpacity
            onPress={() => setSearchOpen((v) => !v)}
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: searchOpen ? `${t.primary}20` : "transparent",
            }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="search" size={19} color={searchOpen ? t.primary : t.text} />
          </TouchableOpacity>
        }
      />

      {searchOpen && (
        <View style={{ borderBottomWidth: 1, borderBottomColor: t.border, backgroundColor: t.surface }}>
          <View style={{ padding: 12 }}>
            <TextInput
              autoFocus
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search this conversation…"
              placeholderTextColor={t.textMuted}
              style={{
                backgroundColor: t.surfaceAlt,
                borderRadius: 10,
                paddingHorizontal: 12,
                paddingVertical: 9,
                color: t.text,
                fontSize: 14,
              }}
            />
          </View>
          <View style={{ maxHeight: 260 }}>
            {searching ? (
              <View style={{ paddingVertical: 20, alignItems: "center" }}>
                <ActivityIndicator color={t.primary} />
              </View>
            ) : searchQuery.trim() && searchResults.length === 0 ? (
              <Text style={{ color: t.textMuted, fontSize: 13, textAlign: "center", paddingBottom: 16 }}>
                No matches
              </Text>
            ) : (
              searchResults.map((r) => (
                <TouchableOpacity
                  key={r.id}
                  onPress={() => handleJumpToResult(r)}
                  style={{ paddingHorizontal: 16, paddingVertical: 9 }}
                >
                  <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                    <Text style={{ color: t.text, fontSize: 13, fontWeight: "600" }}>{r.sender_name}</Text>
                    <Text style={{ color: t.textMuted, fontSize: 11 }}>{formatMessageTime(r.created_at)}</Text>
                  </View>
                  <Text style={{ color: t.textMuted, fontSize: 13, marginTop: 1 }} numberOfLines={1}>
                    {r.body}
                  </Text>
                </TouchableOpacity>
              ))
            )}
          </View>
        </View>
      )}

      {historyMode && (
        <TouchableOpacity
          onPress={handleJumpToLatest}
          style={{
            alignSelf: "center",
            marginTop: 8,
            paddingHorizontal: 14,
            paddingVertical: 6,
            borderRadius: 999,
            backgroundColor: t.text,
          }}
        >
          <Text style={{ color: t.bg, fontSize: 12, fontWeight: "600" }}>Jump to latest</Text>
        </TouchableOpacity>
      )}

      {loading ? (
        <LoadingView />
      ) : (
        <FlatList
          ref={listRef}
          data={rows}
          keyExtractor={(r) => r.key}
          contentContainerStyle={{ padding: 16, gap: 10, flexGrow: 1 }}
          onContentSizeChange={() => {
            if (!historyModeRef.current) listRef.current?.scrollToEnd({ animated: false });
          }}
          onScrollToIndexFailed={(info) => {
            setTimeout(() => {
              listRef.current?.scrollToIndex({ index: info.index, animated: true, viewPosition: 0.5 });
            }, 150);
          }}
          ListEmptyComponent={
            <EmptyState icon="chatbubble-ellipses-outline" title="No messages yet" subtitle="Say hello." />
          }
          renderItem={({ item }) => {
            if (item.kind === "divider") {
              return (
                <View style={{ alignItems: "center", paddingVertical: 4 }}>
                  <View style={{ backgroundColor: t.surfaceAlt, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 }}>
                    <Text style={{ color: t.textMuted, fontSize: 10.5, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4 }}>
                      {item.label}
                    </Text>
                  </View>
                </View>
              );
            }
            const message = item.message;
            const mine = message.sender_id === myId;
            const showSender = !mine && params.kind !== "dm";
            const highlighted = highlightedId === message.id;
            return (
              <View style={{ alignSelf: mine ? "flex-end" : "flex-start", maxWidth: "85%" }}>
                {showSender && (
                  <Text style={{ color: t.textMuted, fontSize: 11.5, fontWeight: "600", marginBottom: 2, marginLeft: 2 }}>
                    {message.sender_name}
                  </Text>
                )}
                <View
                  style={{
                    backgroundColor: mine ? t.primary : t.surfaceAlt,
                    borderRadius: 14,
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                    borderWidth: highlighted ? 2 : 0,
                    borderColor: highlighted ? "#f59e0b" : "transparent",
                  }}
                >
                  <Text style={{ color: mine ? t.primaryText : t.text, fontSize: 15 }}>{message.body}</Text>
                </View>
                <Text
                  style={{
                    color: t.textMuted,
                    fontSize: 10.5,
                    marginTop: 2,
                    marginLeft: mine ? 0 : 2,
                    marginRight: mine ? 2 : 0,
                    alignSelf: mine ? "flex-end" : "flex-start",
                  }}
                >
                  {formatMessageTime(message.created_at)}
                </Text>
              </View>
            );
          }}
        />
      )}
      <View style={{ flexDirection: "row", padding: 12, gap: 8, borderTopWidth: 1, borderTopColor: t.border, backgroundColor: t.surface }}>
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder="Write a message…"
          placeholderTextColor={t.textMuted}
          style={{
            flex: 1,
            backgroundColor: t.surfaceAlt,
            borderRadius: 20,
            paddingHorizontal: 16,
            paddingVertical: 10,
            color: t.text,
          }}
          onSubmitEditing={handleSend}
          returnKeyType="send"
        />
        <TouchableOpacity
          onPress={handleSend}
          disabled={sending || !input.trim()}
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: t.primary,
            alignItems: "center",
            justifyContent: "center",
            opacity: sending || !input.trim() ? 0.5 : 1,
          }}
        >
          <Ionicons name="send" size={18} color={t.primaryText} />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}
