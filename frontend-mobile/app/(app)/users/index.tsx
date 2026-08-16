import React, { useCallback, useState } from "react";
import { View, FlatList, RefreshControl, Modal, ScrollView, Alert, TouchableOpacity } from "react-native";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Header } from "../../../components/Header";
import { LoadingView, ErrorBanner, EmptyState, ListRow, Fab, Badge, Button } from "../../../components/ui";
import { TextField, SelectField, SwitchField } from "../../../components/FormField";
import { useTheme } from "../../../lib/theme";
import { usersService, departmentsService } from "../../../lib/api";
import type { User, Department } from "../../../lib/types";
import { prettify } from "../../../lib/statusMeta";

const ROLES = [
  "superadmin",
  "bd",
  "manager",
  "team-member",
  "dept-lead",
  "bd-team-lead",
  "bd-manager",
  "guest",
  "tech-stack-manager",
].map((v) => ({ label: prettify(v), value: v }));

export default function UsersScreen() {
  const t = useTheme();
  const [items, setItems] = useState<User[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<string | null>("bd");
  const [departmentId, setDepartmentId] = useState<string | null>(null);
  const [canBroadcast, setCanBroadcast] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    isRefresh ? setRefreshing(true) : setLoading(true);
    setError(null);
    try {
      const [u, d] = await Promise.all([usersService.list(), departmentsService.list()]);
      setItems(u);
      setDepartments(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load users");
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
    setEmail("");
    setFullName("");
    setRole("bd");
    setDepartmentId(null);
    setCanBroadcast(false);
    setModalOpen(true);
  }

  function openEdit(u: User) {
    setEditing(u);
    setEmail(u.email);
    setFullName(u.full_name);
    setRole(u.role);
    setDepartmentId(u.department_id);
    setCanBroadcast(u.can_broadcast);
    setModalOpen(true);
  }

  async function handleSave() {
    if (!email.trim() || !fullName.trim() || !role) {
      Alert.alert("Missing info", "Email, name, and role are required.");
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await usersService.update(editing.id, {
          email: email.trim(),
          full_name: fullName.trim(),
          role,
          department_id: departmentId,
          can_broadcast: canBroadcast,
        });
      } else {
        await usersService.create({
          email: email.trim(),
          full_name: fullName.trim(),
          role,
          department_id: departmentId,
          allowed_dept_ids: null,
          can_broadcast: canBroadcast,
        });
      }
      setModalOpen(false);
      await load();
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(u: User) {
    try {
      await usersService.toggleActive(u.id);
      await load();
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to update user");
    }
  }

  function confirmDelete(u: User) {
    Alert.alert("Delete user", `Remove ${u.full_name}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await usersService.delete(u.id);
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
      <Header title={`Users (${items.length})`} />
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
          ListEmptyComponent={<EmptyState icon="person-outline" title="No users yet" />}
          renderItem={({ item }) => (
            <ListRow
              title={item.full_name}
              subtitle={`${item.email} • ${prettify(item.role)}`}
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
            title={editing ? "Edit User" : "New User"}
            hideMenu
            right={
              <TouchableOpacity onPress={() => setModalOpen(false)}>
                <Ionicons name="close" size={24} color={t.text} />
              </TouchableOpacity>
            }
          />
          <ScrollView contentContainerStyle={{ padding: 16 }}>
            <TextField label="Email *" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
            <TextField label="Full Name *" value={fullName} onChangeText={setFullName} />
            <SelectField label="Role *" value={role} onSelect={setRole} options={ROLES} />
            <SelectField label="Department" value={departmentId} onSelect={setDepartmentId} options={departments.map((d) => ({ label: d.name, value: d.id }))} placeholder="None" />
            <SwitchField label="Can Broadcast Announcements" value={canBroadcast} onValueChange={setCanBroadcast} />
            {editing && <SwitchField label="Active" value={editing.is_active} onValueChange={() => handleToggleActive(editing)} />}
            <Button title={editing ? "Save Changes" : "Create User"} onPress={handleSave} loading={saving} />
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}
