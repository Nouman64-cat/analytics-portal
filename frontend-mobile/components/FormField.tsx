import React, { useState } from "react";
import { View, Text, TextInput, Switch, Modal, FlatList, TouchableOpacity, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../lib/theme";
import { Label } from "./ui";

export function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  multiline,
  keyboardType,
  autoCapitalize = "sentences",
}: {
  label?: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  multiline?: boolean;
  keyboardType?: "default" | "email-address" | "numeric" | "phone-pad";
  autoCapitalize?: "none" | "sentences" | "words";
}) {
  const t = useTheme();
  return (
    <View style={{ marginBottom: 14 }}>
      {label ? <Label>{label}</Label> : null}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={t.textMuted}
        secureTextEntry={secureTextEntry}
        multiline={multiline}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        style={{
          backgroundColor: t.surfaceAlt,
          borderWidth: 1,
          borderColor: t.border,
          borderRadius: 10,
          paddingHorizontal: 12,
          paddingVertical: multiline ? 10 : 11,
          color: t.text,
          fontSize: 15,
          minHeight: multiline ? 90 : undefined,
          textAlignVertical: multiline ? "top" : "center",
        }}
      />
    </View>
  );
}

export function SwitchField({
  label,
  value,
  onValueChange,
}: {
  label: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
}) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
      <Text style={{ color: t.text, fontSize: 15, fontWeight: "500" }}>{label}</Text>
      <Switch value={value} onValueChange={onValueChange} trackColor={{ true: t.primary }} />
    </View>
  );
}

export interface SelectOption {
  label: string;
  value: string;
}

export function SelectField({
  label,
  value,
  options,
  onSelect,
  placeholder = "Select…",
}: {
  label?: string;
  value: string | null;
  options: SelectOption[];
  onSelect: (value: string) => void;
  placeholder?: string;
}) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  return (
    <View style={{ marginBottom: 14 }}>
      {label ? <Label>{label}</Label> : null}
      <TouchableOpacity
        onPress={() => setOpen(true)}
        style={{
          backgroundColor: t.surfaceAlt,
          borderWidth: 1,
          borderColor: t.border,
          borderRadius: 10,
          paddingHorizontal: 12,
          paddingVertical: 12,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Text style={{ color: selected ? t.text : t.textMuted, fontSize: 15 }}>
          {selected ? selected.label : placeholder}
        </Text>
        <Ionicons name="chevron-down" size={18} color={t.textMuted} />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: "#00000066", justifyContent: "flex-end" }}
          activeOpacity={1}
          onPress={() => setOpen(false)}
        >
          <View style={{ backgroundColor: t.surface, borderTopLeftRadius: 18, borderTopRightRadius: 18, maxHeight: "70%", paddingBottom: 24 }}>
            <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: t.border }}>
              <Text style={{ color: t.text, fontWeight: "700", fontSize: 16 }}>{label || "Select"}</Text>
            </View>
            <FlatList
              data={options}
              keyExtractor={(item) => item.value}
              renderItem={({ item }) => (
                <TouchableOpacity
                  onPress={() => {
                    onSelect(item.value);
                    setOpen(false);
                  }}
                  style={{
                    paddingVertical: 14,
                    paddingHorizontal: 16,
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <Text style={{ color: t.text, fontSize: 15 }}>{item.label}</Text>
                  {item.value === value && <Ionicons name="checkmark" size={18} color={t.primary} />}
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <Text style={{ color: t.textMuted, padding: 16 }}>No options available</Text>
              }
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

export function MultiSelectField({
  label,
  values,
  options,
  onChange,
  placeholder = "None selected",
}: {
  label?: string;
  values: string[];
  options: SelectOption[];
  onChange: (values: string[]) => void;
  placeholder?: string;
}) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  const selectedLabels = options.filter((o) => values.includes(o.value)).map((o) => o.label);

  function toggle(value: string) {
    onChange(values.includes(value) ? values.filter((v) => v !== value) : [...values, value]);
  }

  return (
    <View style={{ marginBottom: 14 }}>
      {label ? <Label>{label}</Label> : null}
      <TouchableOpacity
        onPress={() => setOpen(true)}
        style={{
          backgroundColor: t.surfaceAlt,
          borderWidth: 1,
          borderColor: t.border,
          borderRadius: 10,
          paddingHorizontal: 12,
          paddingVertical: 12,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Text style={{ color: selectedLabels.length ? t.text : t.textMuted, fontSize: 15, flex: 1 }} numberOfLines={1}>
          {selectedLabels.length ? selectedLabels.join(", ") : placeholder}
        </Text>
        <Ionicons name="chevron-down" size={18} color={t.textMuted} />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: "#00000066", justifyContent: "flex-end" }}
          activeOpacity={1}
          onPress={() => setOpen(false)}
        >
          <View style={{ backgroundColor: t.surface, borderTopLeftRadius: 18, borderTopRightRadius: 18, maxHeight: "70%", paddingBottom: 24 }}>
            <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: t.border, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={{ color: t.text, fontWeight: "700", fontSize: 16 }}>{label || "Select"}</Text>
              <TouchableOpacity onPress={() => setOpen(false)}>
                <Text style={{ color: t.primary, fontWeight: "600" }}>Done</Text>
              </TouchableOpacity>
            </View>
            <ScrollView>
              {options.length === 0 && <Text style={{ color: t.textMuted, padding: 16 }}>No options available</Text>}
              {options.map((item) => (
                <TouchableOpacity
                  key={item.value}
                  onPress={() => toggle(item.value)}
                  style={{
                    paddingVertical: 14,
                    paddingHorizontal: 16,
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <Text style={{ color: t.text, fontSize: 15 }}>{item.label}</Text>
                  {values.includes(item.value) && <Ionicons name="checkmark" size={18} color={t.primary} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}
