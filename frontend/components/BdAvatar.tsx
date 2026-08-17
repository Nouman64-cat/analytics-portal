import { getBdColor } from "@/lib/candidateColor";

interface BdLike {
  id: string;
  name: string;
}

interface Props {
  bd: BdLike;
  size?: number;
  className?: string;
}

/** First + last word initials — correct even for three-plus-word names (skips middles). */
function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (!parts[0]) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** A business developer's avatar circle: colored initials, with the full name as a hover tooltip. */
export default function BdAvatar({ bd, size = 24, className = "" }: Props) {
  return (
    <span
      title={bd.name}
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white ${className}`}
      style={{
        width: size,
        height: size,
        background: getBdColor(bd),
        fontSize: Math.max(8, Math.round(size * 0.4)),
      }}
    >
      {getInitials(bd.name)}
    </span>
  );
}
