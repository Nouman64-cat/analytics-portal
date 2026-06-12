"use client";

import { createContext, useContext, useState, useCallback, useMemo, ReactNode } from "react";

const STORAGE_KEY = "active_dept_id";

interface DepartmentContextValue {
  departmentId: string | null;   // null = "All Departments"
  setDepartmentId: (id: string | null) => void;
}

const DepartmentContext = createContext<DepartmentContextValue>({
  departmentId: null,
  setDepartmentId: () => {},
});

export function DepartmentProvider({ children }: { children: ReactNode }) {
  const [departmentId, setDepartmentIdState] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(STORAGE_KEY);
  });

  const setDepartmentId = useCallback((id: string | null) => {
    setDepartmentIdState(id);
    if (id) {
      localStorage.setItem(STORAGE_KEY, id);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const value = useMemo(() => ({ departmentId, setDepartmentId }), [departmentId, setDepartmentId]);

  return (
    <DepartmentContext.Provider value={value}>
      {children}
    </DepartmentContext.Provider>
  );
}

export function useDepartmentContext() {
  return useContext(DepartmentContext);
}
