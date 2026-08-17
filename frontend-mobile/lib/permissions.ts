/** Mirrors the role-based CRUD rules in frontend/app/leads/page.tsx, business-developers/page.tsx,
 * departments/page.tsx and backup/page.tsx — kept as pure functions so every mobile screen checks
 * the same rules instead of only hiding the nav item. */

type Role = string | null | undefined;

const LEAD_MUTATE_ROLES = new Set([
  "superadmin",
  "team-member",
  "bd",
  "dept-lead",
  "bd-team-lead",
  "tech-stack-manager",
]);

const BD_READ_ONLY_ROLES = new Set(["bd", "manager", "bd-manager", "guest"]);

const DEPARTMENT_VIEW_ROLES = new Set(["superadmin", "bd-manager", "guest", "tech-stack-manager"]);

export function isSuperadmin(role: Role): boolean {
  return role === "superadmin";
}

/** Create / edit / delete leads, and change lead status/conversion. Everyone else (manager, bd-manager, guest) is read-only. */
export function canMutateLeads(role: Role): boolean {
  return LEAD_MUTATE_ROLES.has(role ?? "");
}

/** Only superadmin may force an outcome override on a lead thread. */
export function canOverrideConversion(role: Role): boolean {
  return isSuperadmin(role);
}

/** Create / edit / delete business developers. */
export function canMutateBusinessDevs(role: Role): boolean {
  return !BD_READ_ONLY_ROLES.has(role ?? "");
}

/** View the departments list (read-only for bd-manager / guest / tech-stack-manager). */
export function canViewDepartments(role: Role): boolean {
  return DEPARTMENT_VIEW_ROLES.has(role ?? "");
}

/** Create / edit / deactivate departments. */
export function canManageDepartments(role: Role): boolean {
  return isSuperadmin(role) || role === "tech-stack-manager";
}
