"use client";

import { API_V1 } from "@/lib/constants";
import { getToken, getUserId } from "@/lib/auth";
import type { TeamMessage } from "@/lib/types";

export interface MessageEvent {
  type: "message" | "message_edited" | "message_deleted";
  thread_id: string;
  message: TeamMessage;
}

type Listener = (evt: MessageEvent) => void;

const listeners = new Set<Listener>();
let socket: WebSocket | null = null;
let backoffMs = 1000;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

// Which thread's conversation pane is currently mounted/visible, if any — lets the sound
// below skip messages the user is already watching appear live, without ConversationPane
// having to manage its own sound logic (kept centralized here like notifyIfMentioned).
let activeThreadId: string | null = null;
export function setActiveThreadId(id: string | null) {
  activeThreadId = id;
}

function wsUrl(): string {
  return `${API_V1.replace(/^http/, "ws")}/messages/ws`;
}

let audioCtx: AudioContext | null = null;

/** Short synthesized "pop" — no audio asset to ship/host, just two quick tones via the Web
 * Audio API. Browsers block audio until the user has interacted with the page at least once;
 * that's an unavoidable platform restriction, not a bug here — the first message after page
 * load may be silent, subsequent ones won't be. */
function playIncomingSound() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    if (!audioCtx) audioCtx = new Ctx();
    if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
    const now = audioCtx.currentTime;
    [{ freq: 880, start: 0 }, { freq: 1175, start: 0.09 }].forEach(({ freq, start }) => {
      const osc = audioCtx!.createOscillator();
      const gain = audioCtx!.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, now + start);
      gain.gain.linearRampToValueAtTime(0.15, now + start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, now + start + 0.15);
      osc.connect(gain).connect(audioCtx!.destination);
      osc.start(now + start);
      osc.stop(now + start + 0.16);
    });
  } catch {
    // audio isn't essential — never let it break message delivery
  }
}

/** Plays the incoming-message ping unless the user is already looking at this exact
 * conversation with the tab focused (they'll see the message appear live instead). */
function notifyIncomingSound(evt: MessageEvent) {
  if (typeof window === "undefined") return;
  const myId = getUserId();
  if (!myId || evt.message.sender_id === myId) return;
  if (!document.hidden && evt.thread_id === activeThreadId) return;
  playIncomingSound();
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
      if (data?.type === "message" || data?.type === "message_edited" || data?.type === "message_deleted") {
        if (data.type === "message") {
          notifyIfMentioned(data as MessageEvent);
          notifyIncomingSound(data as MessageEvent);
        }
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
