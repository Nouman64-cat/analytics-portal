import React, { useCallback, useState } from "react";
import { View, Text, ScrollView, Alert, RefreshControl } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Header } from "../../components/Header";
import { Card, Label, Button, LoadingView, ErrorBanner } from "../../components/ui";
import { TextField } from "../../components/FormField";
import { useTheme } from "../../lib/theme";
import { authService } from "../../lib/api";
import type { User } from "../../lib/types";
import { prettify } from "../../lib/statusMeta";

export default function ProfileScreen() {
  const t = useTheme();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [fullName, setFullName] = useState("");

  const load = useCallback(async (isRefresh = false) => {
    isRefresh ? setRefreshing(true) : setLoading(true);
    setError(null);
    try {
      const me = await authService.getMe();
      setUser(me);
      setFullName(me.full_name);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load profile");
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

  async function handleSave() {
    if (!fullName.trim()) return;
    setSaving(true);
    try {
      await authService.updateProfile({ full_name: fullName.trim() });
      await load();
      Alert.alert("Saved", "Profile updated.");
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Header title="Profile" />
      {loading && !user ? (
        <LoadingView />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, gap: 12 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={t.primary} />}
        >
          {error && <ErrorBanner message={error} onRetry={() => load()} />}
          {user && (
            <>
              <Card style={{ alignItems: "center", gap: 6, paddingVertical: 24 }}>
                <View
                  style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: t.primary, alignItems: "center", justifyContent: "center" }}
                >
                  <Text style={{ color: t.primaryText, fontSize: 26, fontWeight: "700" }}>
                    {user.full_name.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <Text style={{ color: t.text, fontWeight: "700", fontSize: 17, marginTop: 6 }}>{user.full_name}</Text>
                <Text style={{ color: t.textMuted, fontSize: 13 }}>{user.email}</Text>
                <Text style={{ color: t.textMuted, fontSize: 12, textTransform: "capitalize" }}>{prettify(user.role)}</Text>
              </Card>

              <Card style={{ gap: 4 }}>
                <Label>Edit Name</Label>
                <TextField label="Full Name" value={fullName} onChangeText={setFullName} />
                <Button title="Save Changes" onPress={handleSave} loading={saving} />
              </Card>

              <Button title="Change Password" variant="secondary" icon="key-outline" onPress={() => router.push("/change-password")} />
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}
