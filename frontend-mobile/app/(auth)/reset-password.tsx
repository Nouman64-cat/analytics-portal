import React, { useState } from "react";
import { View, Text, ScrollView, KeyboardAvoidingView, Platform, TouchableOpacity } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../lib/theme";
import { authService } from "../../lib/api";
import { TextField } from "../../components/FormField";
import { Button, ErrorBanner, Card } from "../../components/ui";

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
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.bg }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 24 }} keyboardShouldPersistTaps="handled">
        <TouchableOpacity onPress={() => router.replace("/login")} style={{ position: "absolute", top: 24, left: 20, padding: 6 }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="arrow-back" size={22} color={t.text} />
        </TouchableOpacity>

        <View style={{ alignItems: "center", marginBottom: 20 }}>
          <View style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: `${t.primary}1c`, alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
            <Ionicons name="lock-closed-outline" size={24} color={t.primary} />
          </View>
          <Text style={{ fontSize: 21, fontWeight: "800", color: t.text }}>Set a new password</Text>
          <Text style={{ fontSize: 13.5, color: t.textMuted, marginTop: 6, textAlign: "center", lineHeight: 19 }}>
            Paste the reset token from your email, then choose a new password.
          </Text>
        </View>

        <Card style={{ gap: 2 }}>
          {error && (
            <View style={{ marginBottom: 4 }}>
              <ErrorBanner message={error} />
            </View>
          )}
          {done ? (
            <>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 14 }}>
                <Ionicons name="checkmark-circle" size={18} color={t.success} />
                <Text style={{ color: t.success, fontWeight: "600", flex: 1 }}>Password reset. You can now sign in.</Text>
              </View>
              <Button title="Go to login" onPress={() => router.replace("/login")} />
            </>
          ) : (
            <>
              <TextField label="Reset token" value={tokenInput} onChangeText={setTokenInput} autoCapitalize="none" />
              <TextField label="New password" value={newPassword} onChangeText={setNewPassword} secureTextEntry autoCapitalize="none" />
              <Button title="Reset password" icon="checkmark-circle-outline" onPress={handleSubmit} loading={loading} />
            </>
          )}
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
