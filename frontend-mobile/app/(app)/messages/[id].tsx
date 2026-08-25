import React, { useCallback, useRef, useState } from "react";
import { View, Text, FlatList, KeyboardAvoidingView, Platform, TextInput, TouchableOpacity } from "react-native";
import { useLocalSearchParams, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Header } from "../../../components/Header";
import { EmptyState, LoadingView } from "../../../components/ui";
import { useTheme } from "../../../lib/theme";
import { useAuth } from "../../../lib/AuthContext";
import { messagesService } from "../../../lib/api";
import { subscribeToMessages } from "../../../lib/messagesSocket";
import type { MessageThreadKind, TeamMessage } from "../../../lib/types";
import { formatMessageTime } from "../../../components/messages/format";

// Safety-net only — live updates arrive over the WebSocket in lib/messagesSocket.ts.
const POLL_MS = 30000;

export default function ConversationScreen() {
  const t = useTheme();
  const { payload } = useAuth();
  const params = useLocalSearchParams<{ id: string; title?: string; kind?: MessageThreadKind }>();
  const myId = payload?.user_id;

  const [messages, setMessages] = useState<TeamMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList>(null);

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
      load();
      messagesService.markRead(params.id).catch(() => {});
      const interval = setInterval(() => load({ silent: true }), POLL_MS);
      const unsubscribe = subscribeToMessages((evt) => {
        if (evt.thread_id !== params.id) return;
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

  async function handleSend() {
    const body = input.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      const sent = await messagesService.sendMessage(params.id, body);
      setMessages((prev) => [...prev, sent]);
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
      <Header title={params.title ?? "Conversation"} showBack />
      {loading ? (
        <LoadingView />
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: 16, gap: 10, flexGrow: 1 }}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          ListEmptyComponent={
            <EmptyState icon="chatbubble-ellipses-outline" title="No messages yet" subtitle="Say hello." />
          }
          renderItem={({ item }) => {
            const mine = item.sender_id === myId;
            const showSender = !mine && params.kind !== "dm";
            return (
              <View style={{ alignSelf: mine ? "flex-end" : "flex-start", maxWidth: "85%" }}>
                {showSender && (
                  <Text style={{ color: t.textMuted, fontSize: 11.5, fontWeight: "600", marginBottom: 2, marginLeft: 2 }}>
                    {item.sender_name}
                  </Text>
                )}
                <View
                  style={{
                    backgroundColor: mine ? t.primary : t.surfaceAlt,
                    borderRadius: 14,
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                  }}
                >
                  <Text style={{ color: mine ? t.primaryText : t.text, fontSize: 15 }}>{item.body}</Text>
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
                  {formatMessageTime(item.created_at)}
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
