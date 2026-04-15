"use client";

import {
  useEffect,
  useState,
  useCallback,
  useMemo,
  useRef,
  memo,
  ChangeEvent,
} from "react";
import Link from "next/link";
import {
  Plus,
  Search,
  RotateCcw,
  Ban,
  CircleSlash,
  Lock,
  Skull,
  ExternalLink,
  Activity,
  List,
  Eye,
  Pencil,
  Trash2,
} from "lucide-react";
import {
  leadsService,
  companiesService,
  profilesService,
  businessDevelopersService,
  interviewsService,
  candidatesService,
  authService,
} from "@/lib/services";
import type {
  LeadListItem,
  LeadCreate,
  LeadListStats,
  LeadListSort,
  Company,
  ResumeProfile,
  BusinessDeveloper,
  Candidate,
} from "@/lib/types";
import DeleteConfirmModal from "@/components/DeleteConfirmModal";
import {
  PageLoader,
  ErrorState,
  PageHeader,
  EmptyState,
} from "@/components/PageStates";
import StatsCard, { StatsGrid } from "@/components/StatsCard";
import Modal, {
  FormField,
  inputClass,
  selectClass,
  textareaClass,
  buttonPrimary,
  buttonSecondary,
} from "@/components/Modal";
import {
  formatDate,
  getLeadOutcomeBadgeStyle,
  getLeadOutcomeSelectShellClass,
} from "@/lib/utils";
import { LEAD_STAT_CARD_GRADIENT } from "@/lib/constants";
import { getUserRole } from "@/lib/auth";

const SORT_OPTIONS: { value: LeadListSort; label: string }[] = [
  { value: "last_activity_desc", label: "Activity · newest" },
  { value: "last_activity_asc", label: "Activity · oldest" },
  { value: "company_asc", label: "Company A–Z" },
  { value: "company_desc", label: "Company Z–A" },
];

const PAGE_SIZE = 10;
const SEARCH_DEBOUNCE_MS = 300;

function LeadOutcomeBadge({
  outcome,
  label,
}: {
  outcome: string;
  label: string;
}) {
  const s = getLeadOutcomeBadgeStyle(outcome);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${s.bg} ${s.text}`}
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${s.dot}`} />
      {label}
    </span>
  );
}

/** Local input state + debounce so the parent does not re-render on every keystroke. */
const LeadsSearchField = memo(function LeadsSearchField({
  onDebouncedChange,
  resetKey,
}: {
  onDebouncedChange: (q: string) => void;
  resetKey: number;
}) {
  const [value, setValue] = useState("");
  useEffect(() => {
    setValue("");
  }, [resetKey]);
  useEffect(() => {
    const t = setTimeout(() => onDebouncedChange(value), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [value, onDebouncedChange]);
  return (
    <div className="relative flex-1 min-w-0 min-[900px]:min-w-[220px]">
      <Search
        size={14}
        className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
      />
      <input
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search company, candidate, BD, status…"
        className="w-full rounded-lg border border-slate-200 dark:border-white/[0.08] bg-slate-50 dark:bg-white/[0.04] py-1.5 pl-8 pr-2.5 text-xs text-slate-900 dark:text-white placeholder:text-slate-400"
        autoComplete="off"
      />
    </div>
  );
});

const EMPTY_STATS: LeadListStats = {
  total_leads: 0,
  in_pipeline: 0,
  active: 0,
  terminal: 0,
  other: 0,
  rejected: 0,
  dropped: 0,
  closed: 0,
  dead: 0,
};

/** Same slugs as PATCH /interviews/thread/:id/lead (lead_thread_utils.ALLOWED_LEAD_OUTCOMES). */
const LEAD_OUTCOME_OPTIONS: { value: string; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "unresponsive", label: "Unresponsive" },
  { value: "dropped", label: "Dropped" },
  { value: "dead", label: "Dead" },
  { value: "rejected", label: "Rejected" },
  { value: "closed", label: "Closed" },
];

export default function LeadsPage() {
  const [leads, setLeads] = useState<LeadListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [stats, setStats] = useState<LeadListStats | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [profiles, setProfiles] = useState<ResumeProfile[]>([]);
  const [businessDevs, setBusinessDevs] = useState<BusinessDeveloper[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [searchResetKey, setSearchResetKey] = useState(0);
  /** After the first fetch finishes, never swap the whole page for `PageLoader` on refetch. */
  const initialFetchDone = useRef(false);
  const isFirstDebouncedPageEffect = useRef(true);
  const [bdFilter, setBdFilter] = useState<string>("all");
  const [profileFilter, setProfileFilter] = useState<string>("all");
  const [candidateFilter, setCandidateFilter] = useState<string>("all");
  const [outcomeFilter, setOutcomeFilter] = useState<string>("all");
  const [sortFilter, setSortFilter] = useState<LeadListSort>(
    "last_activity_desc",
  );

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");
  const [editingThreadId, setEditingThreadId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<LeadCreate>({
    company_id: "",
    resume_profile_id: "",
    role: "",
    salary_range: "",
    bd_id: "",
    candidate_id: "",
    notes: "",
  });

  const role = getUserRole();
  const isTeamMember = role === "team-member";
  /** Candidate row linked to the logged-in team member (null for other roles). */
  const [meCandidateId, setMeCandidateId] = useState<string | null>(null);
  /** Create / edit / delete leads and lead status — superadmin and team member only. BD and manager: read-only. */
  const canMutateLeads = role === "superadmin" || role === "team-member";
  const canEditLeadStatus = canMutateLeads;
  const [savingLeadThreadId, setSavingLeadThreadId] = useState<string | null>(
    null,
  );
  const [detailLead, setDetailLead] = useState<LeadListItem | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [deleteLead, setDeleteLead] = useState<LeadListItem | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  useEffect(() => {
    if (isFirstDebouncedPageEffect.current) {
      isFirstDebouncedPageEffect.current = false;
      return;
    }
    setPage(1);
  }, [debouncedSearch]);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [leadPage, cos, profs, bds, cands] = await Promise.all([
        leadsService.list({
          page,
          page_size: PAGE_SIZE,
          search: debouncedSearch.trim() || undefined,
          bd_id: bdFilter !== "all" ? bdFilter : undefined,
          resume_profile_id:
            profileFilter !== "all" ? profileFilter : undefined,
          candidate_id: candidateFilter !== "all" ? candidateFilter : undefined,
          outcome: outcomeFilter !== "all" ? outcomeFilter : undefined,
          sort: sortFilter,
        }),
        companiesService.list(),
        profilesService.list(),
        businessDevelopersService.list(),
        candidatesService.list(),
      ]);
      setLeads(leadPage.items);
      setTotal(leadPage.total);
      setStats(leadPage.stats);
      setCompanies(cos);
      setProfiles(profs);
      setBusinessDevs(bds);
      setCandidates(cands);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load leads");
    } finally {
      setLoading(false);
      initialFetchDone.current = true;
    }
  }, [
    page,
    debouncedSearch,
    bdFilter,
    profileFilter,
    candidateFilter,
    outcomeFilter,
    sortFilter,
  ]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  // Resolve the team member's own candidate_id once on mount
  useEffect(() => {
    if (role !== "team-member") return;
    authService.getMe().then((me) => {
      if (me?.candidate_id) setMeCandidateId(me.candidate_id);
    }).catch(() => {/* silently ignore */});
  }, [role]);

  const bdOptions = useMemo(
    () =>
      [...businessDevs]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((b) => [b.id, b.name] as [string, string]),
    [businessDevs],
  );

  const profileOptions = useMemo(
    () =>
      [...profiles].sort((a, b) => a.name.localeCompare(b.name)),
    [profiles],
  );
  const candidateOptions = useMemo(
    () => [...candidates].sort((a, b) => a.name.localeCompare(b.name)),
    [candidates],
  );

  const filtersAreDefault = useMemo(
    () =>
      !debouncedSearch.trim() &&
      bdFilter === "all" &&
      profileFilter === "all" &&
      candidateFilter === "all" &&
      outcomeFilter === "all" &&
      sortFilter === "last_activity_desc",
    [
      debouncedSearch,
      bdFilter,
      profileFilter,
      candidateFilter,
      outcomeFilter,
      sortFilter,
    ],
  );

  const displayStats = stats ?? EMPTY_STATS;

  const resetFilters = useCallback(() => {
    setDebouncedSearch("");
    setSearchResetKey((k) => k + 1);
    setBdFilter("all");
    setProfileFilter("all");
    setCandidateFilter("all");
    setOutcomeFilter("all");
    setSortFilter("last_activity_desc");
    setPage(1);
  }, []);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE) || 1);
  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, total);

  const handleLeadStatusChange = async (
    lead: LeadListItem,
    e: ChangeEvent<HTMLSelectElement>,
  ) => {
    const v = e.target.value;
    setSavingLeadThreadId(lead.thread_id);
    try {
      if (v === "") {
        await interviewsService.updateLead(lead.thread_id, {
          clear_override: true,
        });
      } else {
        await interviewsService.updateLead(lead.thread_id, {
          outcome_override: v,
        });
      }
      await fetchData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to update lead status");
    } finally {
      setSavingLeadThreadId(null);
    }
  };

  const openCreateModal = () => {
    setModalMode("create");
    setEditingThreadId(null);
    setForm({
      company_id: "",
      resume_profile_id: "",
      role: "",
      salary_range: "",
      bd_id: "",
      // Auto-select the team member's own candidate
      candidate_id: isTeamMember && meCandidateId ? meCandidateId : "",
      notes: "",
    });
    setModalOpen(true);
  };

  const openEditModal = (lead: LeadListItem) => {
    setModalMode("edit");
    setEditingThreadId(lead.thread_id);
    setForm({
      company_id: lead.company_id,
      resume_profile_id: lead.resume_profile_id,
      role: lead.primary_role ?? "",
      salary_range: lead.salary_range ?? "",
      bd_id: lead.primary_bd_id ?? "",
      candidate_id: lead.candidate_id ?? "",
      notes: lead.lead_notes ?? "",
    });
    setModalOpen(true);
  };

  const openDetailModal = (lead: LeadListItem) => {
    setDetailLead(lead);
    setDetailLoading(true);
    void (async () => {
      try {
        const fresh = await leadsService.get(lead.thread_id);
        setDetailLead(fresh);
      } catch (e) {
        alert(e instanceof Error ? e.message : "Failed to load lead");
        setDetailLead(null);
      } finally {
        setDetailLoading(false);
      }
    })();
  };

  const handleSubmitLead = async () => {
    if (modalMode === "create") {
      if (!form.company_id || !form.resume_profile_id || !form.role.trim()) {
        alert("Company, resume profile, and role are required.");
        return;
      }
      setSubmitting(true);
      try {
        const payload: LeadCreate = {
          company_id: form.company_id,
          resume_profile_id: form.resume_profile_id,
          role: form.role.trim(),
          salary_range: form.salary_range?.trim() || null,
          bd_id: form.bd_id || null,
          candidate_id: form.candidate_id?.trim() || null,
          notes: form.notes?.trim() || null,
        };
        await leadsService.create(payload);
        resetLeadFormModal();
        await fetchData();
      } catch (e) {
        alert(e instanceof Error ? e.message : "Failed to create lead");
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (!editingThreadId || !form.resume_profile_id || !form.role.trim()) {
      alert("Resume profile and role are required.");
      return;
    }
    setSubmitting(true);
    try {
      await leadsService.update(editingThreadId, {
        resume_profile_id: form.resume_profile_id,
        role: form.role.trim(),
        salary_range: form.salary_range?.trim() || null,
        bd_id: form.bd_id || null,
        candidate_id: form.candidate_id?.trim() || null,
        notes: form.notes?.trim() || null,
      });
      resetLeadFormModal();
      await fetchData();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to update lead");
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmDeleteLead = async () => {
    if (!deleteLead) return;
    setDeleteSubmitting(true);
    try {
      await leadsService.delete(deleteLead.thread_id);
      setDeleteLead(null);
      await fetchData();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to delete lead");
    } finally {
      setDeleteSubmitting(false);
    }
  };

  const resetLeadFormModal = () => {
    setModalOpen(false);
    setEditingThreadId(null);
    setModalMode("create");
  };

  const closeLeadFormModal = () => {
    if (submitting) return;
    resetLeadFormModal();
  };

  const compactLabel =
    "text-[10px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide";
  /** Tighter than modal defaults — keeps the filter bar short. */
  const filterSelectClass = `${selectClass} text-xs py-1.5 px-2 min-h-[2rem] rounded-lg`;

  if (loading && !initialFetchDone.current) return <PageLoader />;
  if (error) return <ErrorState message={error} onRetry={fetchData} />;

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      <PageHeader
        title="Leads"
        subtitle={
          canMutateLeads
            ? "One row per company (one lead). Add a lead once per company, then add interview rounds on the Interviews page."
            : "View opportunities by company. Creating and editing leads is limited to superadmin and team members."
        }
        action={
          canMutateLeads ? (
            <button type="button" onClick={openCreateModal} className={buttonPrimary}>
              <Plus size={16} />
              Add lead
            </button>
          ) : null
        }
      />

      <p className="text-sm text-slate-600 dark:text-slate-400">
        All counts below match your current filters and search.
        {canMutateLeads ? (
          <>
            {" "}
            If you set a lead to{" "}
            <span className="font-medium text-slate-700 dark:text-slate-300">Unresponsive</span>{" "}
            explicitly, it is automatically marked{" "}
            <span className="font-medium text-slate-700 dark:text-slate-300">Dead</span> after 30
            days (background job).
          </>
        ) : null}
      </p>

      <StatsGrid cols={6}>
        <StatsCard
          title="Total leads"
          value={total}
          icon={List}
          gradient={LEAD_STAT_CARD_GRADIENT.total}
        />
        <StatsCard
          title="Active"
          value={displayStats.active}
          icon={Activity}
          gradient={LEAD_STAT_CARD_GRADIENT.active}
        />
        <StatsCard
          title="Rejected"
          value={displayStats.rejected}
          icon={Ban}
          gradient={LEAD_STAT_CARD_GRADIENT.rejected}
        />
        <StatsCard
          title="Dropped"
          value={displayStats.dropped}
          icon={CircleSlash}
          gradient={LEAD_STAT_CARD_GRADIENT.dropped}
        />
        <StatsCard
          title="Closed"
          value={displayStats.closed}
          icon={Lock}
          gradient={LEAD_STAT_CARD_GRADIENT.closed}
        />
        <StatsCard
          title="Dead"
          value={displayStats.dead}
          icon={Skull}
          gradient={LEAD_STAT_CARD_GRADIENT.dead}
        />
      </StatsGrid>
      {displayStats.other > 0 && (
        <p className="text-xs text-slate-500 dark:text-slate-400 -mt-2">
          {displayStats.other} lead{displayStats.other === 1 ? "" : "s"} in other
          states (e.g. in pipeline).
        </p>
      )}

      <div className="rounded-xl border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-[#12141c] p-3 sm:p-4">
        <div className="flex flex-col gap-2 sm:gap-2.5 mb-3">
          <div className="flex flex-col gap-2 min-[900px]:flex-row min-[900px]:items-center min-[900px]:gap-3">
            <LeadsSearchField
              resetKey={searchResetKey}
              onDebouncedChange={setDebouncedSearch}
            />
            <button
              type="button"
              onClick={resetFilters}
              title="Reset filters"
              aria-label="Reset filters"
              className={`inline-flex items-center justify-center gap-1.5 shrink-0 self-start min-[900px]:self-auto ${buttonSecondary} text-xs py-1.5 px-2.5`}
            >
              <RotateCcw size={13} className="shrink-0" />
              <span>Reset</span>
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-x-2 gap-y-2">
            <label className="flex min-w-0 flex-col gap-0.5">
              <span className={compactLabel}>BD</span>
              <select
                value={bdFilter}
                onChange={(e) => {
                  setBdFilter(e.target.value);
                  setPage(1);
                }}
                className={filterSelectClass}
                title="Business developer"
              >
                <option value="all">All BDs</option>
                {bdOptions.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-0 flex-col gap-0.5">
              <span className={compactLabel}>Profile</span>
              <select
                value={profileFilter}
                onChange={(e) => {
                  setProfileFilter(e.target.value);
                  setPage(1);
                }}
                className={filterSelectClass}
                title="Resume profile"
              >
                <option value="all">All</option>
                {profileOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-0 flex-col gap-0.5">
              <span className={compactLabel}>Candidate</span>
              <select
                value={candidateFilter}
                onChange={(e) => {
                  setCandidateFilter(e.target.value);
                  setPage(1);
                }}
                className={filterSelectClass}
              >
                <option value="all">All</option>
                {candidateOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-0 flex-col gap-0.5">
              <span className={compactLabel}>Outcome</span>
              <select
                value={outcomeFilter}
                onChange={(e) => {
                  setOutcomeFilter(e.target.value);
                  setPage(1);
                }}
                className={filterSelectClass}
                title="Lead outcome"
              >
                <option value="all">Any</option>
                {LEAD_OUTCOME_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-0 flex-col gap-0.5">
              <span className={compactLabel}>Sort</span>
              <select
                value={sortFilter}
                onChange={(e) => {
                  setSortFilter(e.target.value as LeadListSort);
                  setPage(1);
                }}
                className={filterSelectClass}
              >
                {SORT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {leads.length === 0 ? (
          <EmptyState
            message={
              total === 0 && filtersAreDefault
                ? "No leads yet — click Add lead or create interviews from the Interviews page."
                : "No matches — adjust filters or search."
            }
          />
        ) : (
          <div className="overflow-x-auto -mx-1">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-white/[0.06] text-xs uppercase tracking-wider text-slate-500">
                  <th className="py-3 pr-4 font-medium">Company</th>
                  <th className="py-3 pr-4 font-medium">Status</th>
                  <th className="py-3 pr-4 font-medium">Entertains</th>
                  <th className="py-3 pr-4 font-medium">BD</th>
                  <th className="py-3 pr-4 font-medium">Rounds</th>
                  <th className="py-3 pr-4 font-medium">Last activity</th>
                  <th className="py-3 text-center font-medium">Interviews</th>
                  <th className="py-3 text-right font-medium w-[1%] whitespace-nowrap pl-2">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/[0.04]">
                {leads.map((l) => (
                  <tr key={l.thread_id} className="hover:bg-slate-50/80 dark:hover:bg-white/[0.02]">
                    <td className="py-3 pr-4 text-slate-800 dark:text-slate-200">
                      {l.company_name ?? "—"}
                    </td>
                    <td className="py-3 pr-4 align-top min-w-[200px]">
                      {canEditLeadStatus ? (
                        <select
                          value={
                            l.lead_source === "explicit" && l.lead_outcome
                              ? l.lead_outcome
                              : ""
                          }
                          disabled={savingLeadThreadId === l.thread_id}
                          onChange={(e) => void handleLeadStatusChange(l, e)}
                          className={`w-full max-w-[min(100%,260px)] rounded-lg border px-2 py-1.5 text-xs appearance-none ${getLeadOutcomeSelectShellClass(l.lead_outcome)}`}
                          aria-label="Lead status"
                        >
                          <option value="">
                            {l.lead_source === "explicit" && l.lead_outcome
                              ? "Use status from interviews"
                              : (l.lead_status_label || "—")}
                          </option>
                          {LEAD_OUTCOME_OPTIONS.filter(
                            (o) =>
                              !(
                                l.lead_source === "derived" &&
                                (l.lead_outcome || "").toLowerCase() === "active" &&
                                o.value === "active"
                              ),
                          ).map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <LeadOutcomeBadge
                          outcome={l.lead_outcome || ""}
                          label={l.lead_status_label || "—"}
                        />
                      )}
                    </td>
                    <td className="py-3 pr-4 text-slate-800 dark:text-slate-200">
                      {l.candidate_name ?? "—"}
                    </td>
                    <td className="py-3 pr-4 text-slate-800 dark:text-slate-200">
                      {l.primary_bd_name ?? "—"}
                    </td>
                    <td className="py-3 pr-4 tabular-nums text-slate-700 dark:text-slate-300">
                      {l.interview_count}
                    </td>
                    <td className="py-3 pr-4 text-slate-600 dark:text-slate-400 whitespace-nowrap">
                      {l.last_interview_date ? formatDate(l.last_interview_date) : "—"}
                    </td>
                    <td className="py-3 align-middle text-center">
                      {l.first_interview_id ? (
                        <Link
                          href={`/interviews?id=${l.first_interview_id}`}
                          className="inline-flex items-center justify-center gap-1.5 text-indigo-600 dark:text-indigo-400 hover:underline font-medium mx-auto"
                        >
                          <ExternalLink size={14} className="shrink-0 opacity-90" aria-hidden />
                          View interviews
                        </Link>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="py-3 align-middle text-right pl-2">
                      <div className="inline-flex items-center justify-end gap-0.5">
                        <button
                          type="button"
                          onClick={() => openDetailModal(l)}
                          className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-white/[0.06] dark:hover:text-slate-200"
                          title="View lead"
                          aria-label="View lead"
                        >
                          <Eye size={16} />
                        </button>
                        {canMutateLeads ? (
                          <>
                            <button
                              type="button"
                              onClick={() => openEditModal(l)}
                              className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-indigo-600 dark:hover:bg-white/[0.06] dark:hover:text-indigo-400"
                              title="Edit lead"
                              aria-label="Edit lead"
                            >
                              <Pencil size={16} />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteLead(l)}
                              className="rounded-lg p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                              title="Delete lead"
                              aria-label="Delete lead"
                            >
                              <Trash2 size={16} />
                            </button>
                          </>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {total > 0 ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 dark:border-white/[0.06] pt-4">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Showing{" "}
              <strong className="text-slate-700 dark:text-slate-200">
                {rangeStart}–{rangeEnd}
              </strong>{" "}
              of <strong className="text-slate-700 dark:text-slate-200">{total}</strong> (page{" "}
              {page} of {totalPages}).{" "}
              <span className="text-slate-500 dark:text-slate-500">
                {PAGE_SIZE} per page
              </span>
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className={`${buttonSecondary} text-sm py-1.5 px-3 disabled:opacity-50 disabled:pointer-events-none`}
              >
                Previous
              </button>
              <span className="text-sm text-slate-600 dark:text-slate-400 tabular-nums">
                {page} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className={`${buttonSecondary} text-sm py-1.5 px-3 disabled:opacity-50 disabled:pointer-events-none`}
              >
                Next
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <Modal
        open={modalOpen}
        onClose={closeLeadFormModal}
        title={modalMode === "create" ? "Add lead" : "Edit lead"}
        size="lg"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-4">
          <FormField label="Company">
            {modalMode === "create" ? (
              <select
                value={form.company_id}
                onChange={(e) => setForm((f) => ({ ...f, company_id: e.target.value }))}
                className={selectClass}
                required
              >
                <option value="">Select company…</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            ) : (
              <input
                value={
                  companies.find((c) => c.id === form.company_id)?.name ??
                  "—"
                }
                className={`${inputClass} opacity-80 cursor-not-allowed`}
                readOnly
                disabled
                aria-readonly
              />
            )}
          </FormField>
          <FormField label="Resume profile">
            <select
              value={form.resume_profile_id}
              onChange={(e) =>
                setForm((f) => ({ ...f, resume_profile_id: e.target.value }))
              }
              className={selectClass}
              required
            >
              <option value="">Select profile…</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Role / job title">
            <input
              value={form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
              className={inputClass}
              placeholder="e.g. Senior Software Engineer"
              required
            />
          </FormField>
          <FormField label="Salary range (optional)">
            <input
              value={form.salary_range || ""}
              onChange={(e) =>
                setForm((f) => ({ ...f, salary_range: e.target.value }))
              }
              className={inputClass}
              placeholder="e.g. $150k – $180k"
            />
          </FormField>
          <FormField label="Business developer (optional)">
            <select
              value={form.bd_id || ""}
              onChange={(e) =>
                setForm((f) => ({ ...f, bd_id: e.target.value || "" }))
              }
              className={selectClass}
            >
              <option value="">—</option>
              {businessDevs.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Entertains By (Candidate)">
            {isTeamMember && modalMode === "create" && meCandidateId ? (
              // Team member: show their own candidate as a read-only display
              <div className={`${selectClass} flex items-center gap-2 bg-slate-50 dark:bg-white/[0.03] cursor-not-allowed opacity-80`}>
                <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-500/20 text-[9px] font-bold text-indigo-700 dark:text-indigo-300">
                  {(candidates.find((c) => c.id === meCandidateId)?.name ?? "?")
                    .split(" ")
                    .filter(Boolean)
                    .map((p) => p[0])
                    .slice(0, 2)
                    .join("")
                    .toUpperCase()}
                </span>
                <span className="text-sm text-slate-800 dark:text-slate-200">
                  {candidates.find((c) => c.id === meCandidateId)?.name ?? "Your candidate"}
                </span>
              </div>
            ) : (
              <select
                value={form.candidate_id || ""}
                onChange={(e) =>
                  setForm((f) => ({ ...f, candidate_id: e.target.value || "" }))
                }
                className={selectClass}
              >
                <option value="">—</option>
                {candidates
                  .slice()
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            )}
          </FormField>
          <div className="sm:col-span-2">
            <FormField label="Notes (optional)">
              <textarea
                value={form.notes || ""}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                className={textareaClass}
                rows={2}
                placeholder="Context for this lead…"
              />
            </FormField>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-3 border-t border-slate-100 dark:border-white/[0.06] pt-4">
          <button
            type="button"
            onClick={closeLeadFormModal}
            disabled={submitting}
            className={buttonSecondary}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSubmitLead()}
            disabled={submitting}
            className={`${buttonPrimary} disabled:opacity-60`}
          >
            {submitting
              ? modalMode === "create"
                ? "Creating…"
                : "Saving…"
              : modalMode === "create"
                ? "Create lead"
                : "Save changes"}
          </button>
        </div>
      </Modal>

      <Modal
        open={detailLead !== null}
        onClose={() => !detailLoading && setDetailLead(null)}
        title="Lead details"
        size="lg"
      >
        {detailLead ? (
          <div className="space-y-4">
            {detailLoading ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">Refreshing…</p>
            ) : null}
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <div>
                <dt className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                  Company
                </dt>
                <dd className="mt-0.5 text-slate-900 dark:text-slate-100">
                  {detailLead.company_name ?? "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                  Status
                </dt>
                <dd className="mt-0.5">
                  <LeadOutcomeBadge
                    outcome={detailLead.lead_outcome || ""}
                    label={detailLead.lead_status_label || "—"}
                  />
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                  Entertains
                </dt>
                <dd className="mt-0.5 text-slate-900 dark:text-slate-100">
                  {detailLead.candidate_name ?? "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                  BD
                </dt>
                <dd className="mt-0.5 text-slate-900 dark:text-slate-100">
                  {detailLead.primary_bd_name ?? "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                  Resume profile
                </dt>
                <dd className="mt-0.5 text-slate-900 dark:text-slate-100">
                  {detailLead.resume_profile_name ?? "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                  Role
                </dt>
                <dd className="mt-0.5 text-slate-900 dark:text-slate-100">
                  {detailLead.primary_role ?? "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                  Salary range
                </dt>
                <dd className="mt-0.5 text-slate-900 dark:text-slate-100">
                  {detailLead.salary_range ?? "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                  Rounds
                </dt>
                <dd className="mt-0.5 tabular-nums text-slate-900 dark:text-slate-100">
                  {detailLead.interview_count}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                  Last activity
                </dt>
                <dd className="mt-0.5 text-slate-900 dark:text-slate-100 whitespace-nowrap">
                  {detailLead.last_interview_date
                    ? formatDate(detailLead.last_interview_date)
                    : "—"}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                  Notes
                </dt>
                <dd className="mt-0.5 text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
                  {detailLead.lead_notes?.trim() ? detailLead.lead_notes : "—"}
                </dd>
              </div>
            </dl>
            {detailLead.first_interview_id ? (
              <div className="pt-2 border-t border-slate-100 dark:border-white/[0.06]">
                <Link
                  href={`/interviews?id=${detailLead.first_interview_id}`}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  <ExternalLink size={14} className="shrink-0" aria-hidden />
                  Open interviews for this lead
                </Link>
              </div>
            ) : null}
            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setDetailLead(null)}
                className={buttonSecondary}
              >
                Close
              </button>
            </div>
          </div>
        ) : null}
      </Modal>

      <DeleteConfirmModal
        open={deleteLead !== null}
        onClose={() => !deleteSubmitting && setDeleteLead(null)}
        onConfirm={() => void handleConfirmDeleteLead()}
        isDeleting={deleteSubmitting}
        title="Delete lead"
        description="All interview rounds in this pipeline will be removed. This cannot be undone."
        itemName={deleteLead?.company_name?.trim() ? deleteLead.company_name : "This lead"}
        itemDetail={
          deleteLead
            ? `${deleteLead.interview_count} round${deleteLead.interview_count === 1 ? "" : "s"} in this thread`
            : undefined
        }
      />
    </div>
  );
}
