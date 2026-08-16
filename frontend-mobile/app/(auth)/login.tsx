import React, { useState } from "react";
import { View, Text, KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import { Link } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useAuth } from "../../lib/AuthContext";
import { useTheme } from "../../lib/theme";
import { TextField } from "../../components/FormField";
import { Button, ErrorBanner, Card } from "../../components/ui";

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
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <LinearGradient
        colors={[t.gradientFrom, t.gradientTo]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ height: "42%", position: "absolute", top: 0, left: 0, right: 0 }}
      />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 24 }} keyboardShouldPersistTaps="handled">
          <View style={{ alignItems: "center", marginBottom: 28 }}>
            <View
              style={{
                width: 72,
                height: 72,
                borderRadius: 20,
                backgroundColor: "#ffffff28",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 16,
                borderWidth: 1,
                borderColor: "#ffffff3a",
              }}
            >
              <Ionicons name="analytics" size={36} color="#fff" />
            </View>
            <Text style={{ fontSize: 24, fontWeight: "800", color: "#fff", letterSpacing: -0.3 }}>Analytics Portal</Text>
            <Text style={{ fontSize: 14, color: "#ffffffcc", marginTop: 4, fontWeight: "500" }}>Sign in to your account</Text>
          </View>

          <Card style={{ gap: 2 }}>
            {error && (
              <View style={{ marginBottom: 4 }}>
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

            <Button title="Sign In" icon="log-in-outline" onPress={handleLogin} loading={loading} style={{ marginTop: 6 }} />
          </Card>

          <Link href="/forgot-password" asChild>
            <Text style={{ color: t.text, textAlign: "center", marginTop: 20, fontSize: 14, fontWeight: "600" }}>
              Forgot your password?
            </Text>
          </Link>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
