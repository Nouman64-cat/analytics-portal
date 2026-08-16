import React from "react";
import { View, Text, TouchableOpacity, ScrollView, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import type { DrawerContentComponentProps } from "expo-router/drawer";
import { useTheme } from "../lib/theme";
import { useAuth } from "../lib/AuthContext";
import { NAV_ITEMS } from "../lib/constants";

const SUPERADMIN_ONLY = new Set(["/departments", "/users", "/backup", "/announcements"]);

export function DrawerContent(props: DrawerContentComponentProps) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { payload, logout } = useAuth();
  const role = payload?.role ?? null;
  const activeRoute = props.state.routeNames[props.state.index];

  const items = NAV_ITEMS.filter((item) => role === "superadmin" || !SUPERADMIN_ONLY.has(item.href));

  function confirmLogout() {
    Alert.alert("Log out", "Are you sure you want to log out?", [
      { text: "Cancel", style: "cancel" },
      { text: "Log out", style: "destructive", onPress: () => logout() },
    ]);
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.surface }}>
      <View
        style={{
          paddingTop: insets.top + 20,
          paddingBottom: 18,
          paddingHorizontal: 18,
          borderBottomWidth: 1,
          borderBottomColor: t.border,
        }}
      >
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            backgroundColor: t.primary,
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 10,
          }}
        >
          <Ionicons name="analytics" size={22} color={t.primaryText} />
        </View>
        <Text style={{ color: t.text, fontWeight: "700", fontSize: 15 }} numberOfLines={1}>
          {payload?.email ?? "Signed in"}
        </Text>
        <Text style={{ color: t.textMuted, fontSize: 12, marginTop: 2, textTransform: "capitalize" }}>
          {role ?? ""}
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingVertical: 8 }}>
        {items.map((item) => {
          const routeName = item.href === "/" ? "index" : item.href.slice(1);
          const focused = activeRoute === routeName;
          return (
            <TouchableOpacity
              key={item.href}
              onPress={() => props.navigation.navigate(routeName)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingVertical: 12,
                paddingHorizontal: 18,
                gap: 14,
                backgroundColor: focused ? `${t.primary}1f` : "transparent",
              }}
            >
              <Ionicons name={item.icon} size={20} color={focused ? t.primary : t.textMuted} />
              <Text style={{ color: focused ? t.primary : t.text, fontSize: 15, fontWeight: focused ? "700" : "500" }}>
                {item.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <TouchableOpacity
        onPress={confirmLogout}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 14,
          paddingHorizontal: 18,
          paddingVertical: 16,
          paddingBottom: insets.bottom + 16,
          borderTopWidth: 1,
          borderTopColor: t.border,
        }}
      >
        <Ionicons name="log-out-outline" size={20} color={t.danger} />
        <Text style={{ color: t.danger, fontSize: 15, fontWeight: "600" }}>Log out</Text>
      </TouchableOpacity>
    </View>
  );
}
