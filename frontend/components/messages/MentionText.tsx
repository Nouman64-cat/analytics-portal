import type { MessageContact } from "@/lib/types";

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Renders a message body with any @-tagged names highlighted in a distinct color,
 * WhatsApp-style. `mentions` is the authoritative list of who was actually tagged (from the
 * message data), not a guess parsed from the text. */
export default function MentionText({
  body,
  mentions,
  mine,
}: {
  body: string;
  mentions: MessageContact[];
  mine: boolean;
}) {
  if (mentions.length === 0) return <>{body}</>;

  const names = [...new Set(mentions.map((m) => m.full_name))].sort((a, b) => b.length - a.length);
  const pattern = new RegExp(`@(?:${names.map(escapeRegExp).join("|")})`, "g");

  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = pattern.exec(body)) !== null) {
    if (match.index > lastIndex) nodes.push(body.slice(lastIndex, match.index));
    nodes.push(
      <span
        key={key++}
        className={
          mine
            ? "font-semibold text-amber-200"
            : "font-semibold text-indigo-600 dark:text-indigo-400"
        }
      >
        {match[0]}
      </span>,
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < body.length) nodes.push(body.slice(lastIndex));
  return <>{nodes}</>;
}
