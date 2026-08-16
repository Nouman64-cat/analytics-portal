import React, { useCallback, useState } from "react";
import { View, Text, ScrollView, Alert, RefreshControl } from "react-native";
import { router, useLocalSearchParams, useFocusEffect } from "expo-router";
import { Header } from "../../../components/Header";
import { Card, Label, Button, LoadingView, ErrorBanner, Badge, ListRow } from "../../../components/ui";
import { TextField } from "../../../components/FormField";
import { useTheme } from "../../../lib/theme";
import { leadsService, interviewsService } from "../../../lib/api";
import type { LeadListItem, Interview } from "../../../lib/types";
import { leadOutcomeBadge, interviewStatusBadge, formatDate, prettify } from "../../../lib/statusMeta";

export default function LeadDetailScreen() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [lead, setLead] = useState<LeadListItem | null>(null);
  const [rounds, setRounds] = useState<Interview[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (!id) return;
    isRefresh ? setRefreshing(true) : setLoading(true);
    setError(null);
    try {
      const [leadData, threadInterviews] = await Promise.all([
        leadsService.get(id),
        interviewsService.listByThread(id),
      ]);
      setLead(leadData);
      setNotes(leadData.lead_notes ?? "");
      setRounds(threadInterviews);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load lead");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function saveNotes() {
    if (!id) return;
    setSaving(true);
    try {
      await leadsService.update(id, { notes });
      await load();
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to save notes");
    } finally {
      setSaving(false);
    }
  }

  function confirmDelete() {
    Alert.alert("Delete lead", "This removes the lead and all its interview rounds. This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            if (id) await leadsService.delete(id);
            router.back();
          } catch (e) {
            Alert.alert("Error", e instanceof Error ? e.message : "Failed to delete lead");
          }
        },
      },
    ]);
  }

  if (loading && !lead) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <Header title="Lead" showBack />
        <LoadingView />
      </View>
    );
  }

  const badge = lead ? leadOutcomeBadge(lead.lead_outcome, lead.lead_status_label) : null;

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Header title={lead?.company_name ?? "Lead"} showBack />
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 12 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={t.primary} />}
      >
        {error && <ErrorBanner message={error} onRetry={() => load()} />}
        {lead && (
          <>
            <Card style={{ gap: 10 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: t.text, fontSize: 18, fontWeight: "700" }}>{lead.company_name}</Text>
                  <Text style={{ color: t.textMuted, marginTop: 2 }}>{lead.primary_role ?? "Role TBD"}</Text>
                </View>
                {badge && <Badge label={badge.label} bg={badge.bg} color={badge.color} />}
              </View>

              <InfoRow label="Candidate" value={lead.candidate_name ?? "Unassigned"} />
              <InfoRow label="Resume Profile" value={lead.resume_profile_name ?? "—"} />
              <InfoRow label="Business Developer" value={lead.primary_bd_name ?? "—"} />
              <InfoRow label="Salary Range" value={lead.salary_range ?? "—"} />
              <InfoRow label="Lead Arrived" value={formatDate(lead.lead_arrival_date)} />
              <InfoRow label="Status Label" value={lead.lead_status_label || "—"} />
              <InfoRow label="Source" value={prettify(lead.lead_source)} />
            </Card>

            <Card style={{ gap: 10 }}>
              <Text style={{ color: t.text, fontWeight: "700", fontSize: 15 }}>
                Interview Rounds ({rounds.length})
              </Text>
              {rounds.length === 0 && <Text style={{ color: t.textMuted }}>No rounds yet.</Text>}
              {rounds.map((r) => (
                <ListRow
                  key={r.id}
                  title={`${r.round} — ${interviewStatusBadge(r.computed_status).label}`}
                  subtitle={r.interview_date ? formatDate(r.interview_date) : "No date set"}
                  onPress={() => router.push(`/interviews/${r.id}`)}
                />
              ))}
              <Button
                title="Add Interview Round"
                variant="secondary"
                icon="add"
                onPress={() =>
                  router.push({
                    pathname: "/interviews/new",
                    params: {
                      threadId: lead.thread_id,
                      companyId: lead.company_id,
                      resumeProfileId: lead.resume_profile_id,
                      candidateId: lead.candidate_id ?? "",
                      role: lead.primary_role ?? "",
                      parentInterviewId: lead.last_interview_id ?? "",
                    },
                  })
                }
              />
            </Card>

            <Card style={{ gap: 10 }}>
              <Label>Notes</Label>
              <TextField value={notes} onChangeText={setNotes} multiline placeholder="Internal notes about this lead…" />
              <Button title="Save Notes" onPress={saveNotes} loading={saving} />
            </Card>

            <Button title="Delete Lead" variant="danger" icon="trash-outline" onPress={confirmDelete} />
          </>
        )}
      </ScrollView>
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
      <Text style={{ color: t.textMuted, fontSize: 13 }}>{label}</Text>
      <Text style={{ color: t.text, fontSize: 13, fontWeight: "600" }}>{value}</Text>
    </View>
  );
}
