import React, { useCallback, useState } from "react";
import { View, Text, ScrollView, Alert, RefreshControl } from "react-native";
import { router, useLocalSearchParams, useFocusEffect } from "expo-router";
import { Header } from "../../../components/Header";
import { Card, Label, Button, LoadingView, ErrorBanner, ListRow } from "../../../components/ui";
import { TextField, SwitchField } from "../../../components/FormField";
import { useTheme } from "../../../lib/theme";
import { companiesService } from "../../../lib/api";
import type { CompanyWithInterviews } from "../../../lib/types";
import { prettify, formatDate } from "../../../lib/statusMeta";

export default function CompanyDetailScreen() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [company, setCompany] = useState<CompanyWithInterviews | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [detail, setDetail] = useState("");
  const [isStaffingFirm, setIsStaffingFirm] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (!id) return;
    isRefresh ? setRefreshing(true) : setLoading(true);
    setError(null);
    try {
      const data = await companiesService.get(id);
      setCompany(data);
      setName(data.name);
      setDetail(data.detail ?? "");
      setIsStaffingFirm(data.is_staffing_firm);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load company");
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
      await companiesService.update(id, { name: name.trim(), detail: detail.trim(), is_staffing_firm: isStaffingFirm });
      await load();
      Alert.alert("Saved", "Company updated.");
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  function confirmDelete() {
    Alert.alert("Delete company", "This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            if (id) await companiesService.delete(id);
            router.back();
          } catch (e) {
            Alert.alert("Error", e instanceof Error ? e.message : "Failed to delete");
          }
        },
      },
    ]);
  }

  if (loading && !company) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <Header title="Company" showBack />
        <LoadingView />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Header title={company?.name ?? "Company"} showBack />
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 12 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={t.primary} />}
      >
        {error && <ErrorBanner message={error} onRetry={() => load()} />}
        {company && (
          <>
            <Card style={{ gap: 4 }}>
              <Label>Details</Label>
              <TextField label="Name" value={name} onChangeText={setName} />
              <TextField label="Detail" value={detail} onChangeText={setDetail} multiline />
              <SwitchField label="Staffing Firm" value={isStaffingFirm} onValueChange={setIsStaffingFirm} />
              <Button title="Save Changes" onPress={handleSave} loading={saving} />
            </Card>

            <Card style={{ gap: 8 }}>
              <Text style={{ color: t.text, fontWeight: "700", fontSize: 15 }}>
                Interviews ({company.interviews.length})
              </Text>
              {company.interviews.length === 0 && <Text style={{ color: t.textMuted }}>No interviews yet.</Text>}
              {company.interviews.map((iv) => (
                <ListRow
                  key={iv.id}
                  title={`${iv.candidate_name ?? "Unassigned"} — ${iv.role}`}
                  subtitle={`${iv.round} • ${prettify(iv.computed_status)} • ${formatDate(iv.interview_date)}`}
                  onPress={() => router.push(`/interviews/${iv.id}`)}
                />
              ))}
            </Card>

            <Button title="Delete Company" variant="danger" icon="trash-outline" onPress={confirmDelete} />
          </>
        )}
      </ScrollView>
    </View>
  );
}
