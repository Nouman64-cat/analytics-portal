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
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../lib/theme";

// ─── Screen ─────────────────────────────────────────────────

export function Screen({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  return <View style={[{ flex: 1, backgroundColor: t.bg, padding: 16 }, style]}>{children}</View>;
}

// ─── Card ───────────────────────────────────────────────────

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: t.surface,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: t.border,
          padding: 15,
          shadowColor: t.shadow,
          shadowOpacity: Platform.OS === "ios" ? 0.06 : 0.14,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 3 },
          elevation: 2,
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
  return <Text style={[{ fontSize: 24, fontWeight: "800", color: t.text, letterSpacing: -0.3 }, style]}>{children}</Text>;
}

export function Subtitle({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  const t = useTheme();
  return <Text style={[{ fontSize: 14, color: t.textMuted, marginTop: 2 }, style]}>{children}</Text>;
}

export function Label({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  return (
    <Text style={{ fontSize: 11.5, fontWeight: "700", color: t.textMuted, marginBottom: 7, textTransform: "uppercase", letterSpacing: 0.6 }}>
      {children}
    </Text>
  );
}

export function SectionHeader({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  return (
    <Text style={{ fontSize: 13, fontWeight: "800", color: t.textMuted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10, marginTop: 4 }}>
      {children}
    </Text>
  );
}

// ─── Badge / status pill ────────────────────────────────────

export function Badge({ label, bg, color }: { label: string; bg: string; color: string }) {
  return (
    <View style={{ backgroundColor: bg, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, alignSelf: "flex-start" }}>
      <Text style={{ color, fontSize: 11.5, fontWeight: "700" }}>{label}</Text>
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
  const palette: Record<string, { bg: string; fg: string; border?: string; shadow?: boolean }> = {
    primary: { bg: t.primary, fg: t.primaryText, shadow: true },
    secondary: { bg: t.surfaceAlt, fg: t.text, border: t.border },
    danger: { bg: t.danger, fg: "#fff", shadow: true },
    ghost: { bg: "transparent", fg: t.primary },
  };
  const p = palette[variant];
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.8}
      style={[
        {
          backgroundColor: p.bg,
          borderColor: p.border,
          borderWidth: p.border ? 1 : 0,
          paddingVertical: 13,
          paddingHorizontal: 18,
          borderRadius: 12,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          opacity: disabled ? 0.5 : 1,
          ...(p.shadow
            ? {
                shadowColor: p.bg,
                shadowOpacity: 0.35,
                shadowRadius: 10,
                shadowOffset: { width: 0, height: 5 },
                elevation: 3,
              }
            : null),
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={p.fg} size="small" />
      ) : (
        <>
          {icon && <Ionicons name={icon} size={17} color={p.fg} />}
          <Text style={{ color: p.fg, fontWeight: "700", fontSize: 15 }}>{title}</Text>
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
    <View style={{ alignItems: "center", justifyContent: "center", paddingVertical: 56, paddingHorizontal: 24, gap: 10 }}>
      <View
        style={{
          width: 64,
          height: 64,
          borderRadius: 32,
          backgroundColor: t.surfaceAlt,
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 4,
        }}
      >
        <Ionicons name={icon} size={28} color={t.textMuted} />
      </View>
      <Text style={{ color: t.text, fontWeight: "700", fontSize: 16 }}>{title}</Text>
      {subtitle ? <Text style={{ color: t.textMuted, fontSize: 13, textAlign: "center", lineHeight: 18 }}>{subtitle}</Text> : null}
    </View>
  );
}

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const t = useTheme();
  return (
    <View style={{ backgroundColor: `${t.danger}17`, borderRadius: 14, padding: 14, gap: 10, borderWidth: 1, borderColor: `${t.danger}30` }}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
        <Ionicons name="alert-circle" size={18} color={t.danger} style={{ marginTop: 1 }} />
        <Text style={{ color: t.danger, fontWeight: "600", flex: 1, fontSize: 13.5, lineHeight: 18 }}>{message}</Text>
      </View>
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
      activeOpacity={0.6}
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 13,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: t.border,
        gap: 11,
      }}
    >
      {leftDot ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: leftDot }} /> : null}
      <View style={{ flex: 1 }}>
        <Text style={{ color: t.text, fontSize: 15, fontWeight: "600" }} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={{ color: t.textMuted, fontSize: 12.5, marginTop: 2.5 }} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
      {onPress && <Ionicons name="chevron-forward" size={17} color={t.textMuted} style={{ opacity: 0.6 }} />}
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
        bottom: 26,
        width: 58,
        height: 58,
        borderRadius: 29,
        backgroundColor: t.primary,
        alignItems: "center",
        justifyContent: "center",
        shadowColor: t.primary,
        shadowOpacity: 0.45,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 6 },
        elevation: 6,
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
        borderRadius: 12,
        paddingHorizontal: 13,
        gap: 8,
      }}
    >
      <Ionicons name="search" size={17} color={t.textMuted} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={t.textMuted}
        style={{ flex: 1, paddingVertical: 11, color: t.text, fontSize: 15 }}
      />
      {value.length > 0 && (
        <TouchableOpacity onPress={() => onChangeText("")} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="close-circle" size={17} color={t.textMuted} />
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── Stat tile ──────────────────────────────────────────────

export function StatTile({
  label,
  value,
  color,
  icon,
}: {
  label: string;
  value: string | number;
  color: string;
  icon?: React.ComponentProps<typeof Ionicons>["name"];
}) {
  const t = useTheme();
  return (
    <Card style={{ flex: 1, minWidth: 152, gap: 10 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={{ color: t.textMuted, fontSize: 11.5, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4, flex: 1 }} numberOfLines={1}>
          {label}
        </Text>
        <View
          style={{
            width: 30,
            height: 30,
            borderRadius: 9,
            backgroundColor: `${color}20`,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name={icon ?? "ellipse"} size={15} color={color} />
        </View>
      </View>
      <Text style={{ color: t.text, fontSize: 24, fontWeight: "800", letterSpacing: -0.5 }}>{value}</Text>
    </Card>
  );
}
