// ─── Entity Types ───────────────────────────────────────────

export interface Candidate {
  id: string;
  name: string;
  /** Used for interview notification emails (SES). */
  email: string | null;
  created_at: string;
  updated_at: string;
}

export interface CandidateWithInterviews extends Candidate {
  interviews: InterviewSummary[];
}

export interface ResumeProfile {
  id: string;
  name: string;
  is_active: boolean;
  linkedin_url: string | null;
  github_url: string | null;
  portfolio_url: string | null;
  resume_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface BusinessDeveloper {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface Company {
  id: string;
  name: string;
  is_staffing_firm: boolean;
  detail: string | null;
  created_at: string;
  updated_at: string;
}

export interface CompanyWithInterviews extends Company {
  interviews: InterviewSummary[];
}

export interface Interview {
  id: string;
  company_id: string;
  /** Set per round; optional on the initial Lead row until someone is assigned. */
  candidate_id: string | null;
  resume_profile_id: string;
  /** Shared by all rounds of the same opportunity (pipeline). */
  thread_id?: string;
  /** Previous round in the chain, if any. */
  parent_interview_id: string | null;
  role: string;
  salary_range: string | null;
  round: string;
  interview_date: string | null;
  time_est: string | null;
  time_pkt: string | null;
  status: string | null;
  /** Internal notes after your presentation (SOP). */
  feedback: string | null;
  /** Notes from the recruiter (separate from pipeline status). */
  recruiter_feedback: string | null;
  bd_id: string | null;
  bd_name: string | null;
  interviewer: string | null;
  interview_link: string | null;
  interview_doc_url?: string | null;
  is_phone_call: boolean;
  computed_status: string;
  created_at: string;
  updated_at: string;
  company_name: string | null;
  candidate_name: string | null;
  resume_profile_name: string | null;
  /** When set, use for pipeline badge (full thread size); list may be scoped per user. */
  pipeline_thread_step?: number | null;
  pipeline_thread_total?: number | null;
  /** Thread-level lead (opportunity); same for all rounds in the pipeline. */
  lead_outcome?: string | null;
  lead_status_label?: string | null;
  lead_source?: string | null;
  lead_notes?: string | null;
  lead_closed_at?: string | null;
}

/** GET/PATCH /interviews/thread/:id/lead */
export interface LeadThreadRead {
  thread_id: string;
  lead_outcome: string;
  lead_status_label: string;
  lead_source: string;
  lead_notes?: string | null;
  lead_closed_at?: string | null;
}

export interface LeadThreadUpdate {
  outcome_override?: string | null;
  notes?: string | null;
  clear_override?: boolean;
  closed_at?: string | null;
  is_converted_override?: boolean | null;
}

/** POST /api/v1/leads/ */
export interface LeadCreate {
  company_id: string;
  resume_profile_id: string;
  role: string;
  salary_range?: string | null;
  bd_id?: string | null;
  /** Who entertains this lead (BD); rounds can still use other candidates. */
  candidate_id?: string | null;
  notes?: string | null;
  arrived_on?: string | null;
  is_converted_override?: boolean | null;
}

/** PATCH /api/v1/leads/{thread_id} — company cannot be changed. */
export interface LeadUpdate {
  resume_profile_id?: string;
  role?: string;
  salary_range?: string | null;
  bd_id?: string | null;
  candidate_id?: string | null;
  notes?: string | null;
  arrived_on?: string | null;
  is_converted_override?: boolean | null;
}

/** GET /api/v1/leads/ — one row per pipeline thread (parent of interview rounds). */
export interface LeadListItem {
  thread_id: string;
  company_id: string;
  company_name: string | null;
  candidate_id: string | null;
  candidate_name: string | null;
  resume_profile_id: string;
  resume_profile_name: string | null;
  primary_bd_id: string | null;
  primary_bd_name: string | null;
  interview_count: number;
  first_interview_date: string | null;
  last_interview_date: string | null;
  first_interview_id: string | null;
  /** Latest step — pass as parent_interview_id when adding the next round. */
  last_interview_id: string | null;
  /** Job title from the first step in the thread. */
  primary_role: string | null;
  /** Compensation band from the first step (opportunity default). */
  salary_range: string | null;
  /** Round label on the latest step. */
  last_round: string | null;
  is_converted: boolean;
  is_converted_override: boolean | null;
  lead_outcome: string;
  lead_status_label: string;
  lead_source: string;
  lead_notes: string | null;
}

/** GET /api/v1/leads/ — aggregates for the current filters (full filtered set, not only the page). */
export interface LeadListStats {
  total_leads: number;
  in_pipeline: number;
  /** `lead_outcome === "active"` (subset of in_pipeline-style outcomes). */
  active: number;
  converted: number;
  terminal: number;
  other: number;
  rejected: number;
  dropped: number;
  closed: number;
  dead: number;
}

/** GET /api/v1/leads/ — paginated list response. */
export interface LeadListPage {
  items: LeadListItem[];
  total: number;
  page: number;
  page_size: number;
  stats: LeadListStats;
}

export type LeadListSort =
  | "last_activity_desc"
  | "last_activity_asc"
  | "company_asc"
  | "company_desc";

export interface LeadListParams {
  page?: number;
  page_size?: number;
  search?: string;
  /** `open` = active / in-play leads (not yet a closed outcome). */
  status?: "all" | "open" | "terminal";
  bd_id?: string;
  resume_profile_id?: string;
  candidate_id?: string;
  /** Exact `lead_outcome` slug (e.g. rejected, active). */
  outcome?: string;
  lead_source?: "all" | "explicit" | "derived";
  sort?: LeadListSort;
}

export interface InterviewSummary {
  id: string;
  role: string;
  round: string;
  interview_date: string | null;
  /** Used with interview_date for Date (EST) display */
  time_est?: string | null;
  status: string | null;
  computed_status: string;
  company_name?: string | null;
  candidate_name?: string | null;
}

// ─── Dashboard ──────────────────────────────────────────────

/** Dashboard conversion rate: (converted_rounds + closed_leads) / denominator; denominator adds only rejected + dead leads. */
export interface DashboardConversionStats {
  converted_rounds: number;
  closed_leads: number;
  rejected_leads: number;
  dead_leads: number;
  denominator: number;
}

export interface DashboardStats {
  total_interviews: number;
  total_companies: number;
  total_candidates: number;
  total_jobs_closed: number;
  /** Precomputed: (converted interview rounds + closed leads) / (that + rejected + dead leads). */
  conversion_rate_percent?: number;
  conversion_stats?: DashboardConversionStats;
  /** One row per pipeline thread (lead), keyed by human label, e.g. "Lead unresponsive". */
  leads_by_status?: Record<string, number>;
  /** Distinct pipeline threads in scope. */
  total_leads?: number;
  interviews_by_status: Record<string, number>;
  interviews_by_company: Record<string, number>;
  interviews_by_candidate: Record<string, number>;
  leads_frequency_weekly: Record<string, number>;
  leads_frequency_monthly: Record<string, number>;
  candidate_metrics: Record<
    string,
    { total: number; total_resolved: number; converted: number; rate: number }
  >;
  recent_interviews: RecentInterview[];
}

export interface RecentInterview {
  id: string;
  thread_id?: string | null;
  company: string | null;
  company_id: string | null;
  company_detail: string | null;
  candidate: string | null;
  resume_profile_name: string | null;
  resume_profile_id: string | null;
  linkedin_url: string | null;
  github_url: string | null;
  portfolio_url: string | null;
  resume_url: string | null;
  role: string;
  round: string;
  date: string | null;
  status: string | null;
  computed_status: string;
  lead_status_label?: string | null;
  lead_outcome?: string | null;
  time_est: string | null;
  time_pkt: string | null;
  bd_name: string | null;
}

export interface ActivityLog {
  id: string;
  actor_user_id: string | null;
  actor_email: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  message: string;
  created_at: string;
}

export interface ActivityLogPage {
  items: ActivityLog[];
  total: number;
  limit: number;
  offset: number;
}

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: string;
  must_change_password: boolean;
  created_at: string;
  updated_at: string;
  /** Present for team-member role when a Candidate row matches this user's email. */
  candidate_id?: string | null;
}

export interface UserFormData {
  email: string;
  full_name: string;
  role: string;
}

// ─── Form Payloads ──────────────────────────────────────────

export interface InterviewFormData {
  company_id: string;
  candidate_id: string;
  resume_profile_id: string;
  role: string;
  salary_range?: string | null;
  round: string;
  interview_date?: string | null;
  time_est?: string | null;
  time_pkt?: string | null;
  status?: string | null;
  feedback?: string | null;
  recruiter_feedback?: string | null;
  bd_id?: string | null;
  interviewer?: string | null;
  interview_link?: string | null;
  is_phone_call?: boolean;
  /** Set when creating a follow-up round (next step in the pipeline). */
  parent_interview_id?: string | null;
  thread_id?: string | null;
}

/** Superadmin: POST /api/v1/admin/backup/ */
export interface DatabaseBackupResult {
  bucket: string;
  s3_key: string;
  size_bytes: number;
  created_at: string;
}

export interface DatabaseBackupListItem {
  s3_key: string;
  size_bytes: number | null;
  last_modified: string | null;
}

export interface DatabaseBackupListResponse {
  items: DatabaseBackupListItem[];
  /** Present when S3 ListBucket was denied; PutObject backups may still succeed. */
  list_unavailable_reason?: string | null;
}

export interface BusinessDeveloperFormData {
  name: string;
}

export interface CandidateFormData {
  name: string;
  email?: string | null;
}

export interface CompanyFormData {
  name: string;
  is_staffing_firm?: boolean;
  detail?: string;
}

export interface ResumeProfileFormData {
  name: string;
  is_active?: boolean;
  linkedin_url?: string;
  github_url?: string;
  portfolio_url?: string;
}
