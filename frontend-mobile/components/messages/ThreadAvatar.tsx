import React from "react";
import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../lib/theme";
import type { MessageThreadKind } from "../../lib/types";
import { colorFor, initialsFor } from "./avatarColor";

export function ThreadAvatar({
  title,
  kind,
  size = 40,
}: {
  title: string;
  kind: MessageThreadKind;
  size?: number;
}) {
  const t = useTheme();

  if (kind === "channel") {
    return (
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: t.surfaceAlt,
        }}
      >
        <Ionicons name="at-outline" size={Math.round(size * 0.5)} color={t.textMuted} />
      </View>
    );
  }

  if (kind === "group") {
    return (
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: `${t.primary}20`,
        }}
      >
        <Ionicons name="people-outline" size={Math.round(size * 0.5)} color={t.primary} />
      </View>
    );
  }

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: colorFor(title),
      }}
    >
      <Text style={{ color: "#fff", fontWeight: "700", fontSize: Math.max(10, Math.round(size * 0.36)) }}>
        {initialsFor(title)}
      </Text>
    </View>
  );
}
