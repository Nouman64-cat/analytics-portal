"use client";

import { API_V1 } from "@/lib/constants";
import { getToken } from "@/lib/auth";
import type { TeamMessage } from "@/lib/types";

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

function wsUrl(): string {
  return `${API_V1.replace(/^http/, "ws")}/messages/ws`;
}

function connect() {
  if (typeof window === "undefined") return;
  const token = getToken();
  if (!token || listeners.size === 0) return;
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return;

  const ws = new WebSocket(wsUrl());
  socket = ws;

  ws.onopen = () => {
    ws.send(JSON.stringify({ token }));
    backoffMs = 1000;
  };
  ws.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data);
      if (data?.type === "message") listeners.forEach((fn) => fn(data as MessageEvent));
    } catch {
      // ignore malformed frames
    }
  };
  ws.onclose = () => {
    if (socket === ws) socket = null;
    if (listeners.size === 0) return;
    reconnectTimer = setTimeout(connect, backoffMs);
    backoffMs = Math.min(backoffMs * 2, 30000);
  };
  ws.onerror = () => ws.close();
}

/** Subscribe to live message events. Opens (or reuses) a single shared socket for the
 * whole app — call sites don't manage the connection, just react to events. Returns an
 * unsubscribe function; the socket closes itself once nothing is listening. */
export function subscribeToMessages(fn: Listener): () => void {
  listeners.add(fn);
  connect();
  return () => {
    listeners.delete(fn);
    if (listeners.size === 0) {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      socket?.close();
      socket = null;
    }
  };
}
