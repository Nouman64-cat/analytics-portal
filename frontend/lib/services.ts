import { API_V1 } from "./constants";
import { getToken, clearToken } from "./auth";
import type {
  DashboardStats,
  DayInterviews,
  LeadOutcomesByCandidateData,
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
  LeadThreadRead,
  LeadThreadUpdate,
  LeadListItem,
  LeadListPage,
  LeadListParams,
  LeadCreate,
  LeadUpdate,
  ActivityLogPage,
  User,
  UserFormData,
  Department,
  DepartmentFormData,
  DatabaseBackupResult,
  DatabaseBackupListResponse,
  BusyDay,
  BusyDayCreate,
  BroadcastModal,
  BroadcastModalCreate,
  BroadcastModalUpdate,
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

  changePassword: (data: { current_password?: string; new_password: string }) =>
    apiFetch<{ message: string }>("/auth/change-password", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  forgotPassword: (email: string) =>
    fetch(`${API_V1}/auth/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    }).then(async (res) => {
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail || "Request failed");
      }
      return res.json() as Promise<{ message: string }>;
    }),

  resetPassword: (token: string, new_password: string) =>
    fetch(`${API_V1}/auth/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, new_password }),
    }).then(async (res) => {
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail || "Reset failed");
      }
      return res.json() as Promise<{ message: string }>;
    }),

  updateProfile: (data: { full_name: string }) =>
    apiFetch<User>("/auth/profile", {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  updateSettings: (data: { alarm_enabled?: boolean; accent_color?: string | null; glassmorphism_enabled?: boolean }) =>
    apiFetch<User>("/auth/settings", {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  getMe: () => apiFetch<User>("/auth/me"),
};

// ─── Dashboard ──────────────────────────────────────────────

export const dashboardService = {
  getStats: (departmentId?: string | null) => {
    const qs = departmentId ? `?department_id=${departmentId}` : "";
    return apiFetch<DashboardStats>(`/dashboard/stats${qs}`);
  },
  getInterviewsByDay: (departmentId?: string | null) => {
    const qs = departmentId ? `?department_id=${departmentId}` : "";
    return apiFetch<{ days: DayInterviews[] }>(`/dashboard/interviews-by-day${qs}`);
  },
  getLeadOutcomesByCandidate: (departmentId?: string | null) => {
    const qs = departmentId ? `?department_id=${departmentId}` : "";
    return apiFetch<LeadOutcomesByCandidateData>(`/dashboard/lead-outcomes-by-candidate${qs}`);
  },
};

export const leadsService = {
  list: (params?: LeadListParams) => {
    const sp = new URLSearchParams();
    if (params?.page != null) sp.set("page", String(params.page));
    if (params?.page_size != null) sp.set("page_size", String(params.page_size));
    if (params?.search?.trim()) sp.set("search", params.search.trim());
    if (params?.status && params.status !== "all") sp.set("status", params.status);
    if (params?.bd_id) sp.set("bd_id", params.bd_id);
    if (params?.resume_profile_id)
      sp.set("resume_profile_id", params.resume_profile_id);
    if (params?.candidate_id) sp.set("candidate_id", params.candidate_id);
    if (params?.outcome?.trim()) sp.set("outcome", params.outcome.trim());
    if (params?.lead_source && params.lead_source !== "all")
      sp.set("lead_source", params.lead_source);
    if (params?.sort && params.sort !== "last_activity_desc")
      sp.set("sort", params.sort);
    if (params?.department_id) sp.set("department_id", params.department_id);
    if (params?.date_from) sp.set("date_from", params.date_from);
    if (params?.date_to) sp.set("date_to", params.date_to);
    if (params?.is_converted !== undefined && params?.is_converted !== null) {
      sp.set("is_converted", String(params.is_converted));
    }
    const q = sp.toString();
    return apiFetch<LeadListPage>(`/leads/${q ? `?${q}` : ""}`);
  },
  create: (data: LeadCreate) =>
    apiFetch<LeadListItem>("/leads/", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  get: (threadId: string) => apiFetch<LeadListItem>(`/leads/${threadId}`),
  update: (threadId: string, data: LeadUpdate) =>
    apiFetch<LeadListItem>(`/leads/${threadId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  delete: (threadId: string) =>
    apiFetch<void>(`/leads/${threadId}`, { method: "DELETE" }),
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
  toggleStatus: (id: string) =>
    apiFetch<BusinessDeveloper>(`/business-developers/${id}/status`, { method: "PATCH" }),
  delete: (id: string) =>
    apiFetch<void>(`/business-developers/${id}`, { method: "DELETE" }),
};

// ─── Candidates ─────────────────────────────────────────────

export const candidatesService = {
  list: (params?: { department_id?: string | null; is_active?: boolean }) => {
    const sp = new URLSearchParams();
    if (params?.department_id) sp.set("department_id", params.department_id);
    if (params?.is_active !== undefined) sp.set("is_active", String(params.is_active));
    const q = sp.toString();
    return apiFetch<Candidate[]>(`/candidates/${q ? `?${q}` : ""}`);
  },
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
  toggleStatus: (id: string) =>
    apiFetch<Candidate>(`/candidates/${id}/status`, { method: "PATCH" }),
  delete: (id: string) =>
    apiFetch<void>(`/candidates/${id}`, { method: "DELETE" }),
};

// ─── Resume Profiles ────────────────────────────────────────

export const profilesService = {
  list: (params?: { department_id?: string | null }) => {
    const q = params?.department_id ? `?department_id=${params.department_id}` : "";
    return apiFetch<ResumeProfile[]>(`/resume-profiles/${q}`);
  },
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

// ─── Job Roles ──────────────────────────────────────────────

export const jobRolesService = {
  list: () => apiFetch<import("./types").JobRole[]>("/job-roles/"),
  create: (name: string) =>
    apiFetch<import("./types").JobRole>("/job-roles/", {
      method: "POST",
      body: JSON.stringify({ name }),
    }),
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
  getLead: (threadId: string) =>
    apiFetch<LeadThreadRead>(`/interviews/thread/${threadId}/lead`),
  updateLead: (threadId: string, data: LeadThreadUpdate) =>
    apiFetch<LeadThreadRead>(`/interviews/thread/${threadId}/lead`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
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
  uploadInterviewDoc: (id: string, file: File, onProgress?: (pct: number) => void) =>
    interviewsService._presignAndUpload(id, "document", file, onProgress),

  uploadInterviewResume: (id: string, file: File, onProgress?: (pct: number) => void) =>
    interviewsService._presignAndUpload(id, "resume", file, onProgress),

  /** Upload a file via multipart POST to the backend (always works; used as fallback). */
  _uploadViaProxy: (
    id: string,
    uploadType: "document" | "resume",
    file: File,
    onProgress?: (pct: number) => void,
  ): Promise<Interview> => {
    const token = getToken();
    const endpoint = uploadType === "document"
      ? `/interviews/${id}/document`
      : `/interviews/${id}/resume`;
    return new Promise<Interview>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${API_V1}${endpoint}`, true);
      if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      if (onProgress) {
        xhr.upload.addEventListener("progress", (e) => {
          if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
        });
      }
      xhr.onload = () => {
        if (xhr.status === 401) { clearToken(); window.location.href = "/login"; return; }
        if (xhr.status >= 200 && xhr.status < 300) {
          try { resolve(JSON.parse(xhr.responseText) as Interview); }
          catch { reject(new Error("Invalid response from server")); }
        } else {
          try { reject(new Error(JSON.parse(xhr.responseText).detail || `API Error: ${xhr.status}`)); }
          catch { reject(new Error(`API Error: ${xhr.status}`)); }
        }
      };
      xhr.onerror = () => reject(new Error("Upload network error"));
      const formData = new FormData();
      formData.append("file", file);
      xhr.send(formData);
    });
  },

  _presignAndUpload: async (
    id: string,
    uploadType: "document" | "resume",
    file: File,
    onProgress?: (pct: number) => void,
  ) => {
    const token = getToken();
    const jsonHeaders: Record<string, string> = { "Content-Type": "application/json" };
    if (token) jsonHeaders["Authorization"] = `Bearer ${token}`;

    // Step 1: get presigned PUT URL
    const presignRes = await fetch(`${API_V1}/interviews/${id}/presign-upload`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ upload_type: uploadType, content_type: file.type }),
    });
    if (!presignRes.ok) {
      const error = await presignRes.json().catch(() => ({ detail: presignRes.statusText }));
      if (presignRes.status === 401) { clearToken(); window.location.href = "/login"; }
      throw new Error(error.detail || `API Error: ${presignRes.status}`);
    }
    const { upload_url, s3_key } = await presignRes.json() as { upload_url: string; s3_key: string };

    // Step 2: PUT directly to S3 via XHR for progress events.
    // If S3 CORS blocks the request, fall back to the backend-proxy upload.
    const s3Ok = await new Promise<boolean>((resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", upload_url, true);
      xhr.setRequestHeader("Content-Type", file.type);
      if (onProgress) {
        xhr.upload.addEventListener("progress", (e) => {
          if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
        });
      }
      xhr.onload = () => resolve(xhr.status >= 200 && xhr.status < 300);
      xhr.onerror = () => resolve(false); // CORS/network failure → signal fallback
      xhr.send(file);
    });

    if (!s3Ok) {
      // Direct S3 upload blocked (CORS not configured on bucket). Route through backend instead.
      if (onProgress) onProgress(0); // reset bar so proxy progress starts clean
      return interviewsService._uploadViaProxy(id, uploadType, file, onProgress);
    }

    // Step 3: tell the backend to persist the URL
    const confirmRes = await fetch(`${API_V1}/interviews/${id}/confirm-upload`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ upload_type: uploadType, s3_key }),
    });
    if (!confirmRes.ok) {
      const error = await confirmRes.json().catch(() => ({ detail: confirmRes.statusText }));
      if (confirmRes.status === 401) { clearToken(); window.location.href = "/login"; }
      throw new Error(error.detail || `API Error: ${confirmRes.status}`);
    }
    return confirmRes.json() as Promise<Interview>;
  },
  delete: (id: string) =>
    apiFetch<void>(`/interviews/${id}`, { method: "DELETE" }),
};

// ─── Activities ─────────────────────────────────────────────

export const activitiesService = {
  list: (params?: { limit?: number; offset?: number }) => {
    const query = params
      ? "?" +
        new URLSearchParams(
          Object.entries(params).reduce<Record<string, string>>((acc, [k, v]) => {
            if (v !== undefined && v !== null) acc[k] = String(v);
            return acc;
          }, {}),
        ).toString()
      : "";
    return apiFetch<ActivityLogPage>(`/activities/${query}`);
  },
};

// ─── Users (Superadmin only) ────────────────────────────────

export const usersService = {
  list: (params?: { role?: string; department_id?: string }) => {
    const query = params
      ? "?" + new URLSearchParams(
          Object.fromEntries(
            Object.entries(params).filter(([_, v]) => v !== undefined && v !== "")
          )
        ).toString()
      : "";
    return apiFetch<User[]>(`/users/${query}`);
  },
  create: (data: UserFormData) =>
    apiFetch<User>("/users/", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (id: string, data: Partial<UserFormData>) =>
    apiFetch<User>(`/users/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    apiFetch<void>(`/users/${id}`, { method: "DELETE" }),
  toggleActive: (id: string) =>
    apiFetch<User>(`/users/${id}/toggle-active`, { method: "PATCH" }),
};

// ─── Database backup (Superadmin only) ───────────────────────

export const backupService = {
  create: () =>
    apiFetch<DatabaseBackupResult>("/admin/backup/", {
      method: "POST",
    }),
  list: () => apiFetch<DatabaseBackupListResponse>("/admin/backup/"),
};

// ─── Chat assistant ──────────────────────────────────────────

export const chatService = {
  send: (messages: { role: string; content: string }[], message: string) =>
    apiFetch<{ reply: string; actions: { type: string; description: string; id?: string }[] }>(
      "/chat/message",
      { method: "POST", body: JSON.stringify({ messages, message }) },
    ),
};

// ─── Departments ─────────────────────────────────────────────

export const departmentsService = {
  list: () => apiFetch<Department[]>("/departments/"),
  create: (data: DepartmentFormData) =>
    apiFetch<Department>("/departments/", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (id: string, data: Partial<DepartmentFormData> & { is_active?: boolean }) =>
    apiFetch<Department>(`/departments/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  deactivate: (id: string) =>
    apiFetch<void>(`/departments/${id}`, { method: "DELETE" }),
};

// ─── Busy Days (team-member & superadmin) ────────────────────

export const busyDaysService = {
  list: (params?: { user_id?: string; department_id?: string }) => {
    const sp = new URLSearchParams();
    if (params?.user_id) sp.set("user_id", params.user_id);
    if (params?.department_id) sp.set("department_id", params.department_id);
    const q = sp.toString();
    return apiFetch<BusyDay[]>(`/busy-days/${q ? `?${q}` : ""}`);
  },
  create: (data: BusyDayCreate) =>
    apiFetch<BusyDay>("/busy-days/", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    apiFetch<void>(`/busy-days/${id}`, { method: "DELETE" }),
};

// ─── Notifications (BD + superadmin) ─────────────────────────

export const notificationsService = {
  getUnresponsiveLeads: () =>
    apiFetch<import("./types").UnresponsiveLeadNotification[]>("/notifications/unresponsive-leads"),
  markRead: (threadId: string) =>
    apiFetch<void>(`/notifications/unresponsive-leads/${threadId}/read`, { method: "POST" }),
  markAllRead: () =>
    apiFetch<void>("/notifications/unresponsive-leads/mark-all-read", { method: "POST" }),
};

// ─── Broadcast Modals ─────────────────────────────────────────

export const broadcastModalService = {
  getActive: () =>
    apiFetch<BroadcastModal | null>("/broadcast-modals/active"),
  list: () =>
    apiFetch<BroadcastModal[]>("/broadcast-modals"),
  create: (data: BroadcastModalCreate) =>
    apiFetch<BroadcastModal>("/broadcast-modals", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (id: string, data: BroadcastModalUpdate) =>
    apiFetch<BroadcastModal>(`/broadcast-modals/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  publish: (id: string) =>
    apiFetch<BroadcastModal>(`/broadcast-modals/${id}/publish`, { method: "POST" }),
  unpublish: (id: string) =>
    apiFetch<BroadcastModal>(`/broadcast-modals/${id}/unpublish`, { method: "POST" }),
  delete: (id: string) =>
    apiFetch<void>(`/broadcast-modals/${id}`, { method: "DELETE" }),
};
