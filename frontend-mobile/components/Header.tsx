import React from "react";
import { View, Text, TouchableOpacity, Platform, StatusBar as RNStatusBar } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, router } from "expo-router";
import { useTheme } from "../lib/theme";

/** Plain action object (avoids importing @react-navigation/native, which expo-router forks internally as of SDK 56). */
const OPEN_DRAWER = { type: "OPEN_DRAWER" } as const;

export function Header({
  title,
  showBack,
  right,
  hideMenu,
}: {
  title: string;
  showBack?: boolean;
  right?: React.ReactNode;
  /** Hide the left icon entirely (e.g. inside a modal sheet where neither back nor drawer applies). */
  hideMenu?: boolean;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();

  return (
    <View
      style={{
        paddingTop: insets.top + (Platform.OS === "android" ? (RNStatusBar.currentHeight ?? 0) * 0 : 0) + 10,
        paddingBottom: 12,
        paddingHorizontal: 12,
        backgroundColor: t.surface,
        borderBottomWidth: 1,
        borderBottomColor: t.border,
        flexDirection: "row",
        alignItems: "center",
      }}
    >
      {!hideMenu && (
        <TouchableOpacity
          onPress={() => (showBack ? router.back() : navigation.dispatch(OPEN_DRAWER))}
          style={{ padding: 6, marginRight: 6 }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name={showBack ? "arrow-back" : "menu"} size={24} color={t.text} />
        </TouchableOpacity>
      )}
      <Text style={{ flex: 1, fontSize: 18, fontWeight: "700", color: t.text }} numberOfLines={1}>
        {title}
      </Text>
      {right}
    </View>
  );
}
