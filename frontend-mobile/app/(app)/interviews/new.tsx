import React, { useEffect, useState } from "react";
import { View, ScrollView, Alert } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Header } from "../../../components/Header";
import { Button, ErrorBanner, LoadingView } from "../../../components/ui";
import { TextField, SelectField, SelectOption } from "../../../components/FormField";
import { useTheme } from "../../../lib/theme";
import { interviewsService, companiesService, profilesService, candidatesService, businessDevelopersService } from "../../../lib/api";
import type { Company, ResumeProfile, Candidate, BusinessDeveloper } from "../../../lib/types";
import { useDepartmentContext } from "../../../lib/DepartmentContext";
import { isInDepartmentScope } from "../../../lib/deptScope";

export default function NewInterviewScreen() {
  const t = useTheme();
  const { departmentId } = useDepartmentContext();
  const params = useLocalSearchParams<{
    threadId?: string;
    parentInterviewId?: string;
    companyId?: string;
    resumeProfileId?: string;
    candidateId?: string;
    role?: string;
  }>();

  const [loadingOptions, setLoadingOptions] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [companies, setCompanies] = useState<Company[]>([]);
  const [profiles, setProfiles] = useState<ResumeProfile[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [bds, setBds] = useState<BusinessDeveloper[]>([]);

  const [companyId, setCompanyId] = useState<string | null>(params.companyId || null);
  const [resumeProfileId, setResumeProfileId] = useState<string | null>(params.resumeProfileId || null);
  const [candidateId, setCandidateId] = useState<string | null>(params.candidateId || null);
  const [bdId, setBdId] = useState<string | null>(null);
  const [role, setRole] = useState(params.role || "");
  const [round, setRound] = useState(params.parentInterviewId ? "Round 2" : "Initial Screening");
  const [salaryRange, setSalaryRange] = useState("");
  const [interviewDate, setInterviewDate] = useState("");
  const [timeEst, setTimeEst] = useState("");
  const [interviewer, setInterviewer] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const [c, p, cd, b] = await Promise.all([
          companiesService.list(),
          profilesService.list({ department_id: departmentId }),
          candidatesService.list({ department_id: departmentId }),
          businessDevelopersService.list(),
        ]);
        setCompanies(c);
        setProfiles(p);
        setCandidates(cd.filter((c2) => c2.is_active || c2.id === params.candidateId));
        setBds(b.filter((bd) => bd.is_active && isInDepartmentScope(bd.department_ids, departmentId)));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load form data");
      } finally {
        setLoadingOptions(false);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    })();
  }, [departmentId]);

  async function handleCreateCompany(name: string): Promise<SelectOption | null> {
    try {
      const created = await companiesService.create({ name, is_staffing_firm: false });
      setCompanies((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      return { label: created.name, value: created.id };
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to create company");
      return null;
    }
  }

  async function handleSubmit() {
    if (!companyId || !resumeProfileId || !candidateId || !role.trim() || !round.trim()) {
      Alert.alert("Missing info", "Company, resume profile, candidate, role, and round are required.");
      return;
    }
    setSaving(true);
    try {
      const created = await interviewsService.create({
        company_id: companyId,
        resume_profile_id: resumeProfileId,
        candidate_id: candidateId,
        role: role.trim(),
        round: round.trim(),
        salary_range: salaryRange.trim() || null,
        bd_id: bdId,
        interview_date: interviewDate.trim() || null,
        time_est: timeEst.trim() || null,
        interviewer: interviewer.trim() || null,
        thread_id: params.threadId || null,
        parent_interview_id: params.parentInterviewId || null,
      });
      router.replace(`/interviews/${created.id}`);
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to create interview");
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Header title="New Interview" showBack />
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
            placeholder="Select or type to create…"
            onCreate={handleCreateCompany}
            createLabel="company"
          />
          <SelectField label="Resume Profile *" value={resumeProfileId} onSelect={setResumeProfileId} options={profiles.map((p) => ({ label: p.name, value: p.id }))} />
          <SelectField label="Candidate *" value={candidateId} onSelect={setCandidateId} options={candidates.map((c) => ({ label: c.name, value: c.id }))} />
          <TextField label="Role *" value={role} onChangeText={setRole} />
          <TextField label="Round *" value={round} onChangeText={setRound} placeholder="e.g. Initial Screening" />
          <TextField label="Salary Range" value={salaryRange} onChangeText={setSalaryRange} />
          <SelectField label="Business Developer" value={bdId} onSelect={setBdId} options={bds.map((b) => ({ label: b.name, value: b.id }))} placeholder="None" />
          <TextField label="Interview Date (YYYY-MM-DD)" value={interviewDate} onChangeText={setInterviewDate} />
          <TextField label="Time (EST)" value={timeEst} onChangeText={setTimeEst} />
          <TextField label="Interviewer" value={interviewer} onChangeText={setInterviewer} />
          <Button title="Create Interview" onPress={handleSubmit} loading={saving} />
        </ScrollView>
      )}
    </View>
  );
}
