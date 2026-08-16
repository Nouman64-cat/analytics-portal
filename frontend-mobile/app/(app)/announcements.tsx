import React, { useCallback, useState } from "react";
import { View, Text, FlatList, RefreshControl, Modal, ScrollView, Alert, TouchableOpacity } from "react-native";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Header } from "../../components/Header";
import { LoadingView, ErrorBanner, EmptyState, ListRow, Fab, Badge, Button } from "../../components/ui";
import { TextField } from "../../components/FormField";
import { useTheme } from "../../lib/theme";
import { broadcastModalService } from "../../lib/api";
import type { BroadcastModal } from "../../lib/types";

export default function AnnouncementsScreen() {
  const t = useTheme();
  const [items, setItems] = useState<BroadcastModal[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    isRefresh ? setRefreshing(true) : setLoading(true);
    setError(null);
    try {
      setItems(await broadcastModalService.list());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load announcements");
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

  async function handleCreate() {
    if (!title.trim() || !body.trim()) {
      Alert.alert("Missing info", "Title and body are required.");
      return;
    }
    setSaving(true);
    try {
      await broadcastModalService.create({
        title: title.trim(),
        body: body.trim(),
        theme: "indigo",
        title_size: "lg",
        modal_size: "md",
        icon: "megaphone",
        text_align: "center",
        show_glow: true,
        animation: "zoom",
        image_url: null,
        image_fit: "contain",
        effect: "none",
        badge_label: "Announcement",
        close_button_label: "Got it",
      });
      setModalOpen(false);
      setTitle("");
      setBody("");
      await load();
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to create");
    } finally {
      setSaving(false);
    }
  }

  async function handleTogglePublish(item: BroadcastModal) {
    try {
      if (item.is_published) await broadcastModalService.unpublish(item.id);
      else await broadcastModalService.publish(item.id);
      await load();
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to update");
    }
  }

  function confirmDelete(item: BroadcastModal) {
    Alert.alert("Delete announcement", `Remove "${item.title}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await broadcastModalService.delete(item.id);
            await load();
          } catch (e) {
            Alert.alert("Error", e instanceof Error ? e.message : "Failed to delete");
          }
        },
      },
    ]);
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Header title={`Announcements (${items.length})`} />
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
          contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={t.primary} />}
          ListEmptyComponent={<EmptyState icon="megaphone-outline" title="No announcements yet" />}
          renderItem={({ item }) => (
            <ListRow
              title={item.title}
              subtitle={item.body}
              onPress={() => handleTogglePublish(item)}
              right={
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Badge
                    label={item.is_published ? "Published" : "Draft"}
                    bg={item.is_published ? "#10b98126" : "#94a3b826"}
                    color={item.is_published ? "#047857" : "#64748b"}
                  />
                  <TouchableOpacity onPress={() => confirmDelete(item)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="trash-outline" size={18} color={t.danger} />
                  </TouchableOpacity>
                </View>
              }
            />
          )}
        />
      )}
      <Fab onPress={() => setModalOpen(true)} />

      <Modal visible={modalOpen} animationType="slide" onRequestClose={() => setModalOpen(false)}>
        <View style={{ flex: 1, backgroundColor: t.bg }}>
          <Header
            title="New Announcement"
            hideMenu
            right={
              <TouchableOpacity onPress={() => setModalOpen(false)}>
                <Ionicons name="close" size={24} color={t.text} />
              </TouchableOpacity>
            }
          />
          <ScrollView contentContainerStyle={{ padding: 16 }}>
            <Text style={{ color: t.textMuted, fontSize: 13, marginBottom: 12 }}>
              Tap an announcement in the list to publish/unpublish it.
            </Text>
            <TextField label="Title *" value={title} onChangeText={setTitle} />
            <TextField label="Body *" value={body} onChangeText={setBody} multiline />
            <Button title="Create Announcement" onPress={handleCreate} loading={saving} />
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}
