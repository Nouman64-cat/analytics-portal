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
  candidate_id: string;
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
}

export interface InterviewSummary {
  id: string;
  role: string;
  round: string;
  interview_date: string | null;
  status: string | null;
  computed_status: string;
  company_name?: string | null;
  candidate_name?: string | null;
}

// ─── Dashboard ──────────────────────────────────────────────

export interface DashboardStats {
  total_interviews: number;
  total_companies: number;
  total_candidates: number;
  total_jobs_closed: number;
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
