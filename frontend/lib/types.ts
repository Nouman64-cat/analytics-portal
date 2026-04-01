// ─── Entity Types ───────────────────────────────────────────

export interface Candidate {
  id: string;
  name: string;
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
  role: string;
  salary_range: string | null;
  round: string;
  interview_date: string | null;
  time_est: string | null;
  time_pkt: string | null;
  status: string | null;
  feedback: string | null;
  bd_id: string | null;
  bd_name: string | null;
  interviewer: string | null;
  interview_link: string | null;
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
  interviews_by_status: Record<string, number>;
  interviews_by_company: Record<string, number>;
  interviews_by_candidate: Record<string, number>;
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
  role: string;
  round: string;
  date: string | null;
  status: string | null;
  computed_status: string;
  time_est: string | null;
  time_pkt: string | null;
  bd_name: string | null;
}

// ─── Form Payloads ──────────────────────────────────────────

export interface InterviewFormData {
  company_id: string;
  candidate_id: string;
  resume_profile_id: string;
  role: string;
  salary_range?: string;
  round: string;
  interview_date?: string;
  time_est?: string;
  time_pkt?: string;
  status?: string;
  feedback?: string;
  bd_id?: string;
  interviewer?: string;
  interview_link?: string;
  is_phone_call?: boolean;
}

export interface BusinessDeveloperFormData {
  name: string;
}

export interface CandidateFormData {
  name: string;
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
}
