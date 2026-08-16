import React, { useState } from "react";
import { View, Text, ScrollView } from "react-native";
import { router } from "expo-router";
import { useTheme } from "../../lib/theme";
import { authService } from "../../lib/api";
import { TextField } from "../../components/FormField";
import { Button, ErrorBanner } from "../../components/ui";

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
    <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 24, backgroundColor: t.bg }}>
      <Text style={{ fontSize: 22, fontWeight: "700", color: t.text, marginBottom: 6 }}>Reset your password</Text>
      <Text style={{ fontSize: 14, color: t.textMuted, marginBottom: 24 }}>
        Enter your account email and we'll send a reset link.
      </Text>

      {error && (
        <View style={{ marginBottom: 14 }}>
          <ErrorBanner message={error} />
        </View>
      )}
      {sent && (
        <View style={{ marginBottom: 14 }}>
          <Text style={{ color: t.success, fontWeight: "600" }}>Check your email for a reset link.</Text>
        </View>
      )}

      <TextField label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
      <Button title="Send reset link" onPress={handleSubmit} loading={loading} />
      <Button title="Back to login" variant="ghost" onPress={() => router.back()} style={{ marginTop: 10 }} />
    </ScrollView>
  );
}
