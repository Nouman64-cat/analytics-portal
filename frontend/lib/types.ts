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
  created_at: string;
  updated_at: string;
  is_active: boolean;
}

export interface Company {
  id: string;
  name: string;
  staffing_firm: string | null;
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
  candidate_metrics: Record<string, { total: number; total_resolved: number; converted: number; rate: number }>;
  recent_interviews: RecentInterview[];
}

export interface RecentInterview {
  id: string;
  company: string | null;
  candidate: string | null;
  role: string;
  round: string;
  date: string | null;
  status: string | null;
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
}

export interface CandidateFormData {
  name: string;
}

export interface CompanyFormData {
  name: string;
  staffing_firm?: string;
}

export interface ResumeProfileFormData {
  name: string;
  is_active?: boolean;
}
