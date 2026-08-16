import React from "react";
import { View, Text, TouchableOpacity, ScrollView, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import type { DrawerContentComponentProps } from "expo-router/drawer";
import { useTheme } from "../lib/theme";
import { useAuth } from "../lib/AuthContext";
import { NAV_ITEMS } from "../lib/constants";
import { useDepartmentOptions } from "../lib/useDepartmentOptions";
import { SelectField } from "./FormField";

const SUPERADMIN_ONLY = new Set(["/departments", "/users", "/backup", "/announcements"]);

export function DrawerContent(props: DrawerContentComponentProps) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { payload, logout } = useAuth();
  const role = payload?.role ?? null;
  const activeRoute = props.state.routeNames[props.state.index];

  const items = NAV_ITEMS.filter((item) => role === "superadmin" || !SUPERADMIN_ONLY.has(item.href));
  const { departments, showSwitcher, departmentId, setDepartmentId } = useDepartmentOptions();

  function confirmLogout() {
    Alert.alert("Log out", "Are you sure you want to log out?", [
      { text: "Cancel", style: "cancel" },
      { text: "Log out", style: "destructive", onPress: () => logout() },
    ]);
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.surface }}>
      <LinearGradient
        colors={[t.gradientFrom, t.gradientTo]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ paddingTop: insets.top + 22, paddingBottom: 20, paddingHorizontal: 18 }}
      >
        <View
          style={{
            width: 46,
            height: 46,
            borderRadius: 13,
            backgroundColor: "#ffffff2a",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 12,
          }}
        >
          <Ionicons name="analytics" size={23} color="#fff" />
        </View>
        <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }} numberOfLines={1}>
          {payload?.email ?? "Signed in"}
        </Text>
        <Text style={{ color: "#ffffffb0", fontSize: 12, marginTop: 2, textTransform: "capitalize", fontWeight: "600" }}>
          {role ?? ""}
        </Text>
      </LinearGradient>

      {showSwitcher && (
        <View style={{ paddingHorizontal: 14, paddingTop: 14 }}>
          <SelectField
            label="Department"
            value={departmentId}
            onSelect={setDepartmentId}
            options={departments.map((d) => ({ label: d.name, value: d.id }))}
            placeholder="Select department"
          />
        </View>
      )}

      <ScrollView contentContainerStyle={{ paddingVertical: 6, paddingHorizontal: 10 }} showsVerticalScrollIndicator={false}>
        {items.map((item) => {
          const routeName = item.href === "/" ? "index" : item.href.slice(1);
          const focused = activeRoute === routeName;
          return (
            <TouchableOpacity
              key={item.href}
              onPress={() => props.navigation.navigate(routeName)}
              activeOpacity={0.65}
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingVertical: 11,
                paddingHorizontal: 12,
                marginVertical: 1.5,
                borderRadius: 11,
                gap: 13,
                backgroundColor: focused ? `${t.primary}1c` : "transparent",
              }}
            >
              <View
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 9,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: focused ? t.primary : "transparent",
                }}
              >
                <Ionicons name={item.icon} size={18} color={focused ? t.primaryText : t.textMuted} />
              </View>
              <Text style={{ color: focused ? t.primary : t.text, fontSize: 14.5, fontWeight: focused ? "700" : "500" }}>
                {item.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <TouchableOpacity
        onPress={confirmLogout}
        activeOpacity={0.7}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 13,
          marginHorizontal: 14,
          paddingHorizontal: 12,
          paddingVertical: 13,
          marginBottom: insets.bottom + 10,
          borderRadius: 12,
          backgroundColor: `${t.danger}12`,
        }}
      >
        <Ionicons name="log-out-outline" size={19} color={t.danger} />
        <Text style={{ color: t.danger, fontSize: 14.5, fontWeight: "700" }}>Log out</Text>
      </TouchableOpacity>
    </View>
  );
}
