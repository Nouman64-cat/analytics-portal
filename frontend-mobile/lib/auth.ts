import * as SecureStore from "expo-secure-store";

const TOKEN_KEY = "auth_token";
const MUST_CHANGE_KEY = "must_change_password";

/** Hermes has no atob/Buffer by default — decode base64url manually. */
function base64UrlDecode(input: string): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/");
  let output = "";
  let buffer = 0;
  let bits = 0;
  for (const c of b64) {
    const idx = chars.indexOf(c);
    if (idx === -1) continue;
    buffer = (buffer << 6) | idx;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      output += String.fromCharCode((buffer >> bits) & 0xff);
    }
  }
  try {
    return decodeURIComponent(
      output
        .split("")
        .map((c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0"))
        .join(""),
    );
  } catch {
    return output;
  }
}

export interface TokenPayload {
  user_id?: string;
  email?: string;
  role?: string;
  department_id?: string | null;
  can_broadcast?: boolean;
  exp?: number;
}

export function decodeToken(token: string): TokenPayload | null {
  try {
    const payloadSegment = token.split(".")[1];
    return JSON.parse(base64UrlDecode(payloadSegment));
  } catch {
    return null;
  }
}

export function isTokenExpired(token: string): boolean {
  const payload = decodeToken(token);
  if (!payload?.exp) return true;
  return payload.exp * 1000 < Date.now();
}

export async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function setToken(token: string, mustChange: boolean): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
  await SecureStore.setItemAsync(MUST_CHANGE_KEY, mustChange ? "1" : "0");
}

export async function clearToken(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  await SecureStore.deleteItemAsync(MUST_CHANGE_KEY);
}

export async function mustChangePassword(): Promise<boolean> {
  return (await SecureStore.getItemAsync(MUST_CHANGE_KEY)) === "1";
}

export function isReadOnlyRole(role: string | null): boolean {
  return role === "bd-manager" || role === "guest";
}
