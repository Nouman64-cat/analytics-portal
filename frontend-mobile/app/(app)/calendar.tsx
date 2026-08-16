import React, { useMemo, useState } from "react";
import { View, Text, ScrollView, RefreshControl } from "react-native";
import { Calendar, DateData } from "react-native-calendars";
import { Header } from "../../components/Header";
import { Card, LoadingView, ErrorBanner, EmptyState } from "../../components/ui";
import { useTheme } from "../../lib/theme";
import { dashboardService } from "../../lib/api";
import { useApi } from "../../lib/useApi";
import { useDepartmentContext } from "../../lib/DepartmentContext";

export default function CalendarScreen() {
  const t = useTheme();
  const { departmentId } = useDepartmentContext();
  const { data, loading, refreshing, error, refresh } = useApi(
    () => dashboardService.getInterviewsByDay(departmentId),
    [departmentId],
  );
  const [selected, setSelected] = useState<string | null>(null);

  const marked = useMemo(() => {
    const result: Record<string, any> = {};
    (data?.days ?? []).forEach((d) => {
      if (d.count > 0) {
        result[d.date] = { marked: true, dotColor: t.primary };
      }
    });
    if (selected) {
      result[selected] = { ...(result[selected] || {}), selected: true, selectedColor: t.primary };
    }
    return result;
  }, [data, selected, t.primary]);

  const dayData = data?.days.find((d) => d.date === selected);

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Header title="Calendar" />
      {loading && !data ? (
        <LoadingView />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, gap: 12 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={t.primary} />}
        >
          {error && <ErrorBanner message={error} onRetry={refresh} />}
          <Card style={{ padding: 6 }}>
            <Calendar
              markedDates={marked}
              onDayPress={(d: DateData) => setSelected(d.dateString)}
              theme={{
                calendarBackground: t.surface,
                dayTextColor: t.text,
                monthTextColor: t.text,
                textDisabledColor: t.textMuted,
                todayTextColor: t.primary,
                arrowColor: t.primary,
                textSectionTitleColor: t.textMuted,
              }}
            />
          </Card>

          <Card style={{ gap: 8 }}>
            <Text style={{ color: t.text, fontWeight: "700", fontSize: 15 }}>
              {selected ? `Interviews on ${selected}` : "Select a date"}
            </Text>
            {!selected && <Text style={{ color: t.textMuted }}>Tap a marked day to see scheduled interviews.</Text>}
            {selected && (!dayData || dayData.interviews.length === 0) && (
              <EmptyState icon="calendar-outline" title="No interviews scheduled" />
            )}
            {dayData?.interviews.map((iv) => (
              <View key={iv.id} style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: t.border }}>
                <Text style={{ color: t.text, fontWeight: "600" }}>
                  {iv.company ?? "Unknown"} — {iv.role}
                </Text>
                <Text style={{ color: t.textMuted, fontSize: 13 }}>
                  {iv.candidate ?? "Unassigned"} • {iv.round} {iv.time_est ? `• ${iv.time_est}` : ""}
                </Text>
                {iv.bd_name ? <Text style={{ color: t.textMuted, fontSize: 12 }}>BD: {iv.bd_name}</Text> : null}
              </View>
            ))}
          </Card>
        </ScrollView>
      )}
    </View>
  );
}
