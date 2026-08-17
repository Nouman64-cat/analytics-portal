import React, { useCallback, useEffect, useState } from "react";
import { View, Text, ScrollView, Alert, RefreshControl } from "react-native";
import { router, useLocalSearchParams, useFocusEffect } from "expo-router";
import { Header } from "../../../components/Header";
import { Card, Label, Button, LoadingView, ErrorBanner, Badge, ListRow } from "../../../components/ui";
import { TextField, SelectField, SwitchField } from "../../../components/FormField";
import { useTheme } from "../../../lib/theme";
import { leadsService, interviewsService, companiesService, profilesService, businessDevelopersService, candidatesService } from "../../../lib/api";
import type { LeadListItem, Interview, Company, ResumeProfile, BusinessDeveloper, Candidate } from "../../../lib/types";
import { leadOutcomeBadge, interviewStatusBadge, formatDate, prettify } from "../../../lib/statusMeta";
import { useAuth } from "../../../lib/AuthContext";
import { canMutateLeads, canOverrideConversion } from "../../../lib/permissions";
import { useDepartmentContext } from "../../../lib/DepartmentContext";

const AUTO_OUTCOME = "__auto__";
const OUTCOME_OPTIONS = [
  { label: "Auto (from interviews)", value: AUTO_OUTCOME },
  { label: "Active", value: "active" },
  { label: "Unresponsive", value: "unresponsive" },
  { label: "Dropped", value: "dropped" },
  { label: "Dead", value: "dead" },
  { label: "Rejected", value: "rejected" },
  { label: "Closed", value: "closed" },
];

export default function LeadDetailScreen() {
  const t = useTheme();
  const { payload } = useAuth();
  const { departmentId } = useDepartmentContext();
  const canEdit = canMutateLeads(payload?.role ?? null);
  const canOverride = canOverrideConversion(payload?.role ?? null);
  const { id } = useLocalSearchParams<{ id: string }>();
  const [lead, setLead] = useState<LeadListItem | null>(null);
  const [rounds, setRounds] = useState<Interview[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [outcomeSaving, setOutcomeSaving] = useState(false);

  const [companies, setCompanies] = useState<Company[]>([]);
  const [profiles, setProfiles] = useState<ResumeProfile[]>([]);
  const [bds, setBds] = useState<BusinessDeveloper[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);

  const [companyId, setCompanyId] = useState<string | null>(null);
  const [resumeProfileId, setResumeProfileId] = useState<string | null>(null);
  const [bdId, setBdId] = useState<string | null>(null);
  const [candidateId, setCandidateId] = useState<string | null>(null);
  const [role, setRole] = useState("");
  const [salaryRange, setSalaryRange] = useState("");
  const [arrivedOn, setArrivedOn] = useState("");
  const [notes, setNotes] = useState("");
  const [bdNotes, setBdNotes] = useState("");

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
      setCompanyId(leadData.company_id);
      setResumeProfileId(leadData.resume_profile_id);
      setBdId(leadData.primary_bd_id);
      setCandidateId(leadData.candidate_id);
      setRole(leadData.primary_role ?? "");
      setSalaryRange(leadData.salary_range ?? "");
      setArrivedOn(leadData.lead_arrival_date ?? "");
      setNotes(leadData.lead_notes ?? "");
      setBdNotes(leadData.bd_notes ?? "");
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

  useEffect(() => {
    if (!canEdit) return;
    (async () => {
      try {
        const [c, p, b, cd] = await Promise.all([
          companiesService.list(),
          profilesService.list({ department_id: departmentId }),
          businessDevelopersService.list(),
          candidatesService.list({ department_id: departmentId }),
        ]);
        setCompanies(c);
        setProfiles(p);
        setBds(b.filter((bd) => bd.is_active));
        setCandidates(cd.filter((c2) => c2.is_active));
      } catch {
        // Non-critical — form still works with the currently assigned values.
      }
    })();
  }, [canEdit, departmentId]);

  async function saveDetails() {
    if (!id || !companyId || !resumeProfileId || !role.trim()) {
      Alert.alert("Missing info", "Company, resume profile, and role are required.");
      return;
    }
    setSaving(true);
    try {
      await leadsService.update(id, {
        company_id: companyId,
        resume_profile_id: resumeProfileId,
        role: role.trim(),
        salary_range: salaryRange.trim() || null,
        bd_id: bdId,
        candidate_id: candidateId,
        notes: notes.trim() || null,
        bd_notes: bdNotes.trim() || null,
        arrived_on: arrivedOn.trim() || null,
      });
      await load();
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to save changes");
    } finally {
      setSaving(false);
    }
  }

  async function handleOutcomeChange(value: string) {
    if (!id) return;
    setOutcomeSaving(true);
    try {
      if (value === AUTO_OUTCOME) await interviewsService.updateLead(id, { clear_override: true });
      else await interviewsService.updateLead(id, { outcome_override: value });
      await load();
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to update lead status");
    } finally {
      setOutcomeSaving(false);
    }
  }

  async function toggleConversion() {
    if (!id || !lead) return;
    setOutcomeSaving(true);
    try {
      await leadsService.update(id, { is_converted_override: !lead.is_converted });
      await load();
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to update conversion status");
    } finally {
      setOutcomeSaving(false);
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
  const outcomeValue = lead ? (lead.lead_source === "explicit" && lead.lead_outcome ? lead.lead_outcome : AUTO_OUTCOME) : AUTO_OUTCOME;

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

              {canEdit ? (
                <SelectField
                  label="Lead Status"
                  value={outcomeValue}
                  onSelect={handleOutcomeChange}
                  options={OUTCOME_OPTIONS}
                />
              ) : (
                <InfoRow label="Status Label" value={lead.lead_status_label || "—"} />
              )}

              {canOverride && (
                <SwitchField label="Force marked as converted" value={lead.is_converted} onValueChange={toggleConversion} />
              )}

              <InfoRow label="Lead Arrived" value={formatDate(lead.lead_arrival_date)} />
              <InfoRow label="Source" value={prettify(lead.lead_source)} />
              {outcomeSaving && <Text style={{ color: t.textMuted, fontSize: 12 }}>Saving…</Text>}
            </Card>

            {canEdit ? (
              <Card style={{ gap: 4 }}>
                <Text style={{ color: t.text, fontWeight: "700", fontSize: 15, marginBottom: 6 }}>Lead Details</Text>
                <SelectField label="Company *" value={companyId} onSelect={setCompanyId} options={companies.map((c) => ({ label: c.name, value: c.id }))} />
                <SelectField
                  label="Resume Profile *"
                  value={resumeProfileId}
                  onSelect={setResumeProfileId}
                  options={profiles.map((p) => ({ label: p.name, value: p.id }))}
                />
                <TextField label="Role *" value={role} onChangeText={setRole} placeholder="e.g. Senior React Developer" />
                <TextField label="Salary Range" value={salaryRange} onChangeText={setSalaryRange} placeholder="e.g. $90k–$110k" />
                <SelectField
                  label="Business Developer"
                  value={bdId}
                  onSelect={setBdId}
                  options={bds.map((b) => ({ label: b.name, value: b.id }))}
                  placeholder="None"
                />
                <SelectField
                  label="Candidate"
                  value={candidateId}
                  onSelect={setCandidateId}
                  options={candidates.map((c) => ({ label: c.name, value: c.id }))}
                  placeholder="Unassigned"
                />
                <TextField label="Arrived On" value={arrivedOn} onChangeText={setArrivedOn} placeholder="YYYY-MM-DD" autoCapitalize="none" />
                <TextField label="Notes" value={notes} onChangeText={setNotes} multiline placeholder="Internal notes about this lead…" />
                <TextField label="BD Notes" value={bdNotes} onChangeText={setBdNotes} multiline placeholder="Notes for the business developer…" />
                <Button title="Save Changes" onPress={saveDetails} loading={saving} style={{ marginTop: 8 }} />
              </Card>
            ) : (
              <Card style={{ gap: 10 }}>
                <InfoRow label="Candidate" value={lead.candidate_name ?? "Unassigned"} />
                <InfoRow label="Resume Profile" value={lead.resume_profile_name ?? "—"} />
                <InfoRow label="Business Developer" value={lead.primary_bd_name ?? "—"} />
                <InfoRow label="Salary Range" value={lead.salary_range ?? "—"} />
                {lead.lead_notes ? (
                  <View>
                    <Label>Notes</Label>
                    <Text style={{ color: t.text, fontSize: 13.5 }}>{lead.lead_notes}</Text>
                  </View>
                ) : null}
              </Card>
            )}

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
              {canEdit && (
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
              )}
            </Card>

            {canEdit && <Button title="Delete Lead" variant="danger" icon="trash-outline" onPress={confirmDelete} />}
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
