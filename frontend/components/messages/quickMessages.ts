export const QUICK_ACTIONS = [
  { key: "confirm_availability", label: "Confirm Availability" },
  { key: "schedule_interview", label: "Schedule Interview" },
] as const;

export type QuickActionKey = (typeof QUICK_ACTIONS)[number]["key"];

/** Blank "Confirm Availability" / "Interview Scheduled" template — the user fills in every
 * field by hand after it's inserted. */
export function buildQuickMessage(kind: QuickActionKey): string {
  const heading = kind === "confirm_availability" ? "Confirm your availability!" : "Interview Scheduled!!";
  return [
    heading,
    `Agency/End Client: `,
    `Role/Title: `,
    `Stack: `,
    `Round: `,
    `Profile Name: `,
    `Date and Time: `,
  ].join("\n");
}
