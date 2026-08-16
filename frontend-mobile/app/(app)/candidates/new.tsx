import React, { useEffect, useState } from "react";
import { View, ScrollView, Alert } from "react-native";
import { router } from "expo-router";
import { Header } from "../../../components/Header";
import { Button, ErrorBanner, LoadingView } from "../../../components/ui";
import { TextField, MultiSelectField } from "../../../components/FormField";
import { useTheme } from "../../../lib/theme";
import { candidatesService, departmentsService } from "../../../lib/api";
import type { Department } from "../../../lib/types";

export default function NewCandidateScreen() {
  const t = useTheme();
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [departments, setDepartments] = useState<Department[]>([]);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [departmentIds, setDepartmentIds] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      try {
        setDepartments(await departmentsService.list());
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load departments");
      } finally {
        setLoadingOptions(false);
      }
    })();
  }, []);

  async function handleSubmit() {
    if (!name.trim()) {
      Alert.alert("Missing info", "Name is required.");
      return;
    }
    setSaving(true);
    try {
      const created = await candidatesService.create({
        name: name.trim(),
        email: email.trim() || null,
        department_ids: departmentIds,
      });
      router.replace(`/candidates/${created.id}`);
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to create candidate");
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Header title="New Candidate" showBack />
      {loadingOptions ? (
        <LoadingView />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          {error && (
            <View style={{ marginBottom: 12 }}>
              <ErrorBanner message={error} />
            </View>
          )}
          <TextField label="Name *" value={name} onChangeText={setName} />
          <TextField label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
          <MultiSelectField
            label="Departments"
            values={departmentIds}
            onChange={setDepartmentIds}
            options={departments.map((d) => ({ label: d.name, value: d.id }))}
          />
          <Button title="Create Candidate" onPress={handleSubmit} loading={saving} />
        </ScrollView>
      )}
    </View>
  );
}
