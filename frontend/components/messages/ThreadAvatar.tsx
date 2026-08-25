import { Hash, Users } from "lucide-react";
import type { MessageThreadKind } from "@/lib/types";
import { colorFor, initialsFor } from "./avatarColor";

export default function ThreadAvatar({
  title,
  kind,
  size = 36,
}: {
  title: string;
  kind: MessageThreadKind;
  size?: number;
}) {
  if (kind === "channel") {
    return (
      <span
        className="inline-flex shrink-0 items-center justify-center rounded-full bg-slate-200 text-slate-600 dark:bg-white/[0.08] dark:text-slate-300"
        style={{ width: size, height: size }}
      >
        <Hash size={Math.round(size * 0.5)} />
      </span>
    );
  }
  if (kind === "group") {
    return (
      <span
        className="inline-flex shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300"
        style={{ width: size, height: size }}
      >
        <Users size={Math.round(size * 0.5)} />
      </span>
    );
  }
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white"
      style={{
        width: size,
        height: size,
        background: colorFor(title),
        fontSize: Math.max(9, Math.round(size * 0.36)),
      }}
    >
      {initialsFor(title)}
    </span>
  );
}
