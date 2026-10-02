import type { JdHighlight, JdHighlightType } from "@/lib/types";

/** Color + label per highlight type — the order here is the legend order. */
export const JD_HIGHLIGHT_STYLES: Record<JdHighlightType, { label: string; className: string }> = {
  skill: {
    label: "Skills & tools",
    className: "bg-indigo-100 text-indigo-800 dark:bg-indigo-400/20 dark:text-indigo-200",
  },
  concept: {
    label: "Concepts",
    className: "bg-sky-100 text-sky-800 dark:bg-sky-400/20 dark:text-sky-200",
  },
  requirement: {
    label: "Requirements",
    className: "bg-amber-100 text-amber-900 dark:bg-amber-400/20 dark:text-amber-200",
  },
  compensation: {
    label: "Compensation",
    className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-400/20 dark:text-emerald-200",
  },
  employment: {
    label: "Type & location",
    className: "bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-400/20 dark:text-fuchsia-200",
  },
};

const normalize = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** `text` with every highlight phrase (case-insensitive, any whitespace between words) marked
 * in its type's color. Phrases no longer in the text (e.g. after an edit) are simply skipped. */
export function JobDescriptionText({
  text,
  highlights,
}: {
  text: string;
  highlights: JdHighlight[];
}) {
  const typeByPhrase = new Map<string, JdHighlightType>();
  for (const h of highlights) {
    const key = normalize(h.text);
    if (key && JD_HIGHLIGHT_STYLES[h.type] && !typeByPhrase.has(key)) typeByPhrase.set(key, h.type);
  }
  if (!typeByPhrase.size) return <>{text}</>;

  // Longest first so "REST API" wins over "REST"; word-ish boundaries so "Go" doesn't match "Google".
  const pattern = [...typeByPhrase.keys()]
    .sort((a, b) => b.length - a.length)
    .map((p) => `(?<![\\w])${escapeRegExp(p).replace(/ /g, "\\s+")}(?![\\w])`)
    .join("|");
  const parts = text.split(new RegExp(`(${pattern})`, "gi"));

  return (
    <>
      {parts.map((part, i) => {
        if (i % 2 === 0) return part;
        const type = typeByPhrase.get(normalize(part));
        return (
          <mark
            key={i}
            className={`rounded px-0.5 ${type ? JD_HIGHLIGHT_STYLES[type].className : ""}`}
          >
            {part}
          </mark>
        );
      })}
    </>
  );
}

/** Legend for the highlight types actually present. */
export function JobDescriptionLegend({ highlights }: { highlights: JdHighlight[] }) {
  const present = new Set(highlights.map((h) => h.type));
  const types = (Object.keys(JD_HIGHLIGHT_STYLES) as JdHighlightType[]).filter((t) => present.has(t));
  if (!types.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {types.map((t) => (
        <span
          key={t}
          className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${JD_HIGHLIGHT_STYLES[t].className}`}
        >
          {JD_HIGHLIGHT_STYLES[t].label}
        </span>
      ))}
    </div>
  );
}

/** Highlights for an interview: the typed ones when present, else the older plain keyword list
 * (documents processed before typed highlights existed) shown as skills. */
export function interviewJdHighlights(interview: {
  jd_highlights?: JdHighlight[] | null;
  interview_doc_keywords?: string | null;
}): JdHighlight[] {
  if (interview.jd_highlights?.length) return interview.jd_highlights;
  return (interview.interview_doc_keywords || "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean)
    .map((text) => ({ text, type: "skill" as const }));
}
