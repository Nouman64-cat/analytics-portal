import { API_V1 } from "./constants";
import { getToken, clearToken } from "./auth";
import type {
  DashboardStats,
  BusinessDeveloper,
  BusinessDeveloperFormData,
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
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_V1}${path}`, {
    headers,
    ...options,
  });

  if (res.status === 401) {
    clearToken();
    window.location.href = "/login";
    throw new Error("Session expired. Please log in again.");
  }

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(error.detail || `API Error: ${res.status}`);
  }

  // Handle 204 No Content
  if (res.status === 204) return undefined as T;
  return res.json();
}

// ─── Auth ────────────────────────────────────────────────────

export const authService = {
  login: (email: string, password: string) =>
    fetch(`${API_V1}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    }).then(async (res) => {
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail || "Login failed");
      }
      return res.json() as Promise<{
        access_token: string;
        must_change_password: boolean;
      }>;
    }),

  changePassword: (newPassword: string) =>
    apiFetch<{ message: string }>("/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ new_password: newPassword }),
    }),
};

// ─── Dashboard ──────────────────────────────────────────────

export const dashboardService = {
  getStats: () => apiFetch<DashboardStats>("/dashboard/stats"),
};

// ─── Business Developers ────────────────────────────────────

export const businessDevelopersService = {
  list: () => apiFetch<BusinessDeveloper[]>("/business-developers/"),
  create: (data: BusinessDeveloperFormData) =>
    apiFetch<BusinessDeveloper>("/business-developers/", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (id: string, data: Partial<BusinessDeveloperFormData>) =>
    apiFetch<BusinessDeveloper>(`/business-developers/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    apiFetch<void>(`/business-developers/${id}`, { method: "DELETE" }),
};

// ─── Candidates ─────────────────────────────────────────────

export const candidatesService = {
  list: () => apiFetch<Candidate[]>("/candidates/"),
  get: (id: string) => apiFetch<CandidateWithInterviews>(`/candidates/${id}`),
  create: (data: CandidateFormData) =>
    apiFetch<Candidate>("/candidates/", {
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
  list: () => apiFetch<ResumeProfile[]>("/resume-profiles/"),
  get: (id: string) => apiFetch<ResumeProfile>(`/resume-profiles/${id}`),
  create: (data: ResumeProfileFormData) =>
    apiFetch<ResumeProfile>("/resume-profiles/", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (id: string, data: Partial<ResumeProfileFormData>) =>
    apiFetch<ResumeProfile>(`/resume-profiles/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  uploadResume: async (id: string, file: File) => {
    const token = getToken();
    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch(`${API_V1}/resume-profiles/${id}/resume`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: formData,
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({ detail: res.statusText }));
      if (res.status === 401) {
        clearToken();
        window.location.href = "/login";
      }
      throw new Error(error.detail || `API Error: ${res.status}`);
    }

    return res.json() as Promise<ResumeProfile>;
  },
  delete: (id: string) =>
    apiFetch<void>(`/resume-profiles/${id}`, { method: "DELETE" }),
};

// ─── Companies ──────────────────────────────────────────────

export const companiesService = {
  list: () => apiFetch<Company[]>("/companies/"),
  get: (id: string) => apiFetch<CompanyWithInterviews>(`/companies/${id}`),
  create: (data: CompanyFormData) =>
    apiFetch<Company>("/companies/", {
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
    const query = params ? "?" + new URLSearchParams(params).toString() : "";
    return apiFetch<Interview[]>(`/interviews/${query}`);
  },
  listByThread: (threadId: string) =>
    apiFetch<Interview[]>(`/interviews/thread/${threadId}`),
  get: (id: string) => apiFetch<Interview>(`/interviews/${id}`),
  create: (data: InterviewFormData) =>
    apiFetch<Interview>("/interviews/", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (id: string, data: Partial<InterviewFormData>) =>
    apiFetch<Interview>(`/interviews/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  uploadInterviewDoc: async (id: string, file: File) => {
    const token = getToken();
    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch(`${API_V1}/interviews/${id}/document`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: formData,
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({ detail: res.statusText }));
      if (res.status === 401) {
        clearToken();
        window.location.href = "/login";
      }
      throw new Error(error.detail || `API Error: ${res.status}`);
    }

    return res.json() as Promise<Interview>;
  },
  delete: (id: string) =>
    apiFetch<void>(`/interviews/${id}`, { method: "DELETE" }),
};
