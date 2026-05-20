"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";

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
  const [departmentId, setDepartmentIdState] = useState<string | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) setDepartmentIdState(stored);
  }, []);

  const setDepartmentId = (id: string | null) => {
    setDepartmentIdState(id);
    if (id) {
      localStorage.setItem(STORAGE_KEY, id);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  };

  return (
    <DepartmentContext.Provider value={{ departmentId, setDepartmentId }}>
      {children}
    </DepartmentContext.Provider>
  );
}

export function useDepartmentContext() {
  return useContext(DepartmentContext);
}
