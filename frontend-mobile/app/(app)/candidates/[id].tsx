import React, { useCallback, useState } from "react";
import { View, Text, Image, ScrollView, Alert, RefreshControl } from "react-native";
import { router, useLocalSearchParams, useFocusEffect } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { Header } from "../../../components/Header";
import { Card, Label, Button, LoadingView, ErrorBanner, ListRow } from "../../../components/ui";
import { TextField, SwitchField } from "../../../components/FormField";
import { useTheme } from "../../../lib/theme";
import { candidatesService } from "../../../lib/api";
import type { CandidateWithInterviews } from "../../../lib/types";
import { prettify, formatDate } from "../../../lib/statusMeta";

export default function CandidateDetailScreen() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [candidate, setCandidate] = useState<CandidateWithInterviews | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  const load = useCallback(async (isRefresh = false) => {
    if (!id) return;
    isRefresh ? setRefreshing(true) : setLoading(true);
    setError(null);
    try {
      const data = await candidatesService.get(id);
      setCandidate(data);
      setName(data.name);
      setEmail(data.email ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load candidate");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function handleSave() {
    if (!id) return;
    setSaving(true);
    try {
      await candidatesService.update(id, { name: name.trim(), email: email.trim() || null });
      await load();
      Alert.alert("Saved", "Candidate updated.");
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleStatus() {
    if (!id) return;
    try {
      await candidatesService.toggleStatus(id);
      await load();
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to update status");
    }
  }

  async function handleAvatarPick() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed", "Photo library access is required to set an avatar.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8, allowsEditing: true });
    if (result.canceled || !result.assets?.[0] || !id) return;
    const asset = result.assets[0];
    setUploadingAvatar(true);
    try {
      await candidatesService.uploadAvatar(id, {
        uri: asset.uri,
        name: asset.fileName || "avatar.jpg",
        type: asset.mimeType || "image/jpeg",
      });
      await load();
    } catch (e) {
      Alert.alert("Upload failed", e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setUploadingAvatar(false);
    }
  }

  function confirmDelete() {
    Alert.alert("Delete candidate", "This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            if (id) await candidatesService.delete(id);
            router.back();
          } catch (e) {
            Alert.alert("Error", e instanceof Error ? e.message : "Failed to delete");
          }
        },
      },
    ]);
  }

  if (loading && !candidate) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <Header title="Candidate" showBack />
        <LoadingView />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Header title={candidate?.name ?? "Candidate"} showBack />
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 12 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={t.primary} />}
      >
        {error && <ErrorBanner message={error} onRetry={() => load()} />}
        {candidate && (
          <>
            <Card style={{ alignItems: "center", gap: 10 }}>
              {candidate.avatar_url ? (
                <Image source={{ uri: candidate.avatar_url }} style={{ width: 88, height: 88, borderRadius: 44 }} />
              ) : (
                <View
                  style={{
                    width: 88,
                    height: 88,
                    borderRadius: 44,
                    backgroundColor: candidate.color || t.primary,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text style={{ color: "#fff", fontWeight: "700", fontSize: 32 }}>{candidate.name.charAt(0).toUpperCase()}</Text>
                </View>
              )}
              <Button title="Change Photo" variant="secondary" loading={uploadingAvatar} onPress={handleAvatarPick} />
            </Card>

            <Card style={{ gap: 4 }}>
              <Label>Details</Label>
              <TextField label="Name" value={name} onChangeText={setName} />
              <TextField label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
              <SwitchField label="Active" value={candidate.is_active} onValueChange={handleToggleStatus} />
              <Button title="Save Changes" onPress={handleSave} loading={saving} />
            </Card>

            <Card style={{ gap: 8 }}>
              <Text style={{ color: t.text, fontWeight: "700", fontSize: 15 }}>
                Interviews ({candidate.interviews.length})
              </Text>
              {candidate.interviews.length === 0 && <Text style={{ color: t.textMuted }}>No interviews yet.</Text>}
              {candidate.interviews.map((iv) => (
                <ListRow
                  key={iv.id}
                  title={`${iv.company_name ?? "Unknown"} — ${iv.role}`}
                  subtitle={`${iv.round} • ${prettify(iv.computed_status)} • ${formatDate(iv.interview_date)}`}
                  onPress={() => router.push(`/interviews/${iv.id}`)}
                />
              ))}
            </Card>

            <Button title="Delete Candidate" variant="danger" icon="trash-outline" onPress={confirmDelete} />
          </>
        )}
      </ScrollView>
    </View>
  );
}
