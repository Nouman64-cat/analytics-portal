import { AppState, AppStateStatus } from "react-native";
import { API_V1 } from "./constants";
import { getToken } from "./auth";
import type { TeamMessage } from "./types";

export interface MessageEvent {
  type: "message";
  thread_id: string;
  message: TeamMessage;
}

type Listener = (evt: MessageEvent) => void;

const listeners = new Set<Listener>();
let socket: WebSocket | null = null;
let backoffMs = 1000;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let appIsActive = AppState.currentState === "active";

function wsUrl(): string {
  return `${API_V1.replace(/^http/, "ws")}/messages/ws`;
}

async function connect() {
  if (!appIsActive || listeners.size === 0) return;
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return;

  const token = await getToken();
  if (!token) return;

  const ws = new WebSocket(wsUrl());
  socket = ws;

  ws.onopen = () => {
    ws.send(JSON.stringify({ token }));
    backoffMs = 1000;
  };
  ws.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data as string);
      if (data?.type === "message") listeners.forEach((fn) => fn(data as MessageEvent));
    } catch {
      // ignore malformed frames
    }
  };
  ws.onclose = () => {
    if (socket === ws) socket = null;
    if (!appIsActive || listeners.size === 0) return;
    reconnectTimer = setTimeout(connect, backoffMs);
    backoffMs = Math.min(backoffMs * 2, 30000);
  };
  ws.onerror = () => ws.close();
}

function disconnect() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  socket?.close();
  socket = null;
}

AppState.addEventListener("change", (state: AppStateStatus) => {
  appIsActive = state === "active";
  if (appIsActive) connect();
  else disconnect();
});

/** Subscribe to live message events. Opens (or reuses) a single shared socket, paused
 * automatically while the app is backgrounded. Returns an unsubscribe function. */
export function subscribeToMessages(fn: Listener): () => void {
  listeners.add(fn);
  connect();
  return () => {
    listeners.delete(fn);
    if (listeners.size === 0) disconnect();
  };
}
