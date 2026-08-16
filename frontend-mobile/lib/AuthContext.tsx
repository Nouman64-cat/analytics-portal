import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react";
import {
  getToken,
  setToken as persistToken,
  clearToken as clearPersistedToken,
  decodeToken,
  isTokenExpired,
  mustChangePassword as readMustChangePassword,
  TokenPayload,
} from "./auth";
import { authService, setUnauthorizedHandler } from "./api";

interface AuthState {
  loading: boolean;
  token: string | null;
  payload: TokenPayload | null;
  mustChangePassword: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshMustChangeFlag: (value: boolean) => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [token, setTokenState] = useState<string | null>(null);
  const [mustChange, setMustChange] = useState(false);

  const logout = useCallback(async () => {
    await clearPersistedToken();
    setTokenState(null);
    setMustChange(false);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setTokenState(null);
      setMustChange(false);
    });
    (async () => {
      const stored = await getToken();
      if (stored && !isTokenExpired(stored)) {
        setTokenState(stored);
        setMustChange(await readMustChangePassword());
      } else if (stored) {
        await clearPersistedToken();
      }
      setLoading(false);
    })();
    return () => setUnauthorizedHandler(null);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { access_token, must_change_password } = await authService.login(email, password);
    await persistToken(access_token, must_change_password);
    setTokenState(access_token);
    setMustChange(must_change_password);
  }, []);

  const refreshMustChangeFlag = useCallback(async (value: boolean) => {
    if (token) await persistToken(token, value);
    setMustChange(value);
  }, [token]);

  const payload = useMemo(() => (token ? decodeToken(token) : null), [token]);

  const value = useMemo(
    () => ({ loading, token, payload, mustChangePassword: mustChange, login, logout, refreshMustChangeFlag }),
    [loading, token, payload, mustChange, login, logout, refreshMustChangeFlag],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
