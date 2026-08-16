import React, { createContext, useContext, useState, useCallback, useMemo, useEffect, ReactNode } from "react";
import * as SecureStore from "expo-secure-store";

const STORAGE_KEY = "active_dept_id";

interface DepartmentContextValue {
  /** null = "All Departments" */
  departmentId: string | null;
  setDepartmentId: (id: string | null) => void;
  /** True once the persisted value has been read from storage. */
  ready: boolean;
}

const DepartmentContext = createContext<DepartmentContextValue>({
  departmentId: null,
  setDepartmentId: () => {},
  ready: false,
});

export function DepartmentProvider({ children }: { children: ReactNode }) {
  const [departmentId, setDepartmentIdState] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      const stored = await SecureStore.getItemAsync(STORAGE_KEY);
      setDepartmentIdState(stored || null);
      setReady(true);
    })();
  }, []);

  const setDepartmentId = useCallback((id: string | null) => {
    setDepartmentIdState(id);
    if (id) SecureStore.setItemAsync(STORAGE_KEY, id);
    else SecureStore.deleteItemAsync(STORAGE_KEY);
  }, []);

  const value = useMemo(() => ({ departmentId, setDepartmentId, ready }), [departmentId, setDepartmentId, ready]);

  return <DepartmentContext.Provider value={value}>{children}</DepartmentContext.Provider>;
}

export function useDepartmentContext() {
  return useContext(DepartmentContext);
}
