import React, { useState } from "react";
import { View, Text, ScrollView, Alert } from "react-native";
import { router } from "expo-router";
import { Header } from "../../components/Header";
import { Button, ErrorBanner } from "../../components/ui";
import { TextField } from "../../components/FormField";
import { useTheme } from "../../lib/theme";
import { useAuth } from "../../lib/AuthContext";
import { authService } from "../../lib/api";

export default function ChangePasswordScreen() {
  const t = useTheme();
  const { mustChangePassword, refreshMustChangeFlag } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }
    if (!mustChangePassword && !currentPassword) {
      setError("Enter your current password.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await authService.changePassword({
        current_password: mustChangePassword ? undefined : currentPassword,
        new_password: newPassword,
      });
      await refreshMustChangeFlag(false);
      Alert.alert("Password changed", "Your password has been updated.");
      if (router.canGoBack()) router.back();
      else router.replace("/(app)/");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to change password");
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Header title="Change Password" showBack={!mustChangePassword} hideMenu={mustChangePassword} />
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {mustChangePassword && (
          <Text style={{ color: t.textMuted, marginBottom: 14 }}>
            You must set a new password before continuing.
          </Text>
        )}
        {error && (
          <View style={{ marginBottom: 12 }}>
            <ErrorBanner message={error} />
          </View>
        )}
        {!mustChangePassword && (
          <TextField label="Current Password" value={currentPassword} onChangeText={setCurrentPassword} secureTextEntry autoCapitalize="none" />
        )}
        <TextField label="New Password" value={newPassword} onChangeText={setNewPassword} secureTextEntry autoCapitalize="none" />
        <Button title="Update Password" onPress={handleSubmit} loading={saving} />
      </ScrollView>
    </View>
  );
}
