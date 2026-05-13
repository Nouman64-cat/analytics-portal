"use client";

import { createContext, useContext, useState, ReactNode } from "react";

interface DepartmentContextValue {
  departmentId: string | null;   // null = "All Departments"
  setDepartmentId: (id: string | null) => void;
}

const DepartmentContext = createContext<DepartmentContextValue>({
  departmentId: null,
  setDepartmentId: () => {},
});

export function DepartmentProvider({ children }: { children: ReactNode }) {
  const [departmentId, setDepartmentId] = useState<string | null>(null);
  return (
    <DepartmentContext.Provider value={{ departmentId, setDepartmentId }}>
      {children}
    </DepartmentContext.Provider>
  );
}

export function useDepartmentContext() {
  return useContext(DepartmentContext);
}
