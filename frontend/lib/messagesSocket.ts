"use client";

import { API_V1 } from "@/lib/constants";
import { getToken, getUserId } from "@/lib/auth";
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

/** Browser notification when a live message @-tags the current user — mirrors WhatsApp's
 * "you were mentioned" push. Only fires while the tab is backgrounded/hidden (matches how
 * these are actually useful: pinging you while you're away, not while you're already
 * looking at the screen). Centralized here (not in ConversationPane) so it fires no matter
 * which page is open, as long as the shared socket has a listener anywhere in the app. */
function notifyIfMentioned(evt: MessageEvent) {
  if (typeof window === "undefined" || typeof Notification === "undefined") return;
  if (!document.hidden) return;
  const myId = getUserId();
  if (!myId || evt.message.sender_id === myId) return;
  const mentioned = evt.message.mentions?.some((m) => m.id === myId);
  if (!mentioned) return;

  const show = () => {
    const n = new Notification(`${evt.message.sender_name} mentioned you`, {
      body: evt.message.body.slice(0, 200),
      tag: `mention-${evt.message.id}`,
    });
    n.onclick = () => {
      window.focus();
      window.location.href = "/messages";
      n.close();
    };
  };

  if (Notification.permission === "granted") {
    show();
  } else if (Notification.permission === "default") {
    Notification.requestPermission().then((perm) => {
      if (perm === "granted") show();
    });
  }
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
      if (data?.type === "message") {
        notifyIfMentioned(data as MessageEvent);
        listeners.forEach((fn) => fn(data as MessageEvent));
      }
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
