import React, { useCallback, useState } from "react";
import { View, Text, ScrollView, Alert, Linking, RefreshControl } from "react-native";
import { router, useLocalSearchParams, useFocusEffect } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import { Header } from "../../../components/Header";
import { Card, Label, Button, LoadingView, ErrorBanner } from "../../../components/ui";
import { TextField, SelectField, SwitchField } from "../../../components/FormField";
import { useTheme } from "../../../lib/theme";
import { profilesService, departmentsService, businessDevelopersService } from "../../../lib/api";
import type { ResumeProfile, Department, BusinessDeveloper } from "../../../lib/types";

export default function ResumeProfileDetailScreen() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [profile, setProfile] = useState<ResumeProfile | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [bds, setBds] = useState<BusinessDeveloper[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [form, setForm] = useState({
    name: "",
    department_id: null as string | null,
    bd_id: null as string | null,
    linkedin_url: "",
    github_url: "",
    portfolio_url: "",
    location: "",
    phone: "",
    visa_status: "",
    is_active: true,
  });

  const load = useCallback(async (isRefresh = false) => {
    if (!id) return;
    isRefresh ? setRefreshing(true) : setLoading(true);
    setError(null);
    try {
      const [data, depts, bdList] = await Promise.all([
        profilesService.get(id),
        departmentsService.list(),
        businessDevelopersService.list(),
      ]);
      setProfile(data);
      setDepartments(depts);
      setBds(bdList);
      setForm({
        name: data.name,
        department_id: data.department_id,
        bd_id: data.bd_id,
        linkedin_url: data.linkedin_url ?? "",
        github_url: data.github_url ?? "",
        portfolio_url: data.portfolio_url ?? "",
        location: data.location ?? "",
        phone: data.phone ?? "",
        visa_status: data.visa_status ?? "",
        is_active: data.is_active,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load resume profile");
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

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSave() {
    if (!id) return;
    setSaving(true);
    try {
      await profilesService.update(id, {
        name: form.name.trim(),
        department_id: form.department_id,
        bd_id: form.bd_id,
        linkedin_url: form.linkedin_url.trim(),
        github_url: form.github_url.trim(),
        portfolio_url: form.portfolio_url.trim(),
        location: form.location.trim(),
        phone: form.phone.trim(),
        visa_status: form.visa_status.trim(),
      });
      await load();
      Alert.alert("Saved", "Resume profile updated.");
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleStatus() {
    if (!id) return;
    try {
      await profilesService.toggleStatus(id);
      await load();
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to update status");
    }
  }

  async function handleUploadResume() {
    const result = await DocumentPicker.getDocumentAsync({ multiple: false, copyToCacheDirectory: true });
    if (result.canceled || !result.assets?.[0] || !id) return;
    const asset = result.assets[0];
    setUploading(true);
    try {
      await profilesService.uploadResume(id, {
        uri: asset.uri,
        name: asset.name,
        type: asset.mimeType || "application/octet-stream",
      });
      await load();
    } catch (e) {
      Alert.alert("Upload failed", e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setUploading(false);
    }
  }

  function confirmDelete() {
    Alert.alert("Delete resume profile", "This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            if (id) await profilesService.delete(id);
            router.back();
          } catch (e) {
            Alert.alert("Error", e instanceof Error ? e.message : "Failed to delete");
          }
        },
      },
    ]);
  }

  if (loading && !profile) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <Header title="Resume Profile" showBack />
        <LoadingView />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Header title={profile?.name ?? "Resume Profile"} showBack />
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={t.primary} />}
      >
        {error && <ErrorBanner message={error} onRetry={() => load()} />}
        {profile && (
          <>
            <Card style={{ gap: 4 }}>
              <Label>Details</Label>
              <TextField label="Name" value={form.name} onChangeText={(v) => set("name", v)} />
              <SelectField
                label="Department"
                value={form.department_id}
                onSelect={(v) => set("department_id", v)}
                options={departments.map((d) => ({ label: d.name, value: d.id }))}
                placeholder="None"
              />
              <SelectField
                label="Business Developer"
                value={form.bd_id}
                onSelect={(v) => set("bd_id", v)}
                options={bds.map((b) => ({ label: b.name, value: b.id }))}
                placeholder="None"
              />
              <TextField label="Location" value={form.location} onChangeText={(v) => set("location", v)} />
              <TextField label="Phone" value={form.phone} onChangeText={(v) => set("phone", v)} keyboardType="phone-pad" />
              <TextField label="Visa Status" value={form.visa_status} onChangeText={(v) => set("visa_status", v)} />
              <TextField label="LinkedIn URL" value={form.linkedin_url} onChangeText={(v) => set("linkedin_url", v)} autoCapitalize="none" />
              <TextField label="GitHub URL" value={form.github_url} onChangeText={(v) => set("github_url", v)} autoCapitalize="none" />
              <TextField label="Portfolio URL" value={form.portfolio_url} onChangeText={(v) => set("portfolio_url", v)} autoCapitalize="none" />
              <SwitchField label="Active" value={profile.is_active} onValueChange={handleToggleStatus} />
              <Button title="Save Changes" onPress={handleSave} loading={saving} />
            </Card>

            <Card style={{ gap: 8 }}>
              <Label>Resume File</Label>
              <Button
                title={profile.resume_url ? "Replace Resume" : "Upload Resume"}
                variant="secondary"
                icon="document-attach-outline"
                loading={uploading}
                onPress={handleUploadResume}
              />
              {profile.resume_url ? (
                <Button title="Open Resume" variant="ghost" onPress={() => Linking.openURL(profile.resume_url!)} />
              ) : null}
            </Card>

            <Button title="Delete Resume Profile" variant="danger" icon="trash-outline" onPress={confirmDelete} />
          </>
        )}
      </ScrollView>
    </View>
  );
}
