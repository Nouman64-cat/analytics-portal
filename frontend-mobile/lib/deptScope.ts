/**
 * Whether an entity with a multi-department `department_ids` field (e.g. BusinessDeveloper)
 * is in scope for the currently active department. null/empty department_ids means the
 * entity is unrestricted (visible for every department) — same convention used for
 * User.allowed_dept_ids elsewhere in this app.
 */
export function isInDepartmentScope(departmentIds: string[] | null | undefined, activeDepartmentId: string | null): boolean {
  if (!activeDepartmentId) return true;
  if (!departmentIds || departmentIds.length === 0) return true;
  return departmentIds.includes(activeDepartmentId);
}
