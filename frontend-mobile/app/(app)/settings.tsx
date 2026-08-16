import React, { useCallback, useState } from "react";
import { View, ScrollView, Alert, RefreshControl } from "react-native";
import { useFocusEffect } from "expo-router";
import { Header } from "../../components/Header";
import { Card, Label, Button, LoadingView, ErrorBanner } from "../../components/ui";
import { TextField, SwitchField } from "../../components/FormField";
import { useTheme } from "../../lib/theme";
import { authService } from "../../lib/api";
import type { User } from "../../lib/types";

export default function SettingsScreen() {
  const t = useTheme();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [alarmEnabled, setAlarmEnabled] = useState(false);
  const [glassmorphism, setGlassmorphism] = useState(false);
  const [accentColor, setAccentColor] = useState("");

  const load = useCallback(async (isRefresh = false) => {
    isRefresh ? setRefreshing(true) : setLoading(true);
    setError(null);
    try {
      const me = await authService.getMe();
      setUser(me);
      setAlarmEnabled(me.alarm_enabled);
      setGlassmorphism(me.glassmorphism_enabled);
      setAccentColor(me.accent_color ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load settings");
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
    setSaving(true);
    try {
      await authService.updateSettings({
        alarm_enabled: alarmEnabled,
        glassmorphism_enabled: glassmorphism,
        accent_color: accentColor.trim() || null,
      });
      Alert.alert("Saved", "Settings updated.");
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Header title="Settings" />
      {loading && !user ? (
        <LoadingView />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, gap: 12 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={t.primary} />}
        >
          {error && <ErrorBanner message={error} onRetry={() => load()} />}
          <Card style={{ gap: 4 }}>
            <Label>Preferences</Label>
            <SwitchField label="Interview Alarm Notifications" value={alarmEnabled} onValueChange={setAlarmEnabled} />
            <SwitchField label="Glassmorphism Theme" value={glassmorphism} onValueChange={setGlassmorphism} />
            <TextField label="Accent Color (hex)" value={accentColor} onChangeText={setAccentColor} placeholder="#6366f1" autoCapitalize="none" />
            <Button title="Save Settings" onPress={handleSave} loading={saving} />
          </Card>
        </ScrollView>
      )}
    </View>
  );
}
