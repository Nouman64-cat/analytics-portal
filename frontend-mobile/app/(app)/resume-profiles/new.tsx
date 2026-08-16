import React, { useEffect, useState } from "react";
import { View, ScrollView, Alert } from "react-native";
import { router } from "expo-router";
import { Header } from "../../../components/Header";
import { Button, ErrorBanner, LoadingView } from "../../../components/ui";
import { TextField, SelectField } from "../../../components/FormField";
import { useTheme } from "../../../lib/theme";
import { profilesService, departmentsService, businessDevelopersService } from "../../../lib/api";
import type { Department, BusinessDeveloper } from "../../../lib/types";

export default function NewResumeProfileScreen() {
  const t = useTheme();
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [bds, setBds] = useState<BusinessDeveloper[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [departmentId, setDepartmentId] = useState<string | null>(null);
  const [bdId, setBdId] = useState<string | null>(null);
  const [location, setLocation] = useState("");
  const [phone, setPhone] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const [depts, bdList] = await Promise.all([departmentsService.list(), businessDevelopersService.list()]);
        setDepartments(depts);
        setBds(bdList);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load form data");
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
      const created = await profilesService.create({
        name: name.trim(),
        department_id: departmentId,
        bd_id: bdId,
        location: location.trim(),
        phone: phone.trim(),
      });
      router.replace(`/resume-profiles/${created.id}`);
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to create resume profile");
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Header title="New Resume Profile" showBack />
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
          <SelectField label="Department" value={departmentId} onSelect={setDepartmentId} options={departments.map((d) => ({ label: d.name, value: d.id }))} placeholder="None" />
          <SelectField label="Business Developer" value={bdId} onSelect={setBdId} options={bds.map((b) => ({ label: b.name, value: b.id }))} placeholder="None" />
          <TextField label="Location" value={location} onChangeText={setLocation} />
          <TextField label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
          <Button title="Create Resume Profile" onPress={handleSubmit} loading={saving} />
        </ScrollView>
      )}
    </View>
  );
}
