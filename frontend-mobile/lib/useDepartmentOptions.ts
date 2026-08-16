import { useEffect, useMemo, useState } from "react";
import { departmentsService, authService } from "./api";
import { useAuth } from "./AuthContext";
import { useDepartmentContext } from "./DepartmentContext";
import type { Department, User } from "./types";

const CROSS_DEPT_ROLES = new Set(["superadmin", "manager", "guest"]);
const MULTI_DEPT_CAPABLE_ROLES = new Set([
  "superadmin",
  "manager",
  "guest",
  "bd",
  "bd-team-lead",
  "bd-manager",
  "team-member",
  "dept-lead",
  "tech-stack-manager",
]);

/** Mirrors frontend/components/Sidebar.tsx's department-visibility rules for the active user's role. */
export function useDepartmentOptions() {
  const { payload } = useAuth();
  const role = payload?.role ?? null;
  const { departmentId, setDepartmentId, ready } = useDepartmentContext();
  const [allDepartments, setAllDepartments] = useState<Department[]>([]);
  const [userProfile, setUserProfile] = useState<User | null>(null);

  useEffect(() => {
    if (!role || !MULTI_DEPT_CAPABLE_ROLES.has(role)) return;
    departmentsService
      .list()
      .then((d) => setAllDepartments(d.filter((x) => x.is_active)))
      .catch(() => {});
    authService.getMe().then(setUserProfile).catch(() => {});
  }, [role]);

  const departments = useMemo((): Department[] => {
    if (!role || !MULTI_DEPT_CAPABLE_ROLES.has(role)) return [];
    if (CROSS_DEPT_ROLES.has(role)) return allDepartments;
    if (role === "bd" && userProfile?.linked_to_superadmin) return allDepartments;

    const allowed = userProfile?.allowed_dept_ids;

    if (role === "bd-manager") {
      if (allowed === null || allowed === undefined) return allDepartments;
      if (allowed.length === 0) return allDepartments;
      return allDepartments.filter((d) => allowed.includes(d.id));
    }

    if (role === "team-member" || role === "dept-lead" || role === "tech-stack-manager") {
      if (!allowed || allowed.length === 0) return [];
      return allDepartments.filter((d) => allowed.includes(d.id));
    }

    // bd / bd-team-lead
    if (allowed === undefined) return [];
    if (allowed === null) return role === "bd" ? allDepartments : [];
    if (allowed.length === 0) return allDepartments;
    return allDepartments.filter((d) => allowed.includes(d.id));
  }, [role, allDepartments, userProfile]);

  // Auto-select the first valid department once the persisted value is loaded.
  useEffect(() => {
    if (!ready || departments.length === 0) return;
    if (!departments.some((d) => d.id === departmentId)) setDepartmentId(departments[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, departments]);

  return { departments, showSwitcher: departments.length > 1, departmentId, setDepartmentId };
}
