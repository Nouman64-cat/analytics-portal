"use client";

import { getCandidateColor } from "@/lib/candidateColor";
import { useCachedAvatarUrl } from "@/lib/avatarCache";

interface CandidateLike {
  id: string;
  name: string;
  color?: string | null;
  avatar_url?: string | null;
}

interface Props {
  candidate: CandidateLike;
  /** Pixel diameter of the circle. Below 16px, initials are omitted (too small to read). */
  size?: number;
  className?: string;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (!parts[0]) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** A candidate's avatar circle: their uploaded photo if set, else colored initials/dot. */
export default function CandidateAvatar({ candidate, size = 32, className = "" }: Props) {
  const imgSrc = useCachedAvatarUrl(candidate.avatar_url);

  if (imgSrc) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- cached blob object URL, not a static/local asset
      <img
        src={imgSrc}
        alt={candidate.name}
        className={`shrink-0 rounded-full object-cover ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }

  const showInitials = size >= 16;
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white ${className}`}
      style={{
        width: size,
        height: size,
        background: getCandidateColor(candidate),
        fontSize: Math.max(8, Math.round(size * 0.4)),
      }}
    >
      {showInitials ? getInitials(candidate.name) : null}
    </span>
  );
}
