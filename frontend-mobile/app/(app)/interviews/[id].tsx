import React, { useCallback, useState } from "react";
import { View, Text, ScrollView, Alert, Linking, RefreshControl } from "react-native";
import { router, useLocalSearchParams, useFocusEffect } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import { Header } from "../../../components/Header";
import { Card, Label, Button, LoadingView, ErrorBanner, Badge } from "../../../components/ui";
import { TextField, SelectField } from "../../../components/FormField";
import { useTheme } from "../../../lib/theme";
import { interviewsService } from "../../../lib/api";
import type { Interview } from "../../../lib/types";
import { statusBadge, formatDate, prettify } from "../../../lib/statusMeta";

const STATUS_OPTIONS = [
  "pending",
  "scheduled",
  "no_response",
  "converted",
  "rejected",
  "dropped",
  "closed",
  "dead",
].map((v) => ({ label: prettify(v), value: v }));

export default function InterviewDetailScreen() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [interview, setInterview] = useState<Interview | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<"document" | "resume" | null>(null);

  const [status, setStatus] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const [recruiterFeedback, setRecruiterFeedback] = useState("");
  const [interviewDate, setInterviewDate] = useState("");
  const [timeEst, setTimeEst] = useState("");
  const [interviewer, setInterviewer] = useState("");
  const [interviewLink, setInterviewLink] = useState("");

  const load = useCallback(async (isRefresh = false) => {
    if (!id) return;
    isRefresh ? setRefreshing(true) : setLoading(true);
    setError(null);
    try {
      const data = await interviewsService.get(id);
      setInterview(data);
      setStatus(data.status);
      setFeedback(data.feedback ?? "");
      setRecruiterFeedback(data.recruiter_feedback ?? "");
      setInterviewDate(data.interview_date ?? "");
      setTimeEst(data.time_est ?? "");
      setInterviewer(data.interviewer ?? "");
      setInterviewLink(data.interview_link ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load interview");
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

  async function handleSave() {
    if (!id) return;
    setSaving(true);
    try {
      await interviewsService.update(id, {
        status,
        feedback: feedback.trim() || null,
        recruiter_feedback: recruiterFeedback.trim() || null,
        interview_date: interviewDate.trim() || null,
        time_est: timeEst.trim() || null,
        interviewer: interviewer.trim() || null,
        interview_link: interviewLink.trim() || null,
      });
      await load();
      Alert.alert("Saved", "Interview updated.");
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleUpload(kind: "document" | "resume") {
    const result = await DocumentPicker.getDocumentAsync({ multiple: false, copyToCacheDirectory: true });
    if (result.canceled || !result.assets?.[0] || !id) return;
    const asset = result.assets[0];
    setUploading(kind);
    try {
      const file = { uri: asset.uri, name: asset.name, type: asset.mimeType || "application/octet-stream" };
      if (kind === "document") await interviewsService.uploadDocument(id, file);
      else await interviewsService.uploadResume(id, file);
      await load();
    } catch (e) {
      Alert.alert("Upload failed", e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setUploading(null);
    }
  }

  function confirmDelete() {
    Alert.alert("Delete interview round", "This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            if (id) await interviewsService.delete(id);
            router.back();
          } catch (e) {
            Alert.alert("Error", e instanceof Error ? e.message : "Failed to delete");
          }
        },
      },
    ]);
  }

  if (loading && !interview) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <Header title="Interview" showBack />
        <LoadingView />
      </View>
    );
  }

  const badge = interview ? statusBadge(interview.computed_status) : null;

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Header title={interview ? `${interview.company_name ?? "Interview"}` : "Interview"} showBack />
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={t.primary} />}
      >
        {error && <ErrorBanner message={error} onRetry={() => load()} />}
        {interview && (
          <>
            <Card style={{ gap: 6 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                <Text style={{ color: t.text, fontSize: 17, fontWeight: "700", flex: 1 }}>{interview.role}</Text>
                {badge && <Badge label={badge.label} bg={badge.bg} color={badge.color} />}
              </View>
              <Text style={{ color: t.textMuted }}>
                {interview.candidate_name ?? "Unassigned"} • {interview.resume_profile_name ?? "—"}
              </Text>
              <Text style={{ color: t.textMuted, fontSize: 12 }}>Round: {interview.round}</Text>
              {interview.bd_name ? <Text style={{ color: t.textMuted, fontSize: 12 }}>BD: {interview.bd_name}</Text> : null}
              {interview.salary_range ? <Text style={{ color: t.textMuted, fontSize: 12 }}>Salary: {interview.salary_range}</Text> : null}
            </Card>

            <Card style={{ gap: 4 }}>
              <Label>Edit Details</Label>
              <SelectField label="Status" value={status} onSelect={setStatus} options={STATUS_OPTIONS} />
              <TextField label="Interview Date (YYYY-MM-DD)" value={interviewDate} onChangeText={setInterviewDate} placeholder="2026-08-20" />
              <TextField label="Time (EST)" value={timeEst} onChangeText={setTimeEst} placeholder="10:00 AM" />
              <TextField label="Interviewer" value={interviewer} onChangeText={setInterviewer} />
              <TextField label="Interview Link" value={interviewLink} onChangeText={setInterviewLink} autoCapitalize="none" />
              <TextField label="Feedback" value={feedback} onChangeText={setFeedback} multiline />
              <TextField label="Recruiter Feedback" value={recruiterFeedback} onChangeText={setRecruiterFeedback} multiline />
              <Button title="Save Changes" onPress={handleSave} loading={saving} />
            </Card>

            {interview.interview_link ? (
              <Button
                title="Open Interview Link"
                variant="secondary"
                icon="link-outline"
                onPress={() => Linking.openURL(interview.interview_link!)}
              />
            ) : null}

            <Card style={{ gap: 8 }}>
              <Label>Files</Label>
              <Button
                title={interview.interview_doc_url ? "Replace Document" : "Upload Document"}
                variant="secondary"
                icon="document-attach-outline"
                loading={uploading === "document"}
                onPress={() => handleUpload("document")}
              />
              {interview.interview_doc_url ? (
                <Button title="Open Document" variant="ghost" onPress={() => Linking.openURL(interview.interview_doc_url!)} />
              ) : null}
              <Button
                title={interview.resume_url ? "Replace Resume" : "Upload Resume"}
                variant="secondary"
                icon="document-text-outline"
                loading={uploading === "resume"}
                onPress={() => handleUpload("resume")}
              />
              {interview.resume_url ? (
                <Button title="Open Resume" variant="ghost" onPress={() => Linking.openURL(interview.resume_url!)} />
              ) : null}
            </Card>

            <Button title="Delete Interview Round" variant="danger" icon="trash-outline" onPress={confirmDelete} />
          </>
        )}
      </ScrollView>
    </View>
  );
}
