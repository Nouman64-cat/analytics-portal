import React, { useState } from "react";
import { View, Text, KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import { Link } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../lib/AuthContext";
import { useTheme } from "../../lib/theme";
import { TextField } from "../../components/FormField";
import { Button, ErrorBanner } from "../../components/ui";

export default function LoginScreen() {
  const t = useTheme();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogin() {
    setError(null);
    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }
    setLoading(true);
    try {
      await login(email.trim(), password);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: t.bg }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 24 }}>
        <View style={{ alignItems: "center", marginBottom: 32 }}>
          <View
            style={{
              width: 64,
              height: 64,
              borderRadius: 18,
              backgroundColor: t.primary,
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 14,
            }}
          >
            <Ionicons name="analytics" size={32} color={t.primaryText} />
          </View>
          <Text style={{ fontSize: 24, fontWeight: "700", color: t.text }}>Analytics Portal</Text>
          <Text style={{ fontSize: 14, color: t.textMuted, marginTop: 4 }}>Sign in to your account</Text>
        </View>

        {error && (
          <View style={{ marginBottom: 14 }}>
            <ErrorBanner message={error} />
          </View>
        )}

        <TextField
          label="Email"
          value={email}
          onChangeText={setEmail}
          placeholder="you@company.com"
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <TextField
          label="Password"
          value={password}
          onChangeText={setPassword}
          placeholder="••••••••"
          secureTextEntry
          autoCapitalize="none"
        />

        <Button title="Sign In" onPress={handleLogin} loading={loading} style={{ marginTop: 6 }} />

        <Link href="/forgot-password" asChild>
          <Text style={{ color: t.primary, textAlign: "center", marginTop: 18, fontSize: 14, fontWeight: "500" }}>
            Forgot your password?
          </Text>
        </Link>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
