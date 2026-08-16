import "react-native-gesture-handler";
import React, { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useColorScheme } from "react-native";
import { AuthProvider, useAuth } from "../lib/AuthContext";
import { LoadingView } from "../components/ui";

function RootNavigator() {
  const { loading, token, mustChangePassword } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    const segmentList = segments as string[];
    const inAuthGroup = segmentList[0] === "(auth)";

    if (!token && !inAuthGroup) {
      router.replace("/login");
    } else if (token && inAuthGroup) {
      router.replace("/(app)/");
    } else if (token && mustChangePassword && segmentList[1] !== "change-password") {
      router.replace("/(app)/change-password");
    }
  }, [loading, token, mustChangePassword, segments, router]);

  if (loading) return <LoadingView label="Loading…" />;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(app)" />
    </Stack>
  );
}

export default function RootLayout() {
  const scheme = useColorScheme();
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthProvider>
        <RootNavigator />
        <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      </AuthProvider>
    </GestureHandlerRootView>
  );
}
