import React, { useEffect, useState } from "react";
import { View, Text, FlatList, TouchableOpacity } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Header } from "../../../components/Header";
import { LoadingView, ErrorBanner, EmptyState, ListRow, SearchBar, Button } from "../../../components/ui";
import { TextField } from "../../../components/FormField";
import { useTheme } from "../../../lib/theme";
import { messagesService } from "../../../lib/api";
import type { MessageContact } from "../../../lib/types";

const SEARCH_DEBOUNCE_MS = 250;

export default function NewMessageScreen() {
  const t = useTheme();
  const [mode, setMode] = useState<"dm" | "group">("dm");
  const [query, setQuery] = useState("");
  const [contacts, setContacts] = useState<MessageContact[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(true);
  const [selected, setSelected] = useState<MessageContact[]>([]);
  const [groupTitle, setGroupTitle] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadingContacts(true);
    const timer = setTimeout(async () => {
      try {
        const data = await messagesService.getContacts(query);
        if (!cancelled) setContacts(data);
      } catch {
        if (!cancelled) setContacts([]);
      } finally {
        if (!cancelled) setLoadingContacts(false);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  async function handlePickDm(contact: MessageContact) {
    setSubmitting(true);
    setError(null);
    try {
      const thread = await messagesService.openDm(contact.id);
      router.replace({
        pathname: "/messages/[id]",
        params: { id: thread.id, title: thread.title, kind: thread.kind },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't start that conversation");
    } finally {
      setSubmitting(false);
    }
  }

  function toggleSelected(contact: MessageContact) {
    setSelected((prev) =>
      prev.some((c) => c.id === contact.id) ? prev.filter((c) => c.id !== contact.id) : [...prev, contact],
    );
  }

  async function handleCreateGroup() {
    if (!groupTitle.trim() || selected.length < 2) return;
    setSubmitting(true);
    setError(null);
    try {
      const thread = await messagesService.createGroup(groupTitle.trim(), selected.map((c) => c.id));
      router.replace({
        pathname: "/messages/[id]",
        params: { id: thread.id, title: thread.title, kind: thread.kind },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't create the group");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Header title="New Message" showBack />
      <View style={{ padding: 16, paddingBottom: 8, gap: 12 }}>
        <View style={{ flexDirection: "row", backgroundColor: t.surfaceAlt, borderRadius: 999, padding: 3, alignSelf: "flex-start" }}>
          {(["dm", "group"] as const).map((m) => (
            <TouchableOpacity
              key={m}
              onPress={() => setMode(m)}
              activeOpacity={0.7}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 7,
                borderRadius: 999,
                backgroundColor: mode === m ? t.primary : "transparent",
              }}
            >
              <Text style={{ color: mode === m ? t.primaryText : t.text, fontSize: 13, fontWeight: "700" }}>
                {m === "dm" ? "Direct message" : "Group"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {mode === "group" && (
          <TextField value={groupTitle} onChangeText={setGroupTitle} placeholder="Group name…" />
        )}

        <SearchBar value={query} onChangeText={setQuery} placeholder="Search people…" />

        {error && <ErrorBanner message={error} />}
      </View>

      {loadingContacts ? (
        <LoadingView />
      ) : (
        <FlatList
          data={contacts}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: mode === "group" ? 100 : 24 }}
          ListEmptyComponent={<EmptyState icon="people-outline" title="No one found" subtitle="Try a different search." />}
          renderItem={({ item }) => {
            const isSelected = selected.some((c) => c.id === item.id);
            return (
              <ListRow
                title={item.full_name}
                subtitle={item.email}
                onPress={() => (submitting ? undefined : mode === "dm" ? handlePickDm(item) : toggleSelected(item))}
                right={mode === "group" && isSelected ? <Ionicons name="checkmark-circle" size={20} color={t.primary} /> : undefined}
              />
            );
          }}
        />
      )}

      {mode === "group" && (
        <View style={{ padding: 16, borderTopWidth: 1, borderTopColor: t.border, backgroundColor: t.surface }}>
          <Button
            title={`Create group${selected.length > 0 ? ` (${selected.length + 1})` : ""}`}
            onPress={handleCreateGroup}
            loading={submitting}
            disabled={!groupTitle.trim() || selected.length < 2}
          />
        </View>
      )}
    </View>
  );
}
