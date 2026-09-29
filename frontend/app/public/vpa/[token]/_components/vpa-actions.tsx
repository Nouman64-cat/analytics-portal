"use client";

/**
 * Create-only actions for the VPA page: new lead, add interview round, reschedule.
 * Every call needs a PIN session (X-VPA-Session), stored per device in localStorage.
 * See backend/app/routers/public_vpa_actions.py for what the server allows.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Briefcase,
  CalendarClock,
  Check,
  Delete,
  Loader2,
  Lock,
  Plus,
  Search,
  X,
} from "lucide-react";
import { API_V1 } from "@/lib/constants";
import { formatTime } from "@/lib/utils";

// ---- Types

interface Option {
  id: string;
  name: string;
}

interface Lookups {
  candidates: Option[];
  resume_profiles: (Option & { bd_id: string | null })[];
  bds: Option[];
  rounds: string[];
}

interface OpenLead {
  thread_id: string;
  company: string;
  role: string;
  latest_round: string;
  latest_date: string | null;
  candidate_id: string | null;
  candidate: string | null;
  suggested_round: string;
}

export interface ReschedulableInterview {
  id: string;
  candidate: string | null;
  company: string | null;
  round: string;
  date_est: string;
  time_est: string | null;
}

type Tz = "est" | "pkt";
type Sheet = "menu" | "lead" | "round" | "reschedule" | null;

// ---- Session storage (per device; wrapped because storage can be blocked)

const sessionKey = (token: string) => `vpa-session:${token}`;

function readSession(token: string): string | null {
  try {
    return localStorage.getItem(sessionKey(token));
  } catch {
    return null;
  }
}

function writeSession(token: string, value: string | null) {
  try {
    if (value) localStorage.setItem(sessionKey(token), value);
    else localStorage.removeItem(sessionKey(token));
  } catch {
    // Private mode etc. — the session just won't survive a reload.
  }
}

class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function readError(res: Response): Promise<string> {
  try {
    const body = await res.json();
    if (typeof body?.detail === "string") return body.detail;
    if (Array.isArray(body?.detail)) return "Please check the highlighted fields.";
  } catch {
    // fall through
  }
  return `Something went wrong (${res.status}).`;
}

// ---- EST <-> PKT preview (the server does the authoritative conversion)

/** Wall-clock date ("YYYY-MM-DD") and time ("HH:MM") of an instant in an IANA zone. */
function wallIn(zone: string, instant: number): { day: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(instant));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return {
    day: `${get("year")}-${get("month")}-${get("day")}`,
    time: `${get("hour")}:${get("minute")}`,
  };
}

const ZONES: Record<Tz, string> = {
  est: "America/New_York",
  pkt: "Asia/Karachi",
};

/** The instant a wall-clock time in `zone` refers to (two passes settle DST offsets). */
function instantOf(day: string, hhmm: string, zone: string): number {
  const [y, mo, d] = day.split("-").map(Number);
  const [h, mi] = hhmm.split(":").map(Number);
  const target = Date.UTC(y, mo - 1, d, h, mi);
  let guess = target;
  for (let k = 0; k < 2; k++) {
    const w = wallIn(zone, guess);
    const [wy, wmo, wd] = w.day.split("-").map(Number);
    const [wh, wmi] = w.time.split(":").map(Number);
    guess += target - Date.UTC(wy, wmo - 1, wd, wh, wmi);
  }
  return guess;
}

/** Convert a wall-clock date+time entered in `from` to the other zone. */
function convert(day: string, hhmm: string, from: Tz): { day: string; time: string } {
  return wallIn(ZONES[from === "est" ? "pkt" : "est"], instantOf(day, hhmm, ZONES[from]));
}

function shortDay(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

function todayIn(zone: string): string {
  return wallIn(zone, Date.now()).day;
}

// ---- Context so interview cards can trigger reschedule

interface ActionsCtx {
  enabled: boolean;
  reschedule: (i: ReschedulableInterview) => void;
}

const VpaActionsContext = createContext<ActionsCtx>({
  enabled: false,
  reschedule: () => {},
});

export function useVpaActions() {
  return useContext(VpaActionsContext);
}

// ---- Provider: FAB, PIN gate, sheets, toast

export function VpaActionsProvider({
  token,
  enabled,
  onChanged,
  children,
}: {
  token: string;
  enabled: boolean;
  onChanged: () => void;
  children: React.ReactNode;
}) {
  const [session, setSession] = useState<string | null>(null);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [needPin, setNeedPin] = useState<Sheet>(null);
  const [target, setTarget] = useState<ReschedulableInterview | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    setSession(readSession(token));
  }, [token]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2800);
    return () => clearTimeout(t);
  }, [toast]);

  const open = useCallback(
    (next: Sheet) => {
      if (session) setSheet(next);
      else setNeedPin(next);
    },
    [session],
  );

  const api = useCallback(
    async <T,>(path: string, init?: { method?: string; body?: unknown }): Promise<T> => {
      const res = await fetch(`${API_V1}/public/vpa/${encodeURIComponent(token)}${path}`, {
        method: init?.method ?? "GET",
        cache: "no-store",
        headers: {
          "X-VPA-Session": session ?? "",
          ...(init?.body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
      });
      if (res.status === 401) {
        // Expired or revoked (PIN/link changed): ask for the PIN again.
        writeSession(token, null);
        setSession(null);
        setNeedPin(sheet);
        setSheet(null);
        throw new ApiError("Please enter your PIN again.", 401);
      }
      if (!res.ok) throw new ApiError(await readError(res), res.status);
      return (await res.json()) as T;
    },
    [token, session, sheet],
  );

  const done = useCallback(
    (message: string) => {
      setSheet(null);
      setTarget(null);
      setToast(message);
      onChanged();
    },
    [onChanged],
  );

  const ctx = useMemo<ActionsCtx>(
    () => ({
      enabled,
      reschedule: (i) => {
        setTarget(i);
        open("reschedule");
      },
    }),
    [enabled, open],
  );

  return (
    <VpaActionsContext.Provider value={ctx}>
      {children}

      {enabled && (
        <button
          type="button"
          onClick={() => open("menu")}
          aria-label="Add lead or interview"
          className="fixed bottom-[calc(76px+env(safe-area-inset-bottom))] right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-indigo-600 text-white shadow-lg shadow-indigo-300 active:scale-95"
        >
          <Plus size={26} />
        </button>
      )}

      {needPin && (
        <PinSheet
          token={token}
          onClose={() => setNeedPin(null)}
          onUnlocked={(s) => {
            writeSession(token, s);
            setSession(s);
            setSheet(needPin);
            setNeedPin(null);
          }}
        />
      )}

      {sheet === "menu" && (
        <BottomSheet title="Add" onClose={() => setSheet(null)}>
          <div className="space-y-2.5 pb-2">
            <MenuItem
              icon={<Briefcase size={20} />}
              title="New lead"
              hint="A new opportunity from a BD"
              onClick={() => setSheet("lead")}
            />
            <MenuItem
              icon={<CalendarClock size={20} />}
              title="Add interview round"
              hint="Schedule the next round on an existing lead"
              onClick={() => setSheet("round")}
            />
            <button
              type="button"
              onClick={() => {
                writeSession(token, null);
                setSession(null);
                setSheet(null);
              }}
              className="flex w-full items-center justify-center gap-1.5 pt-3 text-[13px] font-medium text-slate-500"
            >
              <Lock size={13} /> Lock this device
            </button>
          </div>
        </BottomSheet>
      )}

      {sheet === "lead" && session && (
        <NewLeadSheet api={api} onClose={() => setSheet(null)} onDone={done} />
      )}
      {sheet === "round" && session && (
        <AddRoundSheet api={api} onClose={() => setSheet(null)} onDone={done} />
      )}
      {sheet === "reschedule" && session && target && (
        <RescheduleSheet
          api={api}
          interview={target}
          onClose={() => {
            setSheet(null);
            setTarget(null);
          }}
          onDone={done}
        />
      )}

      {toast && (
        <div className="fixed inset-x-0 bottom-[calc(144px+env(safe-area-inset-bottom))] z-50 flex justify-center px-4">
          <div className="flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-lg">
            <Check size={16} className="text-emerald-400" />
            {toast}
          </div>
        </div>
      )}
    </VpaActionsContext.Provider>
  );
}

type Api = <T>(path: string, init?: { method?: string; body?: unknown }) => Promise<T>;

// ---- Building blocks

function BottomSheet({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return (
    <div className="fixed inset-0 z-40 flex flex-col justify-end bg-slate-900/40" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="mx-auto flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-3xl bg-slate-50 shadow-2xl"
      >
        <div className="flex items-center justify-between px-4 pb-2 pt-4">
          <h2 className="text-[17px] font-bold text-slate-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-200/70 text-slate-600"
          >
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 pb-4">{children}</div>
        {footer && (
          <div className="border-t border-slate-200 bg-white px-4 pb-[calc(12px+env(safe-area-inset-bottom))] pt-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

function MenuItem({
  icon,
  title,
  hint,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left active:bg-slate-50"
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
        {icon}
      </span>
      <span>
        <span className="block text-[15px] font-semibold text-slate-900">{title}</span>
        <span className="block text-[13px] text-slate-500">{hint}</span>
      </span>
    </button>
  );
}

// 16px text keeps iOS Safari from zooming into focused inputs.
const inputCls =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-base text-slate-900 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100";

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-semibold text-slate-700">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </span>
      {children}
    </label>
  );
}

function Select({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Option[];
  placeholder: string;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={inputCls}>
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.name}
        </option>
      ))}
    </select>
  );
}

function Chips<T extends string | number>({
  value,
  onChange,
  options,
  label = (v) => String(v),
}: {
  value: T;
  onChange: (v: T) => void;
  options: readonly T[];
  label?: (v: T) => string;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={String(o)}
          type="button"
          onClick={() => onChange(o)}
          className={`rounded-full border px-3.5 py-2 text-sm font-medium ${
            value === o
              ? "border-indigo-600 bg-indigo-600 text-white"
              : "border-slate-200 bg-white text-slate-700"
          }`}
        >
          {label(o)}
        </button>
      ))}
    </div>
  );
}

function SubmitButton({
  busy,
  disabled,
  onClick,
  children,
}: {
  busy: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy || disabled}
      className="flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 py-3.5 text-base font-semibold text-white disabled:opacity-40"
    >
      {busy && <Loader2 size={18} className="animate-spin" />}
      {children}
    </button>
  );
}

function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
      {message}
    </p>
  );
}

function useLookups(api: Api) {
  const [data, setData] = useState<Lookups | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    api<Lookups>("/lookups")
      .then((d) => !cancelled && setData(d))
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
    // Load once per sheet; `api` changes identity with unrelated state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return { data, error };
}

/** Date + time with an EST/PKT switch and a live preview of the other zone. */
function WhenFields({
  day,
  time,
  tz,
  onChange,
}: {
  day: string;
  time: string;
  tz: Tz;
  onChange: (next: { day: string; time: string; tz: Tz }) => void;
}) {
  const other = day && time ? convert(day, time, tz) : null;
  const switchTz = (next: Tz) => {
    if (next === tz) return;
    // Keep the same moment when flipping the clock the fields are shown in.
    if (day && time) onChange({ ...convert(day, time, tz), tz: next });
    else onChange({ day, time, tz: next });
  };
  return (
    <div className="space-y-3">
      <div className="flex rounded-xl bg-slate-200/70 p-1">
        {(["est", "pkt"] as const).map((z) => (
          <button
            key={z}
            type="button"
            onClick={() => switchTz(z)}
            className={`flex-1 rounded-lg py-2 text-sm font-semibold ${
              tz === z ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
            }`}
          >
            Enter in {z === "est" ? "US Eastern" : "PKT"}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label={`Date (${tz.toUpperCase()})`} required>
          <input
            type="date"
            value={day}
            onChange={(e) => onChange({ day: e.target.value, time, tz })}
            className={inputCls}
          />
        </Field>
        <Field label={`Time (${tz.toUpperCase()})`}>
          <input
            type="time"
            value={time}
            onChange={(e) => onChange({ day, time: e.target.value, tz })}
            className={inputCls}
          />
        </Field>
      </div>
      {other && (
        <p className="rounded-xl bg-indigo-50 px-3 py-2 text-[13px] text-indigo-800">
          = {formatTime(other.time)} {tz === "est" ? "PKT" : "EST"}, {shortDay(other.day)}
        </p>
      )}
    </div>
  );
}

// ---- PIN

function PinSheet({
  token,
  onClose,
  onUnlocked,
}: {
  token: string;
  onClose: () => void;
  onUnlocked: (session: string) => void;
}) {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (value: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${API_V1}/public/vpa/${encodeURIComponent(token)}/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: value }),
      });
      if (!res.ok) {
        setError(await readError(res));
        setPin("");
        return;
      }
      onUnlocked((await res.json()).session);
    } catch {
      setError("Couldn't reach the server. Check your connection.");
    } finally {
      setBusy(false);
    }
  };

  const press = (d: string) => {
    if (busy) return;
    setError(null);
    setPin((p) => (p.length < 8 ? p + d : p));
  };

  return (
    <BottomSheet title="Enter PIN" onClose={onClose}>
      <p className="text-center text-sm text-slate-500">
        Your PIN unlocks adding leads and interviews on this phone.
      </p>
      <div className="my-5 flex justify-center gap-3">
        {Array.from({ length: Math.max(4, pin.length) }, (_, i) => (
          <span
            key={i}
            className={`h-3.5 w-3.5 rounded-full ${i < pin.length ? "bg-indigo-600" : "bg-slate-300"}`}
          />
        ))}
      </div>
      <div className="min-h-5 text-center text-sm font-medium text-red-600">{error}</div>
      <div className="mx-auto mt-2 grid max-w-[280px] grid-cols-3 gap-3 pb-2">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <PinKey key={d} onClick={() => press(d)}>
            {d}
          </PinKey>
        ))}
        <PinKey onClick={() => setPin((p) => p.slice(0, -1))} aria-label="Delete">
          <Delete size={22} />
        </PinKey>
        <PinKey onClick={() => press("0")}>0</PinKey>
        <button
          type="button"
          onClick={() => submit(pin)}
          disabled={busy || pin.length < 4}
          aria-label="Unlock"
          className="flex h-16 items-center justify-center rounded-2xl bg-indigo-600 text-white disabled:opacity-40"
        >
          {busy ? <Loader2 size={22} className="animate-spin" /> : <Check size={24} />}
        </button>
      </div>
    </BottomSheet>
  );
}

function PinKey({
  onClick,
  children,
  ...rest
}: {
  onClick: () => void;
  children: React.ReactNode;
  "aria-label"?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      {...rest}
      className="flex h-16 items-center justify-center rounded-2xl bg-white text-2xl font-semibold text-slate-900 shadow-sm active:bg-slate-100"
    >
      {children}
    </button>
  );
}

// ---- New lead

function CompanyPicker({
  api,
  value,
  onChange,
}: {
  api: Api;
  value: Option | null;
  onChange: (c: Option | null) => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Option[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    const term = q.trim();
    const mine = ++seq.current;
    if (!term) {
      setResults([]);
      return;
    }
    const t = setTimeout(() => {
      api<Option[]>(`/companies?q=${encodeURIComponent(term)}`)
        .then((r) => mine === seq.current && setResults(r))
        .catch(() => {});
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  if (value)
    return (
      <div className="flex items-center justify-between rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-3">
        <span className="text-base font-semibold text-indigo-900">{value.name}</span>
        <button
          type="button"
          onClick={() => onChange(null)}
          className="text-sm font-semibold text-indigo-600"
        >
          Change
        </button>
      </div>
    );

  const term = q.trim();
  const exact = results.some((r) => r.name.toLowerCase() === term.toLowerCase());

  const addNew = async () => {
    setBusy(true);
    setError(null);
    try {
      onChange(
        await api<Option>("/companies", {
          method: "POST",
          body: { name: term },
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="relative">
        <Search
          size={16}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
        />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search company…"
          autoComplete="off"
          className={`${inputCls} pl-9`}
        />
      </div>
      {term && (
        <div className="mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white">
          {results.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => onChange(r)}
              className="block w-full border-b border-slate-100 px-3 py-3 text-left text-[15px] text-slate-800 last:border-b-0 active:bg-slate-50"
            >
              {r.name}
            </button>
          ))}
          {!exact && (
            <button
              type="button"
              onClick={addNew}
              disabled={busy}
              className="flex w-full items-center gap-2 px-3 py-3 text-left text-[15px] font-semibold text-indigo-600 active:bg-indigo-50"
            >
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
              Add &ldquo;{term}&rdquo; as a new company
            </button>
          )}
        </div>
      )}
      <FormError message={error} />
    </div>
  );
}

function NewLeadSheet({
  api,
  onClose,
  onDone,
}: {
  api: Api;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const { data, error: loadError } = useLookups(api);
  const [company, setCompany] = useState<Option | null>(null);
  const [role, setRole] = useState("");
  const [profileId, setProfileId] = useState("");
  const [bdId, setBdId] = useState("");
  const [candidateId, setCandidateId] = useState("");
  const [salary, setSalary] = useState("");
  const [arrivedOn, setArrivedOn] = useState(() => todayIn("Asia/Karachi"));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Profiles belong to a BD: picking one side fills the other when it's still empty.
  const pickBd = (id: string) => {
    setBdId(id);
    if (id && !profileId) {
      const p = data?.resume_profiles.find((rp) => rp.bd_id === id);
      if (p) setProfileId(p.id);
    }
  };
  const pickProfile = (id: string) => {
    setProfileId(id);
    const p = data?.resume_profiles.find((rp) => rp.id === id);
    if (p?.bd_id && !bdId) setBdId(p.bd_id);
  };

  const ready = company && role.trim() && profileId;

  const submit = async () => {
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      await api("/leads", {
        method: "POST",
        body: {
          company_id: company.id,
          role: role.trim(),
          resume_profile_id: profileId,
          bd_id: bdId || null,
          candidate_id: candidateId || null,
          salary_range: salary.trim() || null,
          arrived_on: arrivedOn || null,
        },
      });
      onDone(`Lead added for ${company.name}`);
    } catch (e) {
      if ((e as ApiError).status !== 401) setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet
      title="New lead"
      onClose={onClose}
      footer={
        <SubmitButton busy={busy} disabled={!ready} onClick={submit}>
          Add lead
        </SubmitButton>
      }
    >
      {!data && !loadError && <Loader2 className="mx-auto my-10 animate-spin text-slate-400" />}
      <FormError message={loadError} />
      {data && (
        <div className="space-y-4">
          <Field label="Company" required>
            <CompanyPicker api={api} value={company} onChange={setCompany} />
          </Field>
          <Field label="Role" required>
            <input
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="e.g. Senior ML Engineer"
              className={inputCls}
            />
          </Field>
          <Field label="BD">
            <Select value={bdId} onChange={pickBd} options={data.bds} placeholder="Select BD" />
          </Field>
          <Field label="Resume profile" required>
            <Select
              value={profileId}
              onChange={pickProfile}
              options={data.resume_profiles}
              placeholder="Select profile"
            />
          </Field>
          <Field label="Candidate">
            <Select
              value={candidateId}
              onChange={setCandidateId}
              options={data.candidates}
              placeholder="Not decided yet"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Salary range">
              <input
                value={salary}
                onChange={(e) => setSalary(e.target.value)}
                placeholder="Optional"
                className={inputCls}
              />
            </Field>
            <Field label="Arrived on">
              <input
                type="date"
                value={arrivedOn}
                onChange={(e) => setArrivedOn(e.target.value)}
                className={inputCls}
              />
            </Field>
          </div>
          <FormError message={error} />
        </div>
      )}
    </BottomSheet>
  );
}

// ---- Add round

function LeadPicker({
  api,
  value,
  onChange,
}: {
  api: Api;
  value: OpenLead | null;
  onChange: (l: OpenLead | null) => void;
}) {
  const [q, setQ] = useState("");
  const [leads, setLeads] = useState<OpenLead[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(
      () => {
        api<OpenLead[]>(`/leads?q=${encodeURIComponent(q.trim())}`)
          .then((r) => !cancelled && setLeads(r))
          .catch((e: Error) => !cancelled && setError(e.message));
      },
      q ? 250 : 0,
    );
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  if (value)
    return (
      <div className="flex items-start justify-between gap-3 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-3">
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-indigo-900">{value.company}</p>
          <p className="truncate text-[13px] text-indigo-800/80">
            {value.role} · last round: {value.latest_round}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onChange(null)}
          className="shrink-0 text-sm font-semibold text-indigo-600"
        >
          Change
        </button>
      </div>
    );

  return (
    <div>
      <div className="relative">
        <Search
          size={16}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
        />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search company or role…"
          autoComplete="off"
          className={`${inputCls} pl-9`}
        />
      </div>
      <FormError message={error} />
      <div className="mt-2 max-h-[45dvh] overflow-y-auto rounded-xl border border-slate-200 bg-white">
        {leads === null && <Loader2 className="mx-auto my-6 animate-spin text-slate-400" />}
        {leads?.length === 0 && (
          <p className="px-3 py-6 text-center text-sm text-slate-500">
            No open leads match. Add it as a new lead first.
          </p>
        )}
        {leads?.map((l) => (
          <button
            key={l.thread_id}
            type="button"
            onClick={() => onChange(l)}
            className="block w-full border-b border-slate-100 px-3 py-3 text-left last:border-b-0 active:bg-slate-50"
          >
            <p className="truncate text-[15px] font-semibold text-slate-900">{l.company}</p>
            <p className="truncate text-[13px] text-slate-500">
              {l.role} · {l.latest_round}
              {l.candidate ? ` · ${l.candidate}` : ""}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}

const DURATIONS = [30, 45, 60, 90] as const;

function AddRoundSheet({
  api,
  onClose,
  onDone,
}: {
  api: Api;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const { data, error: loadError } = useLookups(api);
  const [lead, setLead] = useState<OpenLead | null>(null);
  const [candidateId, setCandidateId] = useState("");
  const [round, setRound] = useState("");
  const [when, setWhen] = useState<{ day: string; time: string; tz: Tz }>(() => ({
    day: todayIn("America/New_York"),
    time: "",
    tz: "est",
  }));
  const [duration, setDuration] = useState<(typeof DURATIONS)[number]>(30);
  const [interviewer, setInterviewer] = useState("");
  const [phone, setPhone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pickLead = (l: OpenLead | null) => {
    setLead(l);
    if (l) {
      setCandidateId(l.candidate_id ?? "");
      setRound(l.suggested_round);
    }
  };

  const ready = lead && candidateId && round.trim() && when.day;

  const submit = async () => {
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      await api("/interviews", {
        method: "POST",
        body: {
          thread_id: lead.thread_id,
          candidate_id: candidateId,
          round: round.trim(),
          day: when.day,
          at: when.time || null,
          tz: when.tz,
          duration_minutes: duration,
          interviewer: interviewer.trim() || null,
          is_phone_call: phone,
        },
      });
      onDone(`${round} round added for ${lead.company}`);
    } catch (e) {
      if ((e as ApiError).status !== 401) setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet
      title="Add interview round"
      onClose={onClose}
      footer={
        <SubmitButton busy={busy} disabled={!ready} onClick={submit}>
          Add round
        </SubmitButton>
      }
    >
      {!data && !loadError && <Loader2 className="mx-auto my-10 animate-spin text-slate-400" />}
      <FormError message={loadError} />
      {data && (
        <div className="space-y-4">
          <Field label="Lead" required>
            <LeadPicker api={api} value={lead} onChange={pickLead} />
          </Field>
          {lead && (
            <>
              <Field label="Candidate" required>
                <Select
                  value={candidateId}
                  onChange={setCandidateId}
                  options={data.candidates}
                  placeholder="Select candidate"
                />
              </Field>
              <div>
                <p className="mb-1.5 text-[13px] font-semibold text-slate-700">
                  Round<span className="text-red-500"> *</span>
                </p>
                <Chips value={round} onChange={setRound} options={data.rounds} />
              </div>
              <WhenFields {...when} onChange={setWhen} />
              <div>
                <p className="mb-1.5 text-[13px] font-semibold text-slate-700">Duration</p>
                <Chips
                  value={duration}
                  onChange={setDuration}
                  options={DURATIONS}
                  label={(m) => `${m} min`}
                />
              </div>
              <div>
                <p className="mb-1.5 text-[13px] font-semibold text-slate-700">Type</p>
                <Chips
                  value={phone ? "Phone call" : "Video call"}
                  onChange={(v) => setPhone(v === "Phone call")}
                  options={["Video call", "Phone call"] as const}
                />
              </div>
              <Field label="Interviewer">
                <input
                  value={interviewer}
                  onChange={(e) => setInterviewer(e.target.value)}
                  placeholder="Optional"
                  className={inputCls}
                />
              </Field>
              <p className="text-xs text-slate-500">
                The candidate gets the usual interview email once this is added.
              </p>
            </>
          )}
          <FormError message={error} />
        </div>
      )}
    </BottomSheet>
  );
}

// ---- Reschedule

function RescheduleSheet({
  api,
  interview,
  onClose,
  onDone,
}: {
  api: Api;
  interview: ReschedulableInterview;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const [when, setWhen] = useState<{ day: string; time: string; tz: Tz }>({
    day: interview.date_est,
    time: interview.time_est ?? "",
    tz: "est",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api(`/interviews/${interview.id}/schedule`, {
        method: "PATCH",
        body: { day: when.day, at: when.time || null, tz: when.tz },
      });
      onDone("Interview rescheduled");
    } catch (e) {
      if ((e as ApiError).status !== 401) setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet
      title="Reschedule"
      onClose={onClose}
      footer={
        <SubmitButton busy={busy} disabled={!when.day} onClick={submit}>
          Save new time
        </SubmitButton>
      }
    >
      <div className="space-y-4">
        <div className="rounded-xl border border-slate-200 bg-white px-3 py-3">
          <p className="text-[15px] font-semibold text-slate-900">
            {interview.candidate || "No candidate yet"}
          </p>
          <p className="text-[13px] text-slate-500">
            {interview.company?.trim() || "Unknown company"} · {interview.round}
          </p>
          <p className="mt-1 text-[13px] text-slate-500">
            Currently {shortDay(interview.date_est)}
            {interview.time_est ? `, ${formatTime(interview.time_est)} EST` : ""}
          </p>
        </div>
        <WhenFields {...when} onChange={setWhen} />
        <p className="text-xs text-slate-500">
          Only the date and time change. The candidate gets an updated interview email and reminders
          are re-armed for the new time.
        </p>
        <FormError message={error} />
      </div>
    </BottomSheet>
  );
}
