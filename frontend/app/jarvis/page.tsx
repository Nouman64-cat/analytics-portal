"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  Send,
  Wand2,
  Star,
  User,
  Building2,
  Briefcase,
  CalendarCheck,
  RefreshCw,
  Flag,
  Loader2,
  Sparkles,
  BarChart3,
  Copy,
  Check,
  AlertTriangle,
  X as XIcon,
  RotateCcw,
  CheckCircle2,
  Crown,
  ShieldCheck,
  MessageCircleQuestion,
  UserRound,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { chatService, authService, businessDevelopersService, candidatesService, profilesService } from "@/lib/services";
import { getUserRole } from "@/lib/auth";
import { useDepartmentContext } from "@/lib/DepartmentContext";
import { PageHeader, PageLoader } from "@/components/PageStates";
import type { ChatMessage, ChatAction, BusinessDeveloper, Candidate, ResumeProfile } from "@/lib/types";

type MentionKind = "bd" | "candidate" | "profile";
interface MentionOption {
  id: string;
  name: string;
  is_active?: boolean;
}

// Each entry matches its trigger word(s) as a standalone phrase while typing, capturing
// whatever's typed right after it as a live filter query — e.g. "business developer sa" keeps
// matching with query "sa". Used to trigger the mention picker dropdown in the composer.
const MENTION_TRIGGERS: { kind: MentionKind; re: RegExp; label: string }[] = [
  { kind: "bd", re: /\b(?:business\s+developer|business\s+dev|bd)\b[ \t]*([a-zA-Z]*)$/i, label: "BD" },
  { kind: "candidate", re: /\bcandidate\b[ \t]*([a-zA-Z]*)$/i, label: "Candidate" },
  {
    kind: "profile",
    re: /\b(?:resume\s+profile|resume|profile)\b[ \t]*([a-zA-Z]*)$/i,
    label: "Resume Profile",
  },
];

const MENTION_COPY: Record<MentionKind, { heading: string; empty: string; icon: React.ElementType }> = {
  bd: { heading: "Select a business developer", empty: "No matching business developers", icon: UserRound },
  candidate: { heading: "Select a candidate", empty: "No matching candidates", icon: User },
  profile: { heading: "Select a resume profile", empty: "No matching resume profiles", icon: Briefcase },
};

// Persisted across page navigation (component unmount/remount) so switching pages doesn't
// wipe the conversation — only the explicit "New conversation" button should do that.
const CHAT_STORAGE_KEY = "jarvis_chat_messages";

function loadStoredMessages(): ChatMessage[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(CHAT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : null;
  } catch {
    return null;
  }
}

const WELCOME: ChatMessage = {
  role: "assistant",
  content:
    "Hi, I'm Jarvis. I can help you:\n\n• **Add a new company** to the database\n• **Create a lead** (open a pipeline opportunity)\n• **Schedule an interview** round\n• **Update interview or lead status**\n• **Generate weekly summaries** of leads and interviews (super admin)\n\nJust tell me what you'd like to do in plain English — I'll show you exactly what I'm about to do and wait for your confirmation before anything is actually created or changed.",
};

const SUGGESTED_PROMPTS: { icon: React.ElementType; text: string }[] = [
  { icon: BarChart3, text: "Summary of interviews for the current week" },
  { icon: Briefcase, text: "Add a lead for Google — Senior Engineer role" },
  { icon: CalendarCheck, text: "Schedule a phone screen with Microsoft tomorrow at 2pm" },
  { icon: Building2, text: "Add a new company called Stripe" },
  { icon: Flag, text: "Mark the Acme Corp lead as rejected" },
];

const PREMIUM_FEATURES = [
  "Create leads, companies, and interviews just by typing in plain English",
  "Instant weekly pipeline summaries — no manual report-building",
  "Update interview and lead status conversationally",
  "Every write is confirmed before it happens — nothing changes without your approval",
  "Deep pipeline analytics and insights (admin)",
];

const ACTION_ICON: Record<string, React.ElementType> = {
  company_created: Building2,
  lead_created: Briefcase,
  interview_scheduled: CalendarCheck,
  interview_updated: RefreshCw,
  lead_updated: Briefcase,
  lead_outcome_updated: Flag,
  summary_generated: BarChart3,
};

const ACTION_COLOR: Record<string, string> = {
  company_created: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20",
  lead_created: "bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/20",
  interview_scheduled: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20",
  interview_updated: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20",
  lead_updated: "bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/20",
  lead_outcome_updated: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20",
  summary_generated: "bg-teal-500/10 text-teal-700 dark:text-teal-300 border-teal-500/20",
};

// Icons for the pending-confirmation card, keyed by the raw tool name.
const PENDING_ICON: Record<string, React.ElementType> = {
  create_company: Building2,
  create_lead: Briefcase,
  schedule_interview: CalendarCheck,
  update_interview: RefreshCw,
  update_lead: RefreshCw,
  update_lead_outcome: Flag,
};

function formatClock(ts?: number): string {
  if (!ts) return "";
  return new Date(ts).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function ActionCard({ action }: { action: ChatAction }) {
  const Icon = ACTION_ICON[action.type] ?? Sparkles;
  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold ${ACTION_COLOR[action.type] ?? "bg-slate-500/10 text-slate-600 border-slate-500/20"}`}
    >
      <Icon size={13} />
      {action.description}
    </div>
  );
}

/** The confirmation widget — nothing the assistant proposes is real until the user acts
 * on this. Shows the actual field-level breakdown of what's about to be written, not
 * just a one-line summary, so "confirm" means something. */
function PendingActionCard({
  message,
  busy,
  onConfirm,
  onCancel,
}: {
  message: ChatMessage;
  busy: boolean;
  onConfirm: (id: string) => void;
  onCancel: (id: string) => void;
}) {
  if (!message.pendingAction) return null;
  const { id, summary, details, actionType } = message.pendingAction;
  const Icon = PENDING_ICON[actionType] ?? AlertTriangle;

  if (message.pendingResolved === "confirmed") {
    return (
      <div className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
        <Check size={13} />
        Confirmed
      </div>
    );
  }
  if (message.pendingResolved === "cancelled") {
    return (
      <div className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300/60 dark:border-white/10 bg-slate-100 dark:bg-white/[0.04] px-2.5 py-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
        <XIcon size={13} />
        Cancelled
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm overflow-hidden rounded-2xl border border-amber-300/60 dark:border-amber-400/25 bg-amber-50/80 dark:bg-amber-500/[0.08] shadow-sm">
      <div className="flex items-center gap-2 border-b border-amber-300/40 dark:border-amber-400/15 bg-amber-100/60 dark:bg-amber-500/10 px-3.5 py-2.5">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-500/20 text-amber-700 dark:text-amber-300">
          <Icon size={14} />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
            Confirmation needed
          </p>
          <p className="truncate text-sm font-semibold text-amber-900 dark:text-amber-200">{summary}</p>
        </div>
      </div>

      {details.length > 0 && (
        <div className="divide-y divide-amber-200/50 dark:divide-amber-400/10 px-3.5 py-1.5">
          {details.map((d, i) => (
            <div key={i} className="flex items-start justify-between gap-3 py-1.5 text-xs">
              <span className="shrink-0 text-amber-700/70 dark:text-amber-400/70">{d.label}</span>
              <span className="text-right font-medium text-amber-900 dark:text-amber-200">{d.value}</span>
            </div>
          ))}
        </div>
      )}

      <div className="flex justify-end gap-2 px-3.5 py-2.5">
        <button
          type="button"
          onClick={() => onCancel(id)}
          disabled={busy}
          className="rounded-lg border border-slate-300 dark:border-white/10 bg-white dark:bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/[0.08] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => onConfirm(id)}
          disabled={busy}
          className="flex items-center gap-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          {busy && <Loader2 size={12} className="animate-spin" />}
          Confirm
        </button>
      </div>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const el = document.createElement("textarea");
      el.value = text;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={handleCopy}
      title={copied ? "Copied!" : "Copy message"}
      className={`flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-md border transition-all duration-200 ${
        copied
          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
          : "bg-slate-100 dark:bg-white/[0.04] text-slate-400 dark:text-slate-500 border-slate-200 dark:border-white/[0.06] hover:text-slate-700 dark:hover:text-slate-300 hover:border-slate-300"
      }`}
    >
      {copied ? <Check size={10} /> : <Copy size={10} />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

/** Full-bleed landing state shown before the first message — a proper "start here"
 * screen rather than just a chat bubble, so new users get oriented before typing. */
function HeroEmptyState({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
      <div className="relative mb-5 h-16 w-16">
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-violet-600 to-fuchsia-600 blur-xl opacity-50" />
        <div className="wizard-avatar-glow relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 to-fuchsia-600 shadow-lg">
          <Wand2 size={28} className="-rotate-12 text-white" />
        </div>
        <Star size={16} className="wizard-twinkle absolute -right-1 -top-1 fill-amber-400 text-amber-400 drop-shadow" />
      </div>
      <h2 className="bg-gradient-to-br from-violet-600 to-fuchsia-600 dark:from-violet-400 dark:to-fuchsia-400 bg-clip-text text-xl font-bold text-transparent">
        Hi, I&apos;m Jarvis
      </h2>
      <p className="mt-2 max-w-md text-sm text-slate-500 dark:text-slate-400">
        Tell me what you need in plain English — I&apos;ll show you exactly what I&apos;m about to do and wait for your OK before anything changes.
      </p>

      <div className="stagger-children mt-7 grid w-full max-w-2xl grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {SUGGESTED_PROMPTS.map(({ icon: Icon, text }) => (
          <button
            key={text}
            onClick={() => onPick(text)}
            className="group flex items-center gap-3 rounded-xl border border-slate-200 dark:border-white/[0.07] bg-white/70 dark:bg-white/[0.03] px-3.5 py-3 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-indigo-300 dark:hover:border-indigo-400/30 hover:shadow-md"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-500 dark:text-indigo-400 transition-colors group-hover:bg-indigo-500 group-hover:text-white">
              <Icon size={14} />
            </span>
            <span className="text-xs font-medium text-slate-600 dark:text-slate-300 group-hover:text-slate-900 dark:group-hover:text-white">
              {text}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function MarkdownContent({ text }: { text: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => <p className="mb-1 last:mb-0">{children}</p>,
        strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
        ul: ({ children }) => <ul className="list-disc pl-4 mb-1 space-y-0.5">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal pl-4 mb-1 space-y-0.5">{children}</ol>,
        li: ({ children }) => <li>{children}</li>,
        h1: ({ children }) => <h1 className="text-base font-bold mb-1">{children}</h1>,
        h2: ({ children }) => <h2 className="text-sm font-bold mb-1">{children}</h2>,
        h3: ({ children }) => <h3 className="text-sm font-semibold mb-1">{children}</h3>,
        code: ({ children, className }) =>
          className ? (
            <pre className="bg-slate-100 dark:bg-slate-800 rounded-lg p-2 text-xs overflow-x-auto my-1">
              <code>{children}</code>
            </pre>
          ) : (
            <code className="bg-slate-100 dark:bg-slate-800 rounded px-1 py-0.5 text-xs">{children}</code>
          ),
        table: ({ children }) => (
          <div className="overflow-x-auto my-2">
            <table className="min-w-full text-xs border-collapse border border-slate-300 dark:border-slate-600 rounded-lg overflow-hidden">
              {children}
            </table>
          </div>
        ),
        thead: ({ children }) => <thead className="bg-slate-100 dark:bg-slate-700/60">{children}</thead>,
        tbody: ({ children }) => <tbody className="divide-y divide-slate-200 dark:divide-slate-700">{children}</tbody>,
        tr: ({ children }) => <tr>{children}</tr>,
        th: ({ children }) => (
          <th className="px-3 py-1.5 text-left font-semibold text-slate-700 dark:text-slate-200 border-r last:border-r-0 border-slate-300 dark:border-slate-600">
            {children}
          </th>
        ),
        td: ({ children }) => (
          <td className="px-3 py-1.5 text-slate-700 dark:text-slate-300 border-r last:border-r-0 border-slate-200 dark:border-slate-700">
            {children}
          </td>
        ),
      }}
    >
      {text}
    </ReactMarkdown>
  );
}

export default function JarvisPage() {
  const role = getUserRole();
  const [checkingAccess, setCheckingAccess] = useState(role !== "superadmin");
  const [allowed, setAllowed] = useState(role === "superadmin");
  const [accessUntil, setAccessUntil] = useState<string | null>(null);

  useEffect(() => {
    if (role === "superadmin") return;
    authService
      .getMe()
      .then((profile) => {
        const active = !!profile.jarvis_access_until && new Date(profile.jarvis_access_until).getTime() > Date.now();
        setAllowed(active);
        setAccessUntil(active ? profile.jarvis_access_until : null);
      })
      .catch(() => setAllowed(false))
      .finally(() => setCheckingAccess(false));
  }, [role]);

  const [messages, setMessages] = useState<ChatMessage[]>(() => loadStoredMessages() ?? [WELCOME]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    try {
      if (messages.length > 1 || messages[0] !== WELCOME) {
        sessionStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages));
      } else {
        sessionStorage.removeItem(CHAT_STORAGE_KEY);
      }
    } catch {
      // best-effort — private browsing / storage disabled just means no persistence
    }
  }, [messages]);

  // "bd" / "candidate" / "resume profile" pickers — each scoped to the sidebar's
  // currently-selected department, the same way every other page (leads, candidates,
  // interviews) scopes its lists, so switching departments here shows the same records
  // those pages would. Each list is fetched once per department, lazily, on first trigger;
  // all three are cleared and re-fetched if the department changes.
  const { departmentId } = useDepartmentContext();
  const [mention, setMention] = useState<{ kind: MentionKind; start: number; query: string } | null>(null);
  const [mentionHighlight, setMentionHighlight] = useState(0);
  const [bdAll, setBdAll] = useState<BusinessDeveloper[] | null>(null);
  const [bdLoading, setBdLoading] = useState(false);
  const [candidatesAll, setCandidatesAll] = useState<Candidate[] | null>(null);
  const [candidatesLoading, setCandidatesLoading] = useState(false);
  const [profilesAll, setProfilesAll] = useState<ResumeProfile[] | null>(null);
  const [profilesLoading, setProfilesLoading] = useState(false);

  useEffect(() => {
    setBdAll(null);
    setCandidatesAll(null);
    setProfilesAll(null);
  }, [departmentId]);

  const mentionSource: Record<MentionKind, { all: MentionOption[] | null; loading: boolean }> = {
    bd: { all: bdAll, loading: bdLoading },
    candidate: { all: candidatesAll, loading: candidatesLoading },
    profile: { all: profilesAll, loading: profilesLoading },
  };

  const mentionSuggestions = useMemo(() => {
    if (!mention) return [];
    const all = mentionSource[mention.kind].all;
    if (!all) return [];
    const q = mention.query.trim().toLowerCase();
    const active = all.filter((b) => b.is_active !== false);
    const filtered = q ? active.filter((b) => b.name.toLowerCase().includes(q)) : active;
    return filtered.slice(0, 6);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mention, bdAll, candidatesAll, profilesAll]);

  const syncMention = useCallback(
    (text: string, cursor: number) => {
      const before = text.slice(0, cursor);
      let best: { kind: MentionKind; start: number; query: string } | null = null;
      for (const t of MENTION_TRIGGERS) {
        const m = before.match(t.re);
        if (m && (best === null || (m.index ?? 0) > best.start)) {
          best = { kind: t.kind, start: m.index ?? 0, query: m[1] ?? "" };
        }
      }
      if (!best) {
        setMention(null);
        return;
      }
      setMention(best);
      setMentionHighlight(0);
      if (best.kind === "bd" && bdAll === null && !bdLoading) {
        setBdLoading(true);
        businessDevelopersService
          .list({ department_id: departmentId })
          .then(setBdAll)
          .catch(() => setBdAll([]))
          .finally(() => setBdLoading(false));
      } else if (best.kind === "candidate" && candidatesAll === null && !candidatesLoading) {
        setCandidatesLoading(true);
        candidatesService
          .list({ department_id: departmentId })
          .then(setCandidatesAll)
          .catch(() => setCandidatesAll([]))
          .finally(() => setCandidatesLoading(false));
      } else if (best.kind === "profile" && profilesAll === null && !profilesLoading) {
        setProfilesLoading(true);
        profilesService
          .list({ department_id: departmentId })
          .then(setProfilesAll)
          .catch(() => setProfilesAll([]))
          .finally(() => setProfilesLoading(false));
      }
    },
    [bdAll, bdLoading, candidatesAll, candidatesLoading, profilesAll, profilesLoading, departmentId],
  );

  const handleSelectMention = useCallback(
    (item: MentionOption) => {
      if (!mention) return;
      const label = MENTION_TRIGGERS.find((t) => t.kind === mention.kind)!.label;
      const el = inputRef.current;
      const cursor = el?.selectionStart ?? input.length;
      const before = input.slice(0, mention.start);
      const after = input.slice(cursor);
      const inserted = `${label}: ${item.name}`;
      const next = `${before}${inserted} ${after}`;
      setInput(next);
      setMention(null);
      const caretPos = before.length + inserted.length + 1;
      setTimeout(() => {
        el?.focus();
        el?.setSelectionRange(caretPos, caretPos);
      }, 0);
    },
    [mention, input],
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: ChatMessage = { role: "user", content: text, timestamp: Date.now() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const history = messages.filter((m) => m !== WELCOME).map(({ role, content }) => ({ role, content }));
      const res = await chatService.send(history, text, departmentId);
      const assistantMsg: ChatMessage = {
        role: "assistant",
        content: res.reply,
        actions: res.actions as ChatAction[],
        pendingAction: res.pending_action
          ? {
              id: res.pending_action.id,
              actionType: res.pending_action.action_type,
              summary: res.pending_action.summary,
              details: res.pending_action.details ?? [],
            }
          : undefined,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: err instanceof Error ? err.message : "Something went wrong. Please try again.",
          timestamp: Date.now(),
        },
      ]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [input, loading, messages, departmentId]);

  const handleConfirm = useCallback(async (actionId: string) => {
    setConfirmingId(actionId);
    try {
      const res = await chatService.confirmAction(actionId);
      setMessages((prev) => [
        ...prev.map((m) => (m.pendingAction?.id === actionId ? { ...m, pendingResolved: "confirmed" as const } : m)),
        { role: "assistant", content: res.reply, actions: res.actions as ChatAction[], timestamp: Date.now() },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: err instanceof Error ? err.message : "I couldn't complete that action. Please try again.",
          timestamp: Date.now(),
        },
      ]);
    } finally {
      setConfirmingId(null);
    }
  }, []);

  const handleCancel = useCallback(async (actionId: string) => {
    setMessages((prev) =>
      prev.map((m) => (m.pendingAction?.id === actionId ? { ...m, pendingResolved: "cancelled" as const } : m)),
    );
    chatService.cancelAction(actionId).catch(() => {
      // best-effort — an unreachable cancel just expires server-side after the TTL
    });
  }, []);

  const resetConversation = () => {
    setMessages([WELCOME]);
    setInput("");
    try {
      sessionStorage.removeItem(CHAT_STORAGE_KEY);
    } catch {
      // best-effort
    }
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mention) {
      if (e.key === "ArrowDown" && mentionSuggestions.length > 0) {
        e.preventDefault();
        setMentionHighlight((i) => (i + 1) % mentionSuggestions.length);
        return;
      }
      if (e.key === "ArrowUp" && mentionSuggestions.length > 0) {
        e.preventDefault();
        setMentionHighlight((i) => (i - 1 + mentionSuggestions.length) % mentionSuggestions.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        if (mentionSuggestions.length > 0) {
          e.preventDefault();
          handleSelectMention(mentionSuggestions[mentionHighlight]);
          return;
        }
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setMention(null);
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  if (checkingAccess) {
    return <PageLoader />;
  }

  if (!allowed) {
    return (
      <div className="space-y-6">
        <PageHeader title="Jarvis AI" subtitle="Your AI recruitment assistant" />
        <div className="mx-auto max-w-md overflow-hidden rounded-2xl border border-violet-200/60 dark:border-violet-400/20 bg-white/60 dark:bg-white/[0.04] backdrop-blur-3xl shadow-[0_2px_20px_rgba(0,0,0,0.06)] dark:shadow-[0_2px_20px_rgba(0,0,0,0.25)]">
          {/* Header */}
          <div className="relative overflow-hidden bg-gradient-to-br from-violet-600 to-fuchsia-600 px-6 py-8 text-center">
            <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
            <div className="relative mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-white/15 backdrop-blur-sm">
              <Wand2 size={22} className="-rotate-12 text-white" />
            </div>
            <h2 className="relative text-lg font-bold text-white">Jarvis AI</h2>
            <p className="relative mt-1 text-xs text-violet-100">Your AI recruitment assistant</p>
          </div>

          {/* Body */}
          <div className="px-6 py-6">
            <div className="mb-5 flex items-center justify-center gap-2 rounded-xl border border-amber-300/50 dark:border-amber-400/20 bg-amber-50 dark:bg-amber-500/10 px-4 py-3">
              <Crown size={16} className="shrink-0 text-amber-600 dark:text-amber-400" />
              <p className="text-sm text-amber-800 dark:text-amber-300">
                AI features require a <span className="font-semibold">Jarvis AI subscription</span>
              </p>
            </div>

            <div className="mb-5 flex items-baseline justify-center gap-1">
              <span className="text-3xl font-extrabold text-slate-900 dark:text-white">Rs. 1,000</span>
              <span className="text-sm text-slate-500 dark:text-slate-400">/ month</span>
            </div>

            <ul className="mb-6 space-y-2.5">
              {PREMIUM_FEATURES.map((feature) => (
                <li key={feature} className="flex items-start gap-2.5 text-sm text-slate-600 dark:text-slate-300">
                  <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-500" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>

            <div className="flex items-center justify-center gap-1.5 rounded-lg bg-slate-100 dark:bg-white/[0.04] px-3 py-2.5 text-xs text-slate-500 dark:text-slate-400">
              <MessageCircleQuestion size={13} className="shrink-0" />
              Ask your workspace admin to upgrade your account
            </div>

            <p className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-slate-400 dark:text-slate-500">
              <ShieldCheck size={12} />
              Every AI action still requires your explicit confirmation
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-9rem)] min-h-[520px] w-full flex-col overflow-hidden rounded-[20px] border border-white/60 dark:border-white/[0.08] bg-white/40 dark:bg-white/[0.05] backdrop-blur-3xl shadow-[0_2px_20px_rgba(0,0,0,0.06)] dark:shadow-[0_2px_20px_rgba(0,0,0,0.25)]">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-3 border-b border-slate-200/70 dark:border-white/[0.07] px-5 py-4">
        <div className="relative h-10 w-10 shrink-0">
          <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-violet-600 to-fuchsia-600 blur-md opacity-40" />
          <div className="wizard-avatar-glow relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-fuchsia-600 shadow-md">
            <Wand2 size={18} className="-rotate-12 text-white" />
          </div>
          <Star size={11} className="wizard-twinkle absolute -right-0.5 -top-0.5 fill-amber-400 text-amber-400 drop-shadow" />
        </div>
        <div className="min-w-0">
          <h1 className="text-base font-bold leading-none text-slate-900 dark:text-white">Jarvis AI</h1>
          <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">
            Nothing writes to your data without your confirmation
          </p>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {accessUntil && (
            <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-600 dark:text-amber-400">
              <Sparkles size={11} />
              Access until {new Date(accessUntil).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </span>
          )}
          <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
            </span>
            Online
          </span>
          <button
            onClick={resetConversation}
            disabled={messages.length === 1}
            title="New conversation"
            aria-label="New conversation"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-white/[0.06] hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <RotateCcw size={15} />
          </button>
        </div>
      </div>

      {/* Message list */}
      <div className="flex flex-1 flex-col overflow-y-auto px-4 py-4">
        {messages.length === 1 && !loading ? (
          <HeroEmptyState
            onPick={(text) => {
              setInput(text);
              inputRef.current?.focus();
            }}
          />
        ) : (
          <div className="space-y-4">
            {messages
              .filter((m) => m !== WELCOME)
              .map((msg, i) => (
                <div
                  key={i}
                  className={`animate-float-up group flex gap-2.5 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  {msg.role === "assistant" && (
                    <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-violet-600 to-fuchsia-600 flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                      <Sparkles size={13} className="text-white" />
                    </div>
                  )}

                  <div className={`max-w-[85%] lg:max-w-2xl space-y-1.5 ${msg.role === "user" ? "items-end" : "items-start"} flex flex-col`}>
                    <div
                      className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                        msg.role === "user"
                          ? "bg-indigo-600 text-white rounded-tr-sm"
                          : "bg-white/70 dark:bg-white/[0.06] border border-slate-200/70 dark:border-white/[0.06] text-slate-800 dark:text-slate-100 rounded-tl-sm shadow-sm"
                      }`}
                    >
                      <MarkdownContent text={msg.content} />
                    </div>

                    {msg.timestamp && (
                      <span className="px-1 text-[10px] text-slate-400 dark:text-slate-500">{formatClock(msg.timestamp)}</span>
                    )}

                    {msg.pendingAction && (
                      <PendingActionCard
                        message={msg}
                        busy={confirmingId === msg.pendingAction.id}
                        onConfirm={handleConfirm}
                        onCancel={handleCancel}
                      />
                    )}

                    {msg.role === "assistant" && !msg.pendingAction && msg.actions && msg.actions.length > 0 && (
                      <div className="flex flex-wrap items-center gap-2">
                        {msg.actions.map((a, j) => (
                          <ActionCard key={j} action={a} />
                        ))}
                        <span className="opacity-0 transition-opacity group-hover:opacity-100">
                          <CopyButton text={msg.content} />
                        </span>
                      </div>
                    )}
                    {msg.role === "assistant" && !msg.pendingAction && (!msg.actions || msg.actions.length === 0) && (
                      <span className="opacity-0 transition-opacity group-hover:opacity-100">
                        <CopyButton text={msg.content} />
                      </span>
                    )}
                  </div>

                  {msg.role === "user" && (
                    <div className="h-7 w-7 rounded-lg bg-slate-200 dark:bg-slate-700 flex items-center justify-center shrink-0 mt-0.5">
                      <User size={13} className="text-slate-600 dark:text-slate-300" />
                    </div>
                  )}
                </div>
              ))}

            {loading && (
              <div className="animate-float-up flex gap-2.5 justify-start">
                <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-violet-600 to-fuchsia-600 flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                  <Sparkles size={13} className="text-white" />
                </div>
                <div className="flex items-center gap-1.5 bg-white/70 dark:bg-white/[0.06] border border-slate-200/70 dark:border-white/[0.06] rounded-2xl rounded-tl-sm px-4 py-3.5 shadow-sm">
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                </div>
              </div>
            )}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="relative shrink-0 border-t border-slate-200/70 dark:border-white/[0.07] px-4 py-3">
        {mention && (() => {
          const copy = MENTION_COPY[mention.kind];
          const loading = mentionSource[mention.kind].loading;
          const MentionIcon = copy.icon;
          return (
            <div className="absolute bottom-full left-4 right-4 mb-2 max-h-56 overflow-y-auto rounded-xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#181b26] shadow-lg animate-float-up">
              <div className="flex items-center gap-1.5 border-b border-slate-100 dark:border-white/[0.06] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                <MentionIcon size={11} />
                {copy.heading}
              </div>
              {loading ? (
                <div className="flex items-center gap-2 px-3 py-3 text-xs text-slate-400">
                  <Loader2 size={12} className="animate-spin" />
                  Loading…
                </div>
              ) : mentionSuggestions.length > 0 ? (
                mentionSuggestions.map((item, idx) => (
                  <button
                    key={item.id}
                    type="button"
                    onMouseEnter={() => setMentionHighlight(idx)}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleSelectMention(item);
                    }}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
                      idx === mentionHighlight
                        ? "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300"
                        : "text-slate-700 dark:text-slate-300"
                    }`}
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-500/10 text-[10px] font-bold text-indigo-500 dark:text-indigo-400">
                      {item.name.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="truncate">{item.name}</span>
                  </button>
                ))
              ) : (
                <div className="px-3 py-3 text-xs text-slate-400">{copy.empty}</div>
              )}
            </div>
          );
        })()}
        <div className="input-focus-glow flex gap-3 items-end rounded-2xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.03] p-3 shadow-sm focus-within:border-indigo-500/50 transition-colors">
          <textarea
            ref={inputRef}
            rows={1}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              syncMention(e.target.value, e.target.selectionStart ?? e.target.value.length);
            }}
            onKeyDown={onKeyDown}
            placeholder="Ask me to add a lead, company, or schedule an interview…"
            className="flex-1 resize-none bg-transparent text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none leading-relaxed max-h-32"
            style={{ height: "auto" }}
            onInput={(e) => {
              const el = e.currentTarget;
              el.style.height = "auto";
              el.style.height = `${el.scrollHeight}px`;
            }}
            disabled={loading}
          />
          <button
            onClick={send}
            disabled={!input.trim() || loading}
            className="h-9 w-9 rounded-xl bg-indigo-600 hover:bg-indigo-700 hover:scale-105 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100 flex items-center justify-center transition-all shadow-sm shrink-0"
          >
            {loading ? <Loader2 size={15} className="animate-spin text-white" /> : <Send size={15} className="text-white" />}
          </button>
        </div>
        <p className="text-center text-[10px] text-slate-400 mt-2">Press Enter to send · Shift+Enter for new line · Jarvis can make mistakes, review before confirming</p>
      </div>
    </div>
  );
}
