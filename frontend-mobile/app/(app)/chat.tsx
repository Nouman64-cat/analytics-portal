import React, { useRef, useState } from "react";
import { View, Text, FlatList, KeyboardAvoidingView, Platform, TextInput, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Header } from "../../components/Header";
import { EmptyState } from "../../components/ui";
import { useTheme } from "../../lib/theme";
import { chatService } from "../../lib/api";
import type { ChatMessage, ChatAction } from "../../lib/types";

export default function ChatScreen() {
  const t = useTheme();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList>(null);

  async function handleSend() {
    const text = input.trim();
    if (!text || sending) return;
    const history = messages.map((m) => ({ role: m.role, content: m.content }));
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setInput("");
    setSending(true);
    try {
      const res = await chatService.send(history, text);
      setMessages((prev) => [...prev, { role: "assistant", content: res.reply, actions: res.actions as ChatAction[] }]);
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: e instanceof Error ? `Error: ${e.message}` : "Something went wrong." },
      ]);
    } finally {
      setSending(false);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.bg }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={90}>
      <Header title="Chat Assistant" />
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(_, i) => String(i)}
        contentContainerStyle={{ padding: 16, gap: 10, flexGrow: 1 }}
        ListEmptyComponent={<EmptyState icon="chatbubbles-outline" title="Ask me anything" subtitle="e.g. “Create a company called Acme Corp”" />}
        renderItem={({ item }) => (
          <View
            style={{
              alignSelf: item.role === "user" ? "flex-end" : "flex-start",
              backgroundColor: item.role === "user" ? t.primary : t.surfaceAlt,
              borderRadius: 14,
              paddingHorizontal: 14,
              paddingVertical: 10,
              maxWidth: "85%",
            }}
          >
            <Text style={{ color: item.role === "user" ? t.primaryText : t.text, fontSize: 15 }}>{item.content}</Text>
          </View>
        )}
      />
      <View style={{ flexDirection: "row", padding: 12, gap: 8, borderTopWidth: 1, borderTopColor: t.border, backgroundColor: t.surface }}>
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder="Type a message…"
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
