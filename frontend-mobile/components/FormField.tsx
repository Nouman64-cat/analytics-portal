import React, { useMemo, useState } from "react";
import { View, Text, TextInput, Switch, Modal, FlatList, TouchableOpacity, ScrollView, ActivityIndicator } from "react-native";
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

/** Search box shown at the top of a select's bottom sheet — lets you type to shortlist options. */
function ModalSearchBox({ value, onChangeText, autoFocus }: { value: string; onChangeText: (v: string) => void; autoFocus?: boolean }) {
  const t = useTheme();
  return (
    <View
      style={{
        margin: 14,
        marginBottom: 8,
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: t.surfaceAlt,
        borderWidth: 1,
        borderColor: t.border,
        borderRadius: 11,
        paddingHorizontal: 12,
        gap: 8,
      }}
    >
      <Ionicons name="search" size={16} color={t.textMuted} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder="Type to filter…"
        placeholderTextColor={t.textMuted}
        autoFocus={autoFocus}
        style={{ flex: 1, paddingVertical: 10, color: t.text, fontSize: 15 }}
      />
      {value.length > 0 && (
        <TouchableOpacity onPress={() => onChangeText("")} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="close-circle" size={16} color={t.textMuted} />
        </TouchableOpacity>
      )}
    </View>
  );
}

export function SelectField({
  label,
  value,
  options,
  onSelect,
  placeholder = "Select…",
  onCreate,
  createLabel = "company",
}: {
  label?: string;
  value: string | null;
  options: SelectOption[];
  onSelect: (value: string) => void;
  placeholder?: string;
  /** When provided, typing a name that doesn't match any option shows a "Create …" row that calls this and selects the result. */
  onCreate?: (query: string) => Promise<SelectOption | null>;
  /** Noun used in the "Create ..." row, e.g. "company". */
  createLabel?: string;
}) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const selected = options.find((o) => o.value === value);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  const trimmed = query.trim();
  const exactMatch = options.some((o) => o.label.toLowerCase() === trimmed.toLowerCase());
  const showCreate = !!onCreate && trimmed.length > 0 && !exactMatch;

  function close() {
    setOpen(false);
    setQuery("");
  }

  async function handleCreate() {
    if (!onCreate || !trimmed || creating) return;
    setCreating(true);
    try {
      const created = await onCreate(trimmed);
      if (created) {
        onSelect(created.value);
        close();
      }
    } finally {
      setCreating(false);
    }
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
        <Text style={{ color: selected ? t.text : t.textMuted, fontSize: 15 }}>
          {selected ? selected.label : placeholder}
        </Text>
        <Ionicons name="chevron-down" size={18} color={t.textMuted} />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
        <TouchableOpacity style={{ flex: 1, backgroundColor: "#00000066", justifyContent: "flex-end" }} activeOpacity={1} onPress={close}>
          <TouchableOpacity activeOpacity={1} style={{ backgroundColor: t.surface, borderTopLeftRadius: 18, borderTopRightRadius: 18, maxHeight: "78%", paddingBottom: 24 }}>
            <View style={{ paddingHorizontal: 16, paddingTop: 16, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={{ color: t.text, fontWeight: "700", fontSize: 16 }}>{label || "Select"}</Text>
              <TouchableOpacity onPress={close}>
                <Ionicons name="close" size={22} color={t.textMuted} />
              </TouchableOpacity>
            </View>

            <ModalSearchBox value={query} onChangeText={setQuery} />

            <FlatList
              data={filtered}
              keyExtractor={(item) => item.value}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <TouchableOpacity
                  onPress={() => {
                    onSelect(item.value);
                    close();
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
                showCreate ? null : <Text style={{ color: t.textMuted, padding: 16 }}>No options found</Text>
              }
              ListFooterComponent={
                showCreate ? (
                  <TouchableOpacity
                    onPress={handleCreate}
                    disabled={creating}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                      paddingVertical: 14,
                      paddingHorizontal: 16,
                      borderTopWidth: filtered.length > 0 ? 1 : 0,
                      borderTopColor: t.border,
                      opacity: creating ? 0.6 : 1,
                    }}
                  >
                    {creating ? <ActivityIndicator size="small" color={t.primary} /> : <Ionicons name="add-circle" size={18} color={t.primary} />}
                    <Text style={{ color: t.primary, fontWeight: "700", fontSize: 15 }}>
                      Create {createLabel} &ldquo;{trimmed}&rdquo;
                    </Text>
                  </TouchableOpacity>
                ) : null
              }
            />
          </TouchableOpacity>
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
  const [query, setQuery] = useState("");
  const selectedLabels = options.filter((o) => values.includes(o.value)).map((o) => o.label);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  function toggle(value: string) {
    onChange(values.includes(value) ? values.filter((v) => v !== value) : [...values, value]);
  }

  function close() {
    setOpen(false);
    setQuery("");
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

      <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
        <TouchableOpacity style={{ flex: 1, backgroundColor: "#00000066", justifyContent: "flex-end" }} activeOpacity={1} onPress={close}>
          <TouchableOpacity activeOpacity={1} style={{ backgroundColor: t.surface, borderTopLeftRadius: 18, borderTopRightRadius: 18, maxHeight: "78%", paddingBottom: 24 }}>
            <View style={{ paddingHorizontal: 16, paddingTop: 16, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={{ color: t.text, fontWeight: "700", fontSize: 16 }}>{label || "Select"}</Text>
              <TouchableOpacity onPress={close}>
                <Text style={{ color: t.primary, fontWeight: "700" }}>Done</Text>
              </TouchableOpacity>
            </View>

            <ModalSearchBox value={query} onChangeText={setQuery} />

            <ScrollView keyboardShouldPersistTaps="handled">
              {filtered.length === 0 && <Text style={{ color: t.textMuted, padding: 16 }}>No options found</Text>}
              {filtered.map((item) => (
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
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}
