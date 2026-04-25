const TOKEN_KEY = "auth_token";
const MUST_CHANGE_KEY = "must_change_password";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string, mustChange: boolean): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(MUST_CHANGE_KEY, mustChange ? "1" : "0");
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(MUST_CHANGE_KEY);
}

export function mustChangePassword(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(MUST_CHANGE_KEY) === "1";
}

export function isTokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.exp * 1000 < Date.now();
  } catch {
    return true;
  }
}

export function isAuthenticated(): boolean {
  const token = getToken();
  if (!token) return false;
  return !isTokenExpired(token);
}

export function getUserRole(): string | null {
  const token = getToken();
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.role ?? null;
  } catch {
    return null;
  }
}

export function getUserId(): string | null {
  const token = getToken();
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.user_id ?? null;
  } catch {
    return null;
  }
}
