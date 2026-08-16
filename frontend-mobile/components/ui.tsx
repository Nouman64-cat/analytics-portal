import React from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  ViewStyle,
  StyleProp,
  TextStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../lib/theme";

// ─── Screen ─────────────────────────────────────────────────

export function Screen({
  children,
  style,
  scroll,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  scroll?: boolean;
}) {
  const t = useTheme();
  return (
    <View style={[{ flex: 1, backgroundColor: t.bg, padding: 16 }, style]}>{children}</View>
  );
}

// ─── Card ───────────────────────────────────────────────────

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: t.surface,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: t.border,
          padding: 14,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

// ─── Text helpers ───────────────────────────────────────────

export function Title({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  const t = useTheme();
  return <Text style={[{ fontSize: 22, fontWeight: "700", color: t.text }, style]}>{children}</Text>;
}

export function Subtitle({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  const t = useTheme();
  return <Text style={[{ fontSize: 14, color: t.textMuted, marginTop: 2 }, style]}>{children}</Text>;
}

export function Label({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  return (
    <Text style={{ fontSize: 12, fontWeight: "600", color: t.textMuted, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.4 }}>
      {children}
    </Text>
  );
}

// ─── Badge / status pill ────────────────────────────────────

export function Badge({ label, bg, color }: { label: string; bg: string; color: string }) {
  return (
    <View style={{ backgroundColor: bg, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, alignSelf: "flex-start" }}>
      <Text style={{ color, fontSize: 12, fontWeight: "600" }}>{label}</Text>
    </View>
  );
}

// ─── Button ─────────────────────────────────────────────────

export function Button({
  title,
  onPress,
  variant = "primary",
  loading,
  disabled,
  icon,
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  loading?: boolean;
  disabled?: boolean;
  icon?: React.ComponentProps<typeof Ionicons>["name"];
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  const palette: Record<string, { bg: string; fg: string; border?: string }> = {
    primary: { bg: t.primary, fg: t.primaryText },
    secondary: { bg: t.surfaceAlt, fg: t.text, border: t.border },
    danger: { bg: t.danger, fg: "#fff" },
    ghost: { bg: "transparent", fg: t.primary },
  };
  const p = palette[variant];
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.75}
      style={[
        {
          backgroundColor: p.bg,
          borderColor: p.border,
          borderWidth: p.border ? 1 : 0,
          paddingVertical: 12,
          paddingHorizontal: 16,
          borderRadius: 10,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          opacity: disabled ? 0.5 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={p.fg} size="small" />
      ) : (
        <>
          {icon && <Ionicons name={icon} size={17} color={p.fg} />}
          <Text style={{ color: p.fg, fontWeight: "600", fontSize: 15 }}>{title}</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

// ─── State views ────────────────────────────────────────────

export function LoadingView({ label }: { label?: string }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 10 }}>
      <ActivityIndicator size="large" color={t.primary} />
      {label ? <Text style={{ color: t.textMuted }}>{label}</Text> : null}
    </View>
  );
}

export function EmptyState({ icon = "file-tray-outline", title, subtitle }: { icon?: React.ComponentProps<typeof Ionicons>["name"]; title: string; subtitle?: string }) {
  const t = useTheme();
  return (
    <View style={{ alignItems: "center", justifyContent: "center", paddingVertical: 48, gap: 8 }}>
      <Ionicons name={icon} size={40} color={t.textMuted} />
      <Text style={{ color: t.text, fontWeight: "600", fontSize: 16 }}>{title}</Text>
      {subtitle ? <Text style={{ color: t.textMuted, fontSize: 13, textAlign: "center" }}>{subtitle}</Text> : null}
    </View>
  );
}

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const t = useTheme();
  return (
    <View style={{ backgroundColor: `${t.danger}1a`, borderRadius: 12, padding: 14, gap: 8 }}>
      <Text style={{ color: t.danger, fontWeight: "600" }}>{message}</Text>
      {onRetry && <Button title="Retry" variant="secondary" onPress={onRetry} />}
    </View>
  );
}

// ─── List row ───────────────────────────────────────────────

export function ListRow({
  title,
  subtitle,
  right,
  onPress,
  leftDot,
}: {
  title: string;
  subtitle?: string | null;
  right?: React.ReactNode;
  onPress?: () => void;
  leftDot?: string;
}) {
  const t = useTheme();
  const Wrapper = onPress ? TouchableOpacity : View;
  return (
    <Wrapper
      onPress={onPress}
      activeOpacity={0.7}
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: t.border,
        gap: 10,
      }}
    >
      {leftDot ? <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: leftDot }} /> : null}
      <View style={{ flex: 1 }}>
        <Text style={{ color: t.text, fontSize: 15, fontWeight: "600" }} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={{ color: t.textMuted, fontSize: 13, marginTop: 2 }} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
      {onPress && <Ionicons name="chevron-forward" size={18} color={t.textMuted} />}
    </Wrapper>
  );
}

// ─── Floating action button ─────────────────────────────────

export function Fab({ onPress, icon = "add" }: { onPress: () => void; icon?: React.ComponentProps<typeof Ionicons>["name"] }) {
  const t = useTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={{
        position: "absolute",
        right: 20,
        bottom: 24,
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: t.primary,
        alignItems: "center",
        justifyContent: "center",
        shadowColor: "#000",
        shadowOpacity: 0.25,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 4 },
        elevation: 5,
      }}
    >
      <Ionicons name={icon} size={26} color={t.primaryText} />
    </TouchableOpacity>
  );
}

// ─── Search bar ─────────────────────────────────────────────

export function SearchBar({ value, onChangeText, placeholder = "Search…" }: { value: string; onChangeText: (v: string) => void; placeholder?: string }) {
  const t = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: t.surfaceAlt,
        borderWidth: 1,
        borderColor: t.border,
        borderRadius: 10,
        paddingHorizontal: 12,
        gap: 8,
      }}
    >
      <Ionicons name="search" size={17} color={t.textMuted} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={t.textMuted}
        style={{ flex: 1, paddingVertical: 10, color: t.text, fontSize: 15 }}
      />
    </View>
  );
}

// ─── Stat tile ──────────────────────────────────────────────

export function StatTile({ label, value, color }: { label: string; value: string | number; color: string }) {
  const t = useTheme();
  return (
    <Card style={{ flex: 1, minWidth: 140, borderLeftWidth: 4, borderLeftColor: color }}>
      <Text style={{ color: t.textMuted, fontSize: 12, fontWeight: "600" }}>{label}</Text>
      <Text style={{ color: t.text, fontSize: 24, fontWeight: "700", marginTop: 4 }}>{value}</Text>
    </Card>
  );
}
