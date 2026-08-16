import React, { useState } from "react";
import { View, Text, ScrollView, KeyboardAvoidingView, Platform, TouchableOpacity } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../lib/theme";
import { authService } from "../../lib/api";
import { TextField } from "../../components/FormField";
import { Button, ErrorBanner, Card } from "../../components/ui";

export default function ForgotPasswordScreen() {
  const t = useTheme();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function handleSubmit() {
    if (!email.trim()) {
      setError("Enter your email.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await authService.forgotPassword(email.trim());
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.bg }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 24 }} keyboardShouldPersistTaps="handled">
        <TouchableOpacity onPress={() => router.back()} style={{ position: "absolute", top: 24, left: 20, padding: 6 }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="arrow-back" size={22} color={t.text} />
        </TouchableOpacity>

        <View style={{ alignItems: "center", marginBottom: 20 }}>
          <View style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: `${t.primary}1c`, alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
            <Ionicons name="key-outline" size={26} color={t.primary} />
          </View>
          <Text style={{ fontSize: 21, fontWeight: "800", color: t.text }}>Reset your password</Text>
          <Text style={{ fontSize: 13.5, color: t.textMuted, marginTop: 6, textAlign: "center", lineHeight: 19 }}>
            Enter your account email and we'll send a reset link.
          </Text>
        </View>

        <Card style={{ gap: 2 }}>
          {error && (
            <View style={{ marginBottom: 4 }}>
              <ErrorBanner message={error} />
            </View>
          )}
          {sent && (
            <View style={{ marginBottom: 12, flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Ionicons name="checkmark-circle" size={18} color={t.success} />
              <Text style={{ color: t.success, fontWeight: "600", flex: 1 }}>Check your email for a reset link.</Text>
            </View>
          )}

          <TextField label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
          <Button title="Send reset link" icon="paper-plane-outline" onPress={handleSubmit} loading={loading} />
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
