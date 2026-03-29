import { API_V1 } from "./constants";
import type {
  DashboardStats,
  Candidate,
  CandidateWithInterviews,
  CandidateFormData,
  ResumeProfile,
  ResumeProfileFormData,
  Company,
  CompanyWithInterviews,
  CompanyFormData,
  Interview,
  InterviewFormData,
} from "./types";

// ─── Generic fetch wrapper ──────────────────────────────────

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_V1}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(error.detail || `API Error: ${res.status}`);
  }

  // Handle 204 No Content
  if (res.status === 204) return undefined as T;
  return res.json();
}

// ─── Dashboard ──────────────────────────────────────────────

export const dashboardService = {
  getStats: () => apiFetch<DashboardStats>("/dashboard/stats"),
};

// ─── Candidates ─────────────────────────────────────────────

export const candidatesService = {
  list: () => apiFetch<Candidate[]>("/candidates"),
  get: (id: string) => apiFetch<CandidateWithInterviews>(`/candidates/${id}`),
  create: (data: CandidateFormData) =>
    apiFetch<Candidate>("/candidates", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (id: string, data: Partial<CandidateFormData>) =>
    apiFetch<Candidate>(`/candidates/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    apiFetch<void>(`/candidates/${id}`, { method: "DELETE" }),
};

// ─── Resume Profiles ────────────────────────────────────────

export const profilesService = {
  list: () => apiFetch<ResumeProfile[]>("/resume-profiles"),
  get: (id: string) => apiFetch<ResumeProfile>(`/resume-profiles/${id}`),
  create: (data: ResumeProfileFormData) =>
    apiFetch<ResumeProfile>("/resume-profiles", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (id: string, data: Partial<ResumeProfileFormData>) =>
    apiFetch<ResumeProfile>(`/resume-profiles/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    apiFetch<void>(`/resume-profiles/${id}`, { method: "DELETE" }),
};

// ─── Companies ──────────────────────────────────────────────

export const companiesService = {
  list: () => apiFetch<Company[]>("/companies"),
  get: (id: string) => apiFetch<CompanyWithInterviews>(`/companies/${id}`),
  create: (data: CompanyFormData) =>
    apiFetch<Company>("/companies", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (id: string, data: Partial<CompanyFormData>) =>
    apiFetch<Company>(`/companies/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    apiFetch<void>(`/companies/${id}`, { method: "DELETE" }),
};

// ─── Interviews ─────────────────────────────────────────────

export const interviewsService = {
  list: (params?: Record<string, string>) => {
    const query = params
      ? "?" + new URLSearchParams(params).toString()
      : "";
    return apiFetch<Interview[]>(`/interviews${query}`);
  },
  get: (id: string) => apiFetch<Interview>(`/interviews/${id}`),
  create: (data: InterviewFormData) =>
    apiFetch<Interview>("/interviews", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (id: string, data: Partial<InterviewFormData>) =>
    apiFetch<Interview>(`/interviews/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    apiFetch<void>(`/interviews/${id}`, { method: "DELETE" }),
};
