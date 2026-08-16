import React, { useEffect, useState } from "react";
import { View, ScrollView, Alert } from "react-native";
import { router } from "expo-router";
import { Header } from "../../../components/Header";
import { Button, ErrorBanner, LoadingView } from "../../../components/ui";
import { TextField, SelectField } from "../../../components/FormField";
import { useTheme } from "../../../lib/theme";
import { leadsService, companiesService, profilesService, businessDevelopersService, candidatesService } from "../../../lib/api";
import type { Company, ResumeProfile, BusinessDeveloper, Candidate } from "../../../lib/types";
import { useDepartmentContext } from "../../../lib/DepartmentContext";

export default function NewLeadScreen() {
  const t = useTheme();
  const { departmentId } = useDepartmentContext();
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

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
  const [notes, setNotes] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const [c, p, b, cd] = await Promise.all([
          companiesService.list(),
          profilesService.list(),
          businessDevelopersService.list(),
          candidatesService.list(),
        ]);
        setCompanies(c);
        setProfiles(p);
        setBds(b);
        setCandidates(cd);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load form data");
      } finally {
        setLoadingOptions(false);
      }
    })();
  }, []);

  async function handleSubmit() {
    if (!companyId || !resumeProfileId || !role.trim()) {
      Alert.alert("Missing info", "Company, resume profile, and role are required.");
      return;
    }
    setSaving(true);
    try {
      const created = await leadsService.create({
        company_id: companyId,
        resume_profile_id: resumeProfileId,
        role: role.trim(),
        salary_range: salaryRange.trim() || null,
        bd_id: bdId,
        candidate_id: candidateId,
        notes: notes.trim() || null,
        active_department_id: departmentId,
      });
      router.replace(`/leads/${created.thread_id}`);
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to create lead");
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Header title="New Lead" showBack />
      {loadingOptions ? (
        <LoadingView />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          {error && (
            <View style={{ marginBottom: 12 }}>
              <ErrorBanner message={error} />
            </View>
          )}
          <SelectField
            label="Company *"
            value={companyId}
            onSelect={setCompanyId}
            options={companies.map((c) => ({ label: c.name, value: c.id }))}
          />
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
          <TextField label="Notes" value={notes} onChangeText={setNotes} multiline placeholder="Optional notes…" />
          <Button title="Create Lead" onPress={handleSubmit} loading={saving} />
        </ScrollView>
      )}
    </View>
  );
}
