import React, { useCallback, useState } from "react";
import { View, Text, FlatList, RefreshControl, Modal, ScrollView, Alert, TouchableOpacity } from "react-native";
import { useFocusEffect } from "expo-router";
import { Header } from "../../../components/Header";
import { LoadingView, ErrorBanner, EmptyState, ListRow, Fab, Badge, Button } from "../../../components/ui";
import { TextField, MultiSelectField } from "../../../components/FormField";
import { useTheme } from "../../../lib/theme";
import { businessDevelopersService, departmentsService } from "../../../lib/api";
import type { BusinessDeveloper, Department } from "../../../lib/types";
import { Ionicons } from "@expo/vector-icons";

export default function BusinessDevelopersScreen() {
  const t = useTheme();
  const [items, setItems] = useState<BusinessDeveloper[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<BusinessDeveloper | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [deptIds, setDeptIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    isRefresh ? setRefreshing(true) : setLoading(true);
    setError(null);
    try {
      const [bds, depts] = await Promise.all([businessDevelopersService.list(), departmentsService.list()]);
      setItems(bds);
      setDepartments(depts);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load business developers");
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
    setName("");
    setEmail("");
    setDeptIds([]);
    setModalOpen(true);
  }

  function openEdit(bd: BusinessDeveloper) {
    setEditing(bd);
    setName(bd.name);
    setEmail(bd.email ?? "");
    setDeptIds(bd.department_ids ?? []);
    setModalOpen(true);
  }

  async function handleSave() {
    if (!name.trim()) {
      Alert.alert("Missing info", "Name is required.");
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await businessDevelopersService.update(editing.id, { name: name.trim(), email: email.trim() || null, department_ids: deptIds });
      } else {
        await businessDevelopersService.create({ name: name.trim(), email: email.trim() || null, department_ids: deptIds });
      }
      setModalOpen(false);
      await load();
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  function confirmDelete(bd: BusinessDeveloper) {
    Alert.alert("Delete business developer", `Remove ${bd.name}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await businessDevelopersService.delete(bd.id);
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
      <Header title={`Business Devs (${items.length})`} />
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
          ListEmptyComponent={<EmptyState icon="briefcase-outline" title="No business developers yet" />}
          renderItem={({ item }) => (
            <ListRow
              title={item.name}
              subtitle={item.email || undefined}
              onPress={() => openEdit(item)}
              right={
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  {!item.is_active && <Badge label="Inactive" bg="#94a3b826" color="#64748b" />}
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
            title={editing ? "Edit Business Developer" : "New Business Developer"}
            hideMenu
            right={
              <TouchableOpacity onPress={() => setModalOpen(false)}>
                <Ionicons name="close" size={24} color={t.text} />
              </TouchableOpacity>
            }
          />
          <ScrollView contentContainerStyle={{ padding: 16 }}>
            <TextField label="Name *" value={name} onChangeText={setName} />
            <TextField label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
            <MultiSelectField label="Departments" values={deptIds} onChange={setDeptIds} options={departments.map((d) => ({ label: d.name, value: d.id }))} />
            <Button title={editing ? "Save Changes" : "Create"} onPress={handleSave} loading={saving} />
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}
