"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Bot, User, Building2, Briefcase, CalendarCheck, Loader2, Sparkles } from "lucide-react";
import { chatService } from "@/lib/services";
import type { ChatMessage, ChatAction } from "@/lib/types";

const WELCOME: ChatMessage = {
  role: "assistant",
  content: "Hi! I'm your AI recruitment assistant. I can help you:\n\n• **Add a new company** to the database\n• **Create a lead** (open a pipeline opportunity)\n• **Schedule an interview** round\n\nJust tell me what you'd like to do in plain English, and I'll take care of it.",
};

function ActionCard({ action }: { action: ChatAction }) {
  const iconMap: Record<string, React.ReactNode> = {
    company_created: <Building2 size={13} />,
    lead_created: <Briefcase size={13} />,
    interview_scheduled: <CalendarCheck size={13} />,
  };
  const colorMap: Record<string, string> = {
    company_created: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20",
    lead_created: "bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/20",
    interview_scheduled: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20",
  };

  return (
    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold ${colorMap[action.type] ?? "bg-slate-500/10 text-slate-600 border-slate-500/20"}`}>
      {iconMap[action.type]}
      {action.description}
    </div>
  );
}

function renderContent(text: string) {
  // Minimal markdown: **bold**, bullet lines
  return text.split("\n").map((line, i) => {
    const parts = line.split(/\*\*(.*?)\*\*/g);
    const rendered = parts.map((p, j) =>
      j % 2 === 1 ? <strong key={j}>{p}</strong> : p
    );
    const isBullet = line.trimStart().startsWith("•") || line.trimStart().startsWith("-");
    return (
      <p key={i} className={`${isBullet ? "pl-2" : ""} ${i > 0 ? "mt-1" : ""}`}>
        {rendered}
      </p>
    );
  });
}

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: ChatMessage = { role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      // Build history for the API (exclude welcome message, only user/assistant pairs)
      const history = messages
        .filter((m) => m !== WELCOME)
        .map(({ role, content }) => ({ role, content }));

      const res = await chatService.send(history, text);

      const assistantMsg: ChatMessage = {
        role: "assistant",
        content: res.reply,
        actions: res.actions as ChatAction[],
      };
      setMessages((prev) => [...prev, assistantMsg]);
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

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4 shrink-0">
        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-md">
          <Bot size={20} className="text-white" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-slate-900 dark:text-white leading-none">AI Assistant</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Add companies, leads & interviews in plain English</p>
        </div>
        <div className="ml-auto flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
          GPT-4o mini
        </div>
      </div>

      {/* Message list */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-1 pb-2">
        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            {msg.role === "assistant" && (
              <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                <Sparkles size={13} className="text-white" />
              </div>
            )}

            <div className={`max-w-[85%] space-y-2 ${msg.role === "user" ? "items-end" : "items-start"} flex flex-col`}>
              <div
                className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "bg-indigo-600 text-white rounded-tr-sm"
                    : "bg-white dark:bg-[#12141c] border border-slate-200 dark:border-white/[0.06] text-slate-800 dark:text-slate-100 rounded-tl-sm shadow-sm"
                }`}
              >
                {renderContent(msg.content)}
              </div>

              {msg.actions && msg.actions.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {msg.actions.map((a, j) => (
                    <ActionCard key={j} action={a} />
                  ))}
                </div>
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
          <div className="flex gap-3 justify-start">
            <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
              <Sparkles size={13} className="text-white" />
            </div>
            <div className="bg-white dark:bg-[#12141c] border border-slate-200 dark:border-white/[0.06] rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
              <Loader2 size={15} className="animate-spin text-indigo-500" />
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Suggested prompts — shown only when only the welcome message exists */}
      {messages.length === 1 && (
        <div className="flex flex-wrap gap-2 mb-3 shrink-0">
          {[
            "Add a lead for Google — Senior Engineer role",
            "Schedule a phone screen with Microsoft tomorrow at 2pm",
            "Add a new company called Stripe",
          ].map((prompt) => (
            <button
              key={prompt}
              onClick={() => { setInput(prompt); inputRef.current?.focus(); }}
              className="text-xs px-3 py-2 rounded-xl border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-[#12141c] text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/[0.04] hover:text-slate-900 dark:hover:text-white transition-colors shadow-sm"
            >
              {prompt}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="shrink-0 flex gap-3 items-end bg-white dark:bg-[#12141c] border border-slate-200 dark:border-white/[0.06] rounded-2xl p-3 shadow-sm">
        <textarea
          ref={inputRef}
          rows={1}
          value={input}
          onChange={(e) => setInput(e.target.value)}
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
          className="h-9 w-9 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors shadow-sm shrink-0"
        >
          {loading ? <Loader2 size={15} className="animate-spin text-white" /> : <Send size={15} className="text-white" />}
        </button>
      </div>
      <p className="text-center text-[10px] text-slate-400 mt-2 shrink-0">Press Enter to send · Shift+Enter for new line</p>
    </div>
  );
}
