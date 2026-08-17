import React, { useCallback, useState } from "react";
import { View, Text, FlatList, RefreshControl, Modal, ScrollView, Alert, TouchableOpacity } from "react-native";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Header } from "../../components/Header";
import { LoadingView, ErrorBanner, EmptyState, ListRow, Fab, Badge, Button, Label } from "../../components/ui";
import { TextField, SwitchField, SelectField } from "../../components/FormField";
import type { SelectOption } from "../../components/FormField";
import { useTheme } from "../../lib/theme";
import { broadcastModalService } from "../../lib/api";
import type {
  BroadcastModal,
  BroadcastTheme,
  BroadcastTitleSize,
  BroadcastModalSize,
  BroadcastTextAlign,
  BroadcastAnimation,
  BroadcastImageFit,
  BroadcastEffect,
} from "../../lib/types";

/** Mirrors frontend/components/BroadcastModalViewer.tsx BROADCAST_THEMES / BROADCAST_ICON_LIST keys — keep in sync so the web viewer renders what was picked here. */
const THEME_OPTIONS: SelectOption[] = [
  { label: "Indigo", value: "indigo" },
  { label: "Emerald", value: "emerald" },
  { label: "Rose", value: "rose" },
  { label: "Amber", value: "amber" },
  { label: "Sky", value: "sky" },
  { label: "Violet", value: "violet" },
];
const TITLE_SIZE_OPTIONS: SelectOption[] = [
  { label: "Small", value: "sm" },
  { label: "Medium", value: "md" },
  { label: "Large", value: "lg" },
  { label: "Extra Large", value: "xl" },
];
const MODAL_SIZE_OPTIONS: SelectOption[] = [
  { label: "Narrow", value: "sm" },
  { label: "Medium", value: "md" },
  { label: "Wide", value: "lg" },
];
const TEXT_ALIGN_OPTIONS: SelectOption[] = [
  { label: "Left", value: "left" },
  { label: "Center", value: "center" },
];
const ANIMATION_OPTIONS: SelectOption[] = [
  { label: "Zoom", value: "zoom" },
  { label: "Slide", value: "slide" },
  { label: "Fade", value: "fade" },
];
const IMAGE_FIT_OPTIONS: SelectOption[] = [
  { label: "Contain", value: "contain" },
  { label: "Cover", value: "cover" },
];
const EFFECT_OPTIONS: SelectOption[] = [
  { label: "None", value: "none" },
  { label: "Confetti", value: "confetti" },
  { label: "Fireworks", value: "fireworks" },
  { label: "Snow", value: "snow" },
  { label: "Stars", value: "stars" },
];
const ICON_OPTIONS: SelectOption[] = [
  "Megaphone",
  "Bell",
  "BellRing",
  "AlertTriangle",
  "AlertCircle",
  "Info",
  "Star",
  "Trophy",
  "Zap",
  "Heart",
  "Sparkles",
  "Flame",
  "Rocket",
  "ShieldAlert",
].map((key) => ({ label: key, value: key }));

const DEFAULTS = {
  theme: "indigo" as BroadcastTheme,
  titleSize: "lg" as BroadcastTitleSize,
  modalSize: "md" as BroadcastModalSize,
  icon: "Megaphone",
  textAlign: "center" as BroadcastTextAlign,
  showGlow: true,
  animation: "zoom" as BroadcastAnimation,
  imageUrl: "",
  imageFit: "contain" as BroadcastImageFit,
  effect: "none" as BroadcastEffect,
  badgeLabel: "Announcement",
  closeButtonLabel: "Got it",
};

export default function AnnouncementsScreen() {
  const t = useTheme();
  const [items, setItems] = useState<BroadcastModal[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<BroadcastModal | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [theme, setTheme] = useState<BroadcastTheme>(DEFAULTS.theme);
  const [titleSize, setTitleSize] = useState<BroadcastTitleSize>(DEFAULTS.titleSize);
  const [modalSize, setModalSize] = useState<BroadcastModalSize>(DEFAULTS.modalSize);
  const [icon, setIcon] = useState(DEFAULTS.icon);
  const [textAlign, setTextAlign] = useState<BroadcastTextAlign>(DEFAULTS.textAlign);
  const [showGlow, setShowGlow] = useState(DEFAULTS.showGlow);
  const [animation, setAnimation] = useState<BroadcastAnimation>(DEFAULTS.animation);
  const [imageUrl, setImageUrl] = useState(DEFAULTS.imageUrl);
  const [imageFit, setImageFit] = useState<BroadcastImageFit>(DEFAULTS.imageFit);
  const [effect, setEffect] = useState<BroadcastEffect>(DEFAULTS.effect);
  const [badgeLabel, setBadgeLabel] = useState(DEFAULTS.badgeLabel);
  const [closeButtonLabel, setCloseButtonLabel] = useState(DEFAULTS.closeButtonLabel);
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

  function openCreate() {
    setEditing(null);
    setTitle("");
    setBody("");
    setTheme(DEFAULTS.theme);
    setTitleSize(DEFAULTS.titleSize);
    setModalSize(DEFAULTS.modalSize);
    setIcon(DEFAULTS.icon);
    setTextAlign(DEFAULTS.textAlign);
    setShowGlow(DEFAULTS.showGlow);
    setAnimation(DEFAULTS.animation);
    setImageUrl(DEFAULTS.imageUrl);
    setImageFit(DEFAULTS.imageFit);
    setEffect(DEFAULTS.effect);
    setBadgeLabel(DEFAULTS.badgeLabel);
    setCloseButtonLabel(DEFAULTS.closeButtonLabel);
    setModalOpen(true);
  }

  function openEdit(item: BroadcastModal) {
    setEditing(item);
    setTitle(item.title);
    setBody(item.body);
    setTheme(item.theme);
    setTitleSize(item.title_size);
    setModalSize(item.modal_size);
    setIcon(item.icon);
    setTextAlign(item.text_align);
    setShowGlow(item.show_glow);
    setAnimation(item.animation);
    setImageUrl(item.image_url ?? "");
    setImageFit(item.image_fit);
    setEffect(item.effect);
    setBadgeLabel(item.badge_label);
    setCloseButtonLabel(item.close_button_label);
    setModalOpen(true);
  }

  async function handleSave() {
    if (!title.trim() || !body.trim()) {
      Alert.alert("Missing info", "Title and body are required.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        body: body.trim(),
        theme,
        title_size: titleSize,
        modal_size: modalSize,
        icon,
        text_align: textAlign,
        show_glow: showGlow,
        animation,
        image_url: imageUrl.trim() || null,
        image_fit: imageFit,
        effect,
        badge_label: badgeLabel.trim() || "Announcement",
        close_button_label: closeButtonLabel.trim() || "Got it",
      };
      if (editing) {
        await broadcastModalService.update(editing.id, payload);
      } else {
        await broadcastModalService.create(payload);
      }
      setModalOpen(false);
      await load();
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to save");
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
              onPress={() => openEdit(item)}
              right={
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <TouchableOpacity onPress={() => handleTogglePublish(item)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Badge
                      label={item.is_published ? "Published" : "Draft"}
                      bg={item.is_published ? "#10b98126" : "#94a3b826"}
                      color={item.is_published ? "#047857" : "#64748b"}
                    />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => confirmDelete(item)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="trash-outline" size={18} color={t.danger} />
                  </TouchableOpacity>
                </View>
              }
            />
          )}
        />
      )}
      <Fab onPress={openCreate} />

      <Modal visible={modalOpen} animationType="slide" onRequestClose={() => setModalOpen(false)}>
        <View style={{ flex: 1, backgroundColor: t.bg }}>
          <Header
            title={editing ? "Edit Announcement" : "New Announcement"}
            hideMenu
            right={
              <TouchableOpacity onPress={() => setModalOpen(false)}>
                <Ionicons name="close" size={24} color={t.text} />
              </TouchableOpacity>
            }
          />
          <ScrollView contentContainerStyle={{ padding: 16 }}>
            <Text style={{ color: t.textMuted, fontSize: 13, marginBottom: 12 }}>
              Tap the Published/Draft badge on a row to publish or unpublish it.
            </Text>
            <TextField label="Title *" value={title} onChangeText={setTitle} />
            <TextField label="Body *" value={body} onChangeText={setBody} multiline />

            <Label>Appearance</Label>
            <SelectField label="Theme" value={theme} onSelect={(v) => setTheme(v as BroadcastTheme)} options={THEME_OPTIONS} />
            <SelectField label="Icon" value={icon} onSelect={setIcon} options={ICON_OPTIONS} />
            <SelectField label="Title Size" value={titleSize} onSelect={(v) => setTitleSize(v as BroadcastTitleSize)} options={TITLE_SIZE_OPTIONS} />
            <SelectField label="Modal Size" value={modalSize} onSelect={(v) => setModalSize(v as BroadcastModalSize)} options={MODAL_SIZE_OPTIONS} />
            <SelectField label="Text Align" value={textAlign} onSelect={(v) => setTextAlign(v as BroadcastTextAlign)} options={TEXT_ALIGN_OPTIONS} />
            <SelectField label="Animation" value={animation} onSelect={(v) => setAnimation(v as BroadcastAnimation)} options={ANIMATION_OPTIONS} />
            <SelectField label="Effect" value={effect} onSelect={(v) => setEffect(v as BroadcastEffect)} options={EFFECT_OPTIONS} />
            <SwitchField label="Glow" value={showGlow} onValueChange={setShowGlow} />

            <Label>Image (optional)</Label>
            <TextField label="Image URL" value={imageUrl} onChangeText={setImageUrl} autoCapitalize="none" placeholder="https://…" />
            <SelectField label="Image Fit" value={imageFit} onSelect={(v) => setImageFit(v as BroadcastImageFit)} options={IMAGE_FIT_OPTIONS} />

            <Label>Labels</Label>
            <TextField label="Badge Label" value={badgeLabel} onChangeText={setBadgeLabel} />
            <TextField label="Close Button Label" value={closeButtonLabel} onChangeText={setCloseButtonLabel} />

            <Button title={editing ? "Save Changes" : "Create Announcement"} onPress={handleSave} loading={saving} style={{ marginTop: 8 }} />
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}
