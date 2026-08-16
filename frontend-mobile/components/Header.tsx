import React from "react";
import { View, Text, TouchableOpacity, Platform } from "react-native";
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
        paddingTop: insets.top + 10,
        paddingBottom: 14,
        paddingHorizontal: 14,
        backgroundColor: t.surface,
        borderBottomWidth: 1,
        borderBottomColor: t.border,
        flexDirection: "row",
        alignItems: "center",
        shadowColor: t.shadow,
        shadowOpacity: Platform.OS === "ios" ? 0.04 : 0.1,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
        elevation: 1,
      }}
    >
      {!hideMenu ? (
        <TouchableOpacity
          onPress={() => (showBack ? router.back() : navigation.dispatch(OPEN_DRAWER))}
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            backgroundColor: t.surfaceAlt,
            alignItems: "center",
            justifyContent: "center",
            marginRight: 10,
          }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name={showBack ? "arrow-back" : "menu"} size={20} color={t.text} />
        </TouchableOpacity>
      ) : null}
      <Text style={{ flex: 1, fontSize: 19, fontWeight: "800", color: t.text, letterSpacing: -0.3 }} numberOfLines={1}>
        {title}
      </Text>
      {right}
    </View>
  );
}
