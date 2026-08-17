import React, { useCallback, useState } from "react";
import { View, FlatList, RefreshControl, Modal, ScrollView, Alert, TouchableOpacity } from "react-native";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Header } from "../../../components/Header";
import { LoadingView, ErrorBanner, EmptyState, ListRow, Fab, Badge, Button } from "../../../components/ui";
import { TextField, SwitchField } from "../../../components/FormField";
import { useTheme } from "../../../lib/theme";
import { departmentsService } from "../../../lib/api";
import type { Department } from "../../../lib/types";
import { useAuth } from "../../../lib/AuthContext";
import { canManageDepartments, canViewDepartments } from "../../../lib/permissions";

export default function DepartmentsScreen() {
  const t = useTheme();
  const { payload } = useAuth();
  const role = payload?.role ?? null;
  const canView = canViewDepartments(role);
  const canManage = canManageDepartments(role);
  const [items, setItems] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Department | null>(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (!canView) {
      setLoading(false);
      return;
    }
    isRefresh ? setRefreshing(true) : setLoading(true);
    setError(null);
    try {
      setItems(await departmentsService.list());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load departments");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canView]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  function openCreate() {
    setEditing(null);
    setName("");
    setSlug("");
    setIsActive(true);
    setModalOpen(true);
  }

  function openEdit(d: Department) {
    setEditing(d);
    setName(d.name);
    setSlug(d.slug);
    setIsActive(d.is_active);
    setModalOpen(true);
  }

  async function handleSave() {
    if (!name.trim() || !slug.trim()) {
      Alert.alert("Missing info", "Name and slug are required.");
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await departmentsService.update(editing.id, { name: name.trim(), slug: slug.trim(), is_active: isActive });
      } else {
        await departmentsService.create({ name: name.trim(), slug: slug.trim(), is_active: isActive });
      }
      setModalOpen(false);
      await load();
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  function confirmDeactivate(d: Department) {
    Alert.alert("Deactivate department", `Deactivate ${d.name}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Deactivate",
        style: "destructive",
        onPress: async () => {
          try {
            await departmentsService.deactivate(d.id);
            await load();
          } catch (e) {
            Alert.alert("Error", e instanceof Error ? e.message : "Failed to deactivate");
          }
        },
      },
    ]);
  }

  if (!canView) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <Header title="Departments" />
        <EmptyState icon="lock-closed-outline" title="Access denied" subtitle="You don't have permission to view departments." />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Header title={`Departments (${items.length})`} />
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
          ListEmptyComponent={<EmptyState icon="layers-outline" title="No departments yet" />}
          renderItem={({ item }) => (
            <ListRow
              title={item.name}
              subtitle={`${item.slug} • ${item.user_count} user${item.user_count === 1 ? "" : "s"}`}
              onPress={canManage ? () => openEdit(item) : undefined}
              right={
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  {!item.is_active && <Badge label="Inactive" bg="#94a3b826" color="#64748b" />}
                  {canManage && (
                    <TouchableOpacity onPress={() => confirmDeactivate(item)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Ionicons name="trash-outline" size={18} color={t.danger} />
                    </TouchableOpacity>
                  )}
                </View>
              }
            />
          )}
        />
      )}
      {canManage && <Fab onPress={openCreate} />}

      <Modal visible={modalOpen} animationType="slide" onRequestClose={() => setModalOpen(false)}>
        <View style={{ flex: 1, backgroundColor: t.bg }}>
          <Header
            title={editing ? "Edit Department" : "New Department"}
            hideMenu
            right={
              <TouchableOpacity onPress={() => setModalOpen(false)}>
                <Ionicons name="close" size={24} color={t.text} />
              </TouchableOpacity>
            }
          />
          <ScrollView contentContainerStyle={{ padding: 16 }}>
            <TextField label="Name *" value={name} onChangeText={setName} />
            <TextField label="Slug *" value={slug} onChangeText={setSlug} autoCapitalize="none" placeholder="e.g. engineering" />
            <SwitchField label="Active" value={isActive} onValueChange={setIsActive} />
            <Button title={editing ? "Save Changes" : "Create"} onPress={handleSave} loading={saving} />
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}
