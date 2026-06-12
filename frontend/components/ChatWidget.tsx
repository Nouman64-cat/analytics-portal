"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Bot, User, Building2, Briefcase, CalendarCheck, Loader2, Sparkles, X, RefreshCw, BarChart2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { chatService } from "@/lib/services";
import type { ChatMessage, ChatAction } from "@/lib/types";
import { getUserRole } from "@/lib/auth";

const ALLOWED_ROLES = ["superadmin", "team-member", "bd-team-lead"];

const WELCOME: ChatMessage = {
  role: "assistant",
  content:
    "Hi! I'm your AI recruitment assistant. I can help you:\n\n• **Add a new company** to the database\n• **Create a lead** (open a pipeline opportunity)\n• **Schedule an interview** round\n• **Update interview or lead status**\n\nJust tell me what you'd like to do in plain English, and I'll take care of it.",
};

const WELCOME_ADMIN: ChatMessage = {
  role: "assistant",
  content:
    "Hi! I'm your AI recruitment analyst. As a Super Admin you have full access to:\n\n• **Pipeline insights** — funnel conversion rates, stage-by-stage breakdown\n• **Candidate analysis** — who's converting, where leads stall, what feedback says\n• **Round status** — how many leads are at each interview stage right now\n• **BD performance** — close rates and pipeline health per business developer\n• **Notes analysis** — patterns in feedback and recruiter notes\n\nAsk me anything about the pipeline and I'll give you data-backed insights with recommendations.",
};

const ADMIN_SUGGESTED_PROMPTS = [
  "How many leads are currently in the second or third round?",
  "Which candidate has the lowest conversion rate and why?",
  "Show me the full pipeline funnel with conversion rates",
  "Which BDs are closing leads vs losing them?",
  "Analyse the feedback notes for rejection patterns",
  "What's our overall close rate this month?",
];

const DEFAULT_SUGGESTED_PROMPTS = [
  "Add a lead for Google — Senior Engineer role",
  "Schedule a phone screen with Microsoft tomorrow",
  "Add a new company called Stripe",
  "Update interview status to Rejected for Microsoft",
];

function ActionCard({ action }: { action: ChatAction }) {
  const iconMap: Record<string, React.ReactNode> = {
    company_created: <Building2 size={13} />,
    lead_created: <Briefcase size={13} />,
    interview_scheduled: <CalendarCheck size={13} />,
    interview_status_updated: <RefreshCw size={13} />,
    interview_updated: <RefreshCw size={13} />,
    lead_outcome_updated: <RefreshCw size={13} />,
    lead_updated: <RefreshCw size={13} />,
  };
  const colorMap: Record<string, string> = {
    company_created: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20",
    lead_created: "bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/20",
    interview_scheduled: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20",
    interview_status_updated: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20",
    interview_updated: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20",
    lead_outcome_updated: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20",
    lead_updated: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20",
  };
  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold ${
        colorMap[action.type] ?? "bg-slate-500/10 text-slate-600 border-slate-500/20"
      }`}
    >
      {iconMap[action.type]}
      {action.description}
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
        thead: ({ children }) => (
          <thead className="bg-slate-100 dark:bg-slate-700/60">{children}</thead>
        ),
        tbody: ({ children }) => (
          <tbody className="divide-y divide-slate-200 dark:divide-slate-700">{children}</tbody>
        ),
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

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const role = getUserRole();
  const isAdmin = role === "superadmin";
  const [messages, setMessages] = useState<ChatMessage[]>([isAdmin ? WELCOME_ADMIN : WELCOME]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open, messages, loading]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: ChatMessage = { role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const history = messages
        .filter((m) => m !== WELCOME)
        .map(({ role, content }) => ({ role, content }));
      const res = await chatService.send(history, text);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: res.reply, actions: res.actions as ChatAction[] },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: err instanceof Error ? err.message : "Something went wrong. Please try again.",
        },
      ]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [input, loading, messages]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  if (!isAdmin) return null;

  return (
    <>
      {/* Modal */}
      {open && (
        <div className={[
          "fixed z-50 flex flex-col",
          "bg-slate-50 dark:bg-[#0e0f18] overflow-hidden",
          // Mobile: full-screen overlay
          "inset-0 rounded-none border-0",
          // Desktop: anchored bottom-right, large but contained
          "md:inset-auto md:bottom-24 md:right-6 md:rounded-2xl md:border md:border-slate-200 md:dark:border-white/[0.07]",
          "md:w-[540px] md:max-h-[calc(100vh-10rem)] md:h-[600px]",
        ].join(" ")}
          style={{ boxShadow: '0 30px 80px -12px rgba(0,0,0,0.55), 0 0 0 1px rgba(0,0,0,0.08)' }}>
          {/* Header */}
          <div className="flex items-center gap-2.5 px-4 py-4 md:py-3 bg-white dark:bg-[#12141c] border-b border-slate-200 dark:border-white/[0.06] shrink-0">
            <div className="h-9 w-9 md:h-8 md:w-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-sm">
              <Bot size={18} className="text-white md:hidden" />
              <Bot size={16} className="text-white hidden md:block" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-base md:text-sm font-semibold text-slate-900 dark:text-white leading-none">
                  {isAdmin ? "AI Analyst" : "AI Assistant"}
                </p>
                {isAdmin && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-[10px] font-semibold border border-indigo-500/20">
                    <BarChart2 size={9} />
                    Analytics
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-xs md:text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">GPT-4o mini</span>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="h-9 w-9 md:h-7 md:w-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors"
            >
              <X size={18} className="md:hidden" />
              <X size={15} className="hidden md:block" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
            {messages.map((msg, i) => (
              <div key={i} className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                {msg.role === "assistant" && (
                  <div className="h-6 w-6 rounded-md bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                    <Sparkles size={11} className="text-white" />
                  </div>
                )}
                <div className={`max-w-[85%] space-y-1.5 flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}>
                  <div
                    className={`rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                      msg.role === "user"
                        ? "bg-indigo-600 text-white rounded-tr-sm"
                        : "bg-white dark:bg-[#12141c] border border-slate-200 dark:border-white/[0.06] text-slate-800 dark:text-slate-100 rounded-tl-sm shadow-sm"
                    }`}
                  >
                    <MarkdownContent text={msg.content} />
                  </div>
                  {msg.actions && msg.actions.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {msg.actions.map((a, j) => (
                        <ActionCard key={j} action={a} />
                      ))}
                    </div>
                  )}
                </div>
                {msg.role === "user" && (
                  <div className="h-6 w-6 rounded-md bg-slate-200 dark:bg-slate-700 flex items-center justify-center shrink-0 mt-0.5">
                    <User size={11} className="text-slate-600 dark:text-slate-300" />
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className="flex gap-2 justify-start">
                <div className="h-6 w-6 rounded-md bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                  <Sparkles size={11} className="text-white" />
                </div>
                <div className="bg-white dark:bg-[#12141c] border border-slate-200 dark:border-white/[0.06] rounded-2xl rounded-tl-sm px-3 py-2 shadow-sm">
                  <Loader2 size={13} className="animate-spin text-indigo-500" />
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Suggested prompts */}
          {messages.length === 1 && (
            <div className="px-3 pb-2 flex flex-col gap-1.5 shrink-0">
              {(isAdmin ? ADMIN_SUGGESTED_PROMPTS : DEFAULT_SUGGESTED_PROMPTS).map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => { setInput(prompt); inputRef.current?.focus(); }}
                  className="text-left text-xs md:text-[11px] px-3 py-2.5 md:py-2 rounded-xl border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-[#12141c] text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/[0.04] hover:text-slate-900 dark:hover:text-white transition-colors shadow-sm"
                >
                  {prompt}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div className="shrink-0 px-3 pb-4 md:pb-3">
            <div className="flex gap-2 items-end bg-white dark:bg-[#12141c] border border-slate-200 dark:border-white/[0.06] rounded-xl p-3 md:p-2.5 shadow-sm">
              <textarea
                ref={inputRef}
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder={isAdmin ? "Ask for pipeline insights or manage records…" : "Ask me anything…"}
                className="flex-1 resize-none bg-transparent text-base md:text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none leading-relaxed max-h-32 md:max-h-24"
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
                className="h-10 w-10 md:h-8 md:w-8 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors shadow-sm shrink-0"
              >
                {loading ? (
                  <Loader2 size={15} className="animate-spin text-white md:hidden" />
                ) : (
                  <Send size={15} className="text-white md:hidden" />
                )}
                {loading ? (
                  <Loader2 size={13} className="animate-spin text-white hidden md:block" />
                ) : (
                  <Send size={13} className="text-white hidden md:block" />
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating trigger button */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg hover:scale-105 active:scale-95 transition-transform"
        aria-label="Toggle AI assistant"
      >
        {open ? <X size={22} className="text-white" /> : <Bot size={22} className="text-white" />}
      </button>
    </>
  );
}
