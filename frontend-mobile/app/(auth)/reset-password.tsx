import React, { useState } from "react";
import { View, Text, ScrollView } from "react-native";
import { router } from "expo-router";
import { useTheme } from "../../lib/theme";
import { authService } from "../../lib/api";
import { TextField } from "../../components/FormField";
import { Button, ErrorBanner } from "../../components/ui";

export default function ResetPasswordScreen() {
  const t = useTheme();
  const [tokenInput, setTokenInput] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit() {
    if (!tokenInput.trim() || newPassword.length < 8) {
      setError("Enter the reset token and a password of at least 8 characters.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await authService.resetPassword(tokenInput.trim(), newPassword);
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reset failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 24, backgroundColor: t.bg }}>
      <Text style={{ fontSize: 22, fontWeight: "700", color: t.text, marginBottom: 6 }}>Set a new password</Text>
      <Text style={{ fontSize: 14, color: t.textMuted, marginBottom: 24 }}>
        Paste the reset token from your email, then choose a new password.
      </Text>

      {error && (
        <View style={{ marginBottom: 14 }}>
          <ErrorBanner message={error} />
        </View>
      )}
      {done ? (
        <>
          <Text style={{ color: t.success, fontWeight: "600", marginBottom: 14 }}>
            Password reset. You can now sign in.
          </Text>
          <Button title="Go to login" onPress={() => router.replace("/login")} />
        </>
      ) : (
        <>
          <TextField label="Reset token" value={tokenInput} onChangeText={setTokenInput} autoCapitalize="none" />
          <TextField label="New password" value={newPassword} onChangeText={setNewPassword} secureTextEntry autoCapitalize="none" />
          <Button title="Reset password" onPress={handleSubmit} loading={loading} />
        </>
      )}
      <Button title="Back to login" variant="ghost" onPress={() => router.replace("/login")} style={{ marginTop: 10 }} />
    </ScrollView>
  );
}
