import React, { useState } from "react";
import { View, ScrollView, Alert } from "react-native";
import { router } from "expo-router";
import { Header } from "../../../components/Header";
import { Button, ErrorBanner } from "../../../components/ui";
import { TextField, SwitchField } from "../../../components/FormField";
import { useTheme } from "../../../lib/theme";
import { companiesService } from "../../../lib/api";

export default function NewCompanyScreen() {
  const t = useTheme();
  const [name, setName] = useState("");
  const [detail, setDetail] = useState("");
  const [isStaffingFirm, setIsStaffingFirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!name.trim()) {
      Alert.alert("Missing info", "Company name is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const created = await companiesService.create({ name: name.trim(), detail: detail.trim(), is_staffing_firm: isStaffingFirm });
      router.replace(`/companies/${created.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create company");
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Header title="New Company" showBack />
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {error && (
          <View style={{ marginBottom: 12 }}>
            <ErrorBanner message={error} />
          </View>
        )}
        <TextField label="Name *" value={name} onChangeText={setName} />
        <TextField label="Detail" value={detail} onChangeText={setDetail} multiline />
        <SwitchField label="Staffing Firm" value={isStaffingFirm} onValueChange={setIsStaffingFirm} />
        <Button title="Create Company" onPress={handleSubmit} loading={saving} />
      </ScrollView>
    </View>
  );
}
