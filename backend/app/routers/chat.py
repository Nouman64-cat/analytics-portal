"""Agentic chat assistant — creates companies, leads, and interviews via OpenAI function calling."""

from __future__ import annotations

import json
import uuid
from datetime import datetime, date, time as dt_time, timedelta
from typing import Any, Optional
from zoneinfo import ZoneInfo

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from pydantic import BaseModel
from sqlmodel import Session, select

from app import analytics_helpers
from app.config import get_settings
from app.database import get_session
from app.deps import get_current_user
from app.models.business_developer import BusinessDeveloper
from app.models.candidate import Candidate
from app.models.company import Company
from app.models.interview import Interview
from app.models.resume_profile import ResumeProfile
from app.models.user import User, UserRole
from app.lead_thread_utils import ALLOWED_LEAD_OUTCOMES
from app.team_member_scope import candidate_id_for_team_member
from app.email_ses import try_send_interview_created_email, make_presigned_doc_url
from app.schemas.interview import InterviewCreate, InterviewUpdate
from app.schemas.company import CompanyCreate
from app.schemas.lead_thread import LeadThreadUpdate
# Reused directly (as plain function calls) so every read AND write this assistant makes
# goes through the exact same department/ownership/entity scoping the REST API enforces —
# the chat tools below must never query or mutate rows by hand, only through these.
from app.routers.companies import (
    create_company as _create_company_endpoint,
    list_companies as _list_companies_endpoint,
)
from app.routers.interviews import (
    create_interview as _create_interview_endpoint,
    update_interview as _update_interview_endpoint,
    patch_lead_thread_status as _patch_lead_thread_endpoint,
    list_interviews as _list_interviews_endpoint,
)
from app.routers.candidates import list_candidates as _list_candidates_endpoint
from app.routers.business_developers import list_business_developers as _list_business_developers_endpoint

router = APIRouter(prefix="/api/v1/chat", tags=["Chat"])

# ─── Per-role tool access ─────────────────────────────────────
# Every role can open Jarvis; which tools it's even offered differs by role, mirroring the
# real REST gates exactly (not a separate policy invented for chat).

# Mirrors app/deps.py:assert_write_access exactly — blocked from any write at all.
_WRITE_BLOCKED_ROLES = {UserRole.BD_MANAGER, UserRole.GUEST, UserRole.COORDINATOR}
# Mirrors app/routers/leads.py:_require_lead_write_role. Deliberately stricter than plain
# write access for genuinely lead-level operations (opening a new pipeline, editing
# lead-thread metadata, changing lead outcome): the real create_interview/update_interview
# endpoints don't reject MANAGER themselves (a real gap in interviews.py — a manager could
# open a new pipeline through that endpoint even though the dedicated Leads API blocks
# them), but Jarvis should match the product's actual intent for "who manages leads," not
# inherit that backend inconsistency.
_LEAD_WRITE_ROLES = {
    UserRole.SUPERADMIN,
    UserRole.TEAM_MEMBER,
    UserRole.BD,
    UserRole.DEPT_LEAD,
    UserRole.BD_TEAM_LEAD,
    UserRole.TECH_STACK_MANAGER,
}


def _assert_jarvis_access(user: User) -> None:
    """Superadmins always have access; everyone else needs an active trial/subscription
    granted from the User Management page (User.jarvis_access_until in the future)."""
    if user.role == UserRole.SUPERADMIN:
        return
    if user.jarvis_access_until and user.jarvis_access_until > datetime.utcnow():
        return
    raise HTTPException(
        status_code=status.HTTP_402_PAYMENT_REQUIRED,
        detail="Jarvis AI requires an active subscription or trial. Ask your superadmin to activate one.",
    )


_READ_ONLY_TOOL_NAMES = {
    "list_companies",
    "list_resume_profiles",
    "list_candidates",
    "list_business_developers",
    "list_interviews",
}
_LEAD_WRITE_TOOL_NAMES = {"create_lead", "schedule_interview", "update_lead", "update_lead_outcome"}
# Everything else in _TOOLS (create_company, update_interview) is gated by plain write
# access only — no lead-specific restriction, matching their real endpoints.

# ─── Pending write confirmation ──────────────────────────────
# Every mutating tool call is proposed, not executed, on the first pass — the model must
# get the user's explicit confirmation (a click in the UI) before anything is written.
# In-memory only: fine for a single-uvicorn-process app (same constraint as ws_manager.py),
# and a short TTL means a restart or expiry just means "ask again," never a stuck state.

_MUTATING_TOOLS = {
    "create_company",
    "create_lead",
    "schedule_interview",
    "update_interview",
    "update_lead",
    "update_lead_outcome",
}
_PENDING_TTL_MINUTES = 10
_pending_actions: dict[str, dict[str, Any]] = {}


def _prune_pending_actions() -> None:
    cutoff = datetime.utcnow() - timedelta(minutes=_PENDING_TTL_MINUTES)
    for action_id in [k for k, v in _pending_actions.items() if v["created_at"] < cutoff]:
        _pending_actions.pop(action_id, None)


def _resolve_bd_id(args: dict[str, Any], session: Session) -> tuple[Optional[uuid.UUID], Optional[str]]:
    """Resolve a business developer to its UUID from bd_id or bd_name.

    Tolerant of gpt-4o-mini sometimes putting the plain name straight into bd_id instead
    of calling list_business_developers first and using bd_name — a bd_id that isn't a
    valid UUID is treated as a name to look up rather than crashing the whole write.
    Returns (bd_id, error) — error is set only when a name was given (in either field)
    and no match was found.
    """
    raw_id = (args.get("bd_id") or "").strip()
    if raw_id:
        try:
            return uuid.UUID(raw_id), None
        except ValueError:
            pass  # not a real UUID — fall through and treat it as a name instead

    name = (args.get("bd_name") or raw_id or "").strip()
    if not name:
        return None, None
    bd_row = session.exec(
        select(BusinessDeveloper).where(BusinessDeveloper.name.ilike(f"%{name}%"))
    ).first()
    if not bd_row:
        return None, f"Business developer '{name}' not found"
    return bd_row.id, None


def _summarize_pending(name: str, args: dict[str, Any]) -> str:
    if name == "create_company":
        return f"Create company \"{args.get('name', '?')}\""
    if name == "create_lead":
        return f"Open a new lead — {args.get('role', '?')}"
    if name == "schedule_interview":
        return f"Schedule interview — {args.get('role', '?')} ({args.get('round', '?')})"
    if name == "update_interview":
        return "Update this interview"
    if name == "update_lead":
        return "Update this lead"
    if name == "update_lead_outcome":
        return f"Mark lead outcome as \"{args.get('outcome', '?')}\""
    return f"Run {name}"


def _build_pending_details(name: str, args: dict[str, Any], session: Session) -> list[dict[str, str]]:
    """Field-level breakdown for the confirmation card — resolves IDs to names where the
    lookup is cheap (a single get-by-id), so the user confirms real data, not a UUID."""

    def _lookup(model: Any, raw_id: Optional[str]) -> Optional[Any]:
        if not raw_id:
            return None
        try:
            return session.get(model, uuid.UUID(raw_id))
        except ValueError:
            return None

    def _bd_display(raw_id: Optional[str], name_hint: Optional[str]) -> Optional[str]:
        if name_hint:
            return name_hint
        bd = _lookup(BusinessDeveloper, raw_id)
        return bd.name if bd else None

    details: list[dict[str, str]] = []

    if name == "create_company":
        details.append({"label": "Name", "value": args.get("name") or "—"})
        if args.get("is_staffing_firm"):
            details.append({"label": "Type", "value": "Staffing firm"})
        if args.get("detail"):
            details.append({"label": "Notes", "value": args["detail"]})

    elif name in ("create_lead", "schedule_interview"):
        company = _lookup(Company, args.get("company_id"))
        if company:
            details.append({"label": "Company", "value": company.name})
        if args.get("role"):
            details.append({"label": "Role", "value": args["role"]})
        if name == "schedule_interview" and args.get("round"):
            details.append({"label": "Round", "value": args["round"]})
        candidate = _lookup(Candidate, args.get("candidate_id"))
        if candidate:
            details.append({"label": "Candidate", "value": candidate.name})
        bd = _bd_display(args.get("bd_id"), args.get("bd_name"))
        if bd:
            details.append({"label": "Business developer", "value": bd})
        if args.get("salary_range"):
            details.append({"label": "Salary", "value": args["salary_range"]})
        date_field = "arrived_on" if name == "create_lead" else "interview_date"
        if args.get(date_field):
            details.append({"label": "Date", "value": args[date_field]})
        if args.get("time_est"):
            details.append({"label": "Time", "value": f"{args['time_est']} EST"})
        if args.get("interviewer"):
            details.append({"label": "Interviewer", "value": args["interviewer"]})
        if args.get("is_phone_call"):
            details.append({"label": "Format", "value": "Phone call"})
        if args.get("notes"):
            details.append({"label": "Notes", "value": args["notes"]})

    elif name in ("update_interview", "update_lead"):
        skip = {"interview_id", "bd_id"}
        bd = _bd_display(args.get("bd_id"), args.get("bd_name"))
        if bd:
            details.append({"label": "Business developer", "value": bd})
            skip.add("bd_name")
        for key, value in args.items():
            if key in skip or value in (None, ""):
                continue
            label = key.replace("_", " ").title()
            if label.endswith("Est"):
                label = label[:-3] + "EST"
            details.append({"label": label, "value": str(value)})

    elif name == "update_lead_outcome":
        details.append({"label": "New outcome", "value": (args.get("outcome") or "—").title()})

    return details


# ─── Request / Response ─────────────────────────────────────

class HistoryMessage(BaseModel):
    role: str  # "user" | "assistant"
    content: str


class ChatRequest(BaseModel):
    messages: list[HistoryMessage] = []
    message: str


class ChatAction(BaseModel):
    type: str
    description: str
    id: Optional[str] = None


class PendingActionDetail(BaseModel):
    label: str
    value: str


class PendingActionOut(BaseModel):
    id: str
    # The raw tool name (e.g. "create_lead") — lets the frontend pick a matching icon.
    action_type: str
    summary: str
    # Field-level breakdown of what's about to be written — IDs are resolved to names
    # where cheap (company/candidate/BD lookups) so the user is confirming real business
    # data, not a UUID.
    details: list[PendingActionDetail] = []


class ChatResponse(BaseModel):
    reply: str
    actions: list[ChatAction] = []
    # Set when the assistant proposed a write this turn — nothing has been executed yet.
    # The frontend must render a Confirm/Cancel control and call /confirm or /cancel.
    pending_action: Optional[PendingActionOut] = None


class ConfirmActionRequest(BaseModel):
    action_id: str


# ─── Tool definitions ────────────────────────────────────────

_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "list_companies",
            "description": (
                "List all companies in the database. Call this to check whether a company already exists before creating a lead or interview. "
                "After calling this, find the company whose name matches the user's input (case-insensitive). "
                "If no match exists, call create_company — never use a different company as a substitute."
            ),
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_resume_profiles",
            "description": "List all resume profiles. Call this to resolve a profile name to its ID.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_candidates",
            "description": "List available candidates. For team members this returns only their own profile.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_business_developers",
            "description": "List all business developers.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_interviews",
            "description": (
                "Search the interview/lead database. Use this when the pipeline snapshot in the system prompt "
                "does not contain the record you need (e.g. older entries). "
                "Returns interview_id and thread_id needed for update calls."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "company_name": {"type": "string", "description": "Partial company name (optional)"},
                    "role": {"type": "string", "description": "Partial role/job title (optional)"},
                    "round": {"type": "string", "description": "Round label (optional)"},
                    "limit": {"type": "integer", "description": "Max results (default 20)", "default": 20},
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "create_company",
            "description": (
                "Create a new company. Call this when list_companies confirms the company does not exist. "
                "You may create the company automatically as part of a lead/interview flow without extra confirmation from the user, "
                "but you MUST tell the user in your reply that you created it."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {"type": "string", "description": "Company name"},
                    "is_staffing_firm": {"type": "boolean", "description": "True if this is a staffing / recruiting agency", "default": False},
                    "detail": {"type": "string", "description": "Optional notes about the company"},
                },
                "required": ["name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "create_lead",
            "description": "Open a new lead (pipeline opportunity) for a company. Requires company_id and resume_profile_id.",
            "parameters": {
                "type": "object",
                "properties": {
                    "company_id": {"type": "string", "description": "UUID of the company"},
                    "resume_profile_id": {"type": "string", "description": "UUID of the resume profile"},
                    "role": {"type": "string", "description": "Job title / opportunity name"},
                    "candidate_id": {"type": "string", "description": "UUID of the candidate (leave blank for team members — set automatically)"},
                    "bd_id": {"type": "string", "description": "UUID of the business developer (optional if bd_name provided)"},
                    "bd_name": {"type": "string", "description": "Name of the business developer (optional if bd_id provided — I will look it up for you)"},
                    "salary_range": {"type": "string", "description": "e.g. '$120k–$140k' (optional)"},
                    "notes": {"type": "string", "description": "Free-text notes (optional)"},
                    "arrived_on": {"type": "string", "description": "Date received, YYYY-MM-DD (optional)"},
                },
                "required": ["company_id", "resume_profile_id", "role"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "schedule_interview",
            "description": "Schedule an interview round. Requires company_id and resume_profile_id.",
            "parameters": {
                "type": "object",
                "properties": {
                    "company_id": {"type": "string", "description": "UUID of the company"},
                    "resume_profile_id": {"type": "string", "description": "UUID of the resume profile"},
                    "role": {"type": "string", "description": "Job title"},
                    "round": {"type": "string", "description": "Round label — e.g. 'Lead', 'Phone Screen', 'Technical', 'Onsite', 'Final Round', 'Offer'"},
                    "interview_date": {"type": "string", "description": "YYYY-MM-DD (optional)"},
                    "time_est": {"type": "string", "description": "HH:MM 24-hour EST (optional)"},
                    "candidate_id": {"type": "string", "description": "UUID of the candidate (leave blank for team members)"},
                    "bd_id": {"type": "string", "description": "UUID of the business developer (optional if bd_name provided)"},
                    "bd_name": {"type": "string", "description": "Name of the business developer (optional if bd_id provided — I will look it up for you)"},
                    "interview_link": {"type": "string", "description": "Meeting URL (optional)"},
                    "is_phone_call": {"type": "boolean", "description": "True if phone call", "default": False},
                    "interviewer": {"type": "string", "description": "Interviewer name (optional)"},
                },
                "required": ["company_id", "resume_profile_id", "role", "round"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "update_interview",
            "description": (
                "Edit fields on an existing interview round row. Use this for per-round changes: "
                "date, time, link, interviewer, round label, status (per-round result like 'Passed', 'No Show'), "
                "feedback, or recruiter_feedback. "
                "To change the overall pipeline outcome (rejected/closed/dropped/etc.) use update_lead_outcome instead. "
                "The interview_id is in the pipeline snapshot in the system prompt or from list_interviews."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "interview_id": {"type": "string", "description": "UUID of the interview row"},
                    "interview_date": {"type": "string", "description": "YYYY-MM-DD (optional)"},
                    "time_est": {"type": "string", "description": "HH:MM 24-hour EST (optional)"},
                    "round": {"type": "string", "description": "New round label (optional)"},
                    "status": {"type": "string", "description": "Per-round outcome text, e.g. 'Passed', 'Rejected', 'No Show', 'Rescheduled' (optional)"},
                    "interview_link": {"type": "string", "description": "Meeting URL (optional)"},
                    "interviewer": {"type": "string", "description": "Interviewer name (optional)"},
                    "is_phone_call": {"type": "boolean", "description": "Whether this is a phone call (optional)"},
                    "feedback": {"type": "string", "description": "Internal notes / your presentation feedback (optional)"},
                    "recruiter_feedback": {"type": "string", "description": "Recruiter feedback / outcome context (optional)"},
                },
                "required": ["interview_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "update_lead",
            "description": (
                "Edit fields on an existing lead (the Lead-round row and its thread). "
                "Use this to change the role title, salary range, notes, or business developer. "
                "The interview_id (of the Lead round row) is in the pipeline snapshot or from list_interviews."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "interview_id": {"type": "string", "description": "UUID of the Lead-round interview row"},
                    "role": {"type": "string", "description": "New job title (optional)"},
                    "salary_range": {"type": "string", "description": "e.g. '$120k–$140k' (optional)"},
                    "notes": {"type": "string", "description": "Thread-level notes (optional)"},
                    "bd_id": {"type": "string", "description": "UUID of the new business developer (optional if bd_name provided)"},
                    "bd_name": {"type": "string", "description": "Name of the new business developer (optional if bd_id provided)"},
                },
                "required": ["interview_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "update_lead_outcome",
            "description": (
                "Update the overall pipeline outcome for a lead thread — use this when the opportunity was "
                "rejected, closed (won), dropped, went dead, became unresponsive, or came back to active. "
                "The thread_id is in the pipeline snapshot or from list_interviews. "
                "Allowed values: active, unresponsive, dropped, dead, rejected, closed."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "thread_id": {"type": "string", "description": "UUID of the lead thread"},
                    "outcome": {
                        "type": "string",
                        "enum": ["active", "unresponsive", "dropped", "dead", "rejected", "closed"],
                    },
                },
                "required": ["thread_id", "outcome"],
            },
        },
    },
]


# ─── Analytics tools (SUPERADMIN only) ──────────────────────

_ANALYTICS_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "analyze_pipeline_funnel",
            "description": (
                "Compute the full recruitment funnel: how many leads reached each stage "
                "(Lead → Phone Screen → Technical → Onsite → Final Round → Offer), "
                "conversion rate between each stage, and overall outcome breakdown. "
                "Use this to answer questions about conversion rates, pipeline health, or stage progress."
            ),
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "analyze_candidate_performance",
            "description": (
                "Per-candidate pipeline metrics: total leads, close rate, which rounds they fail at most, "
                "active vs dead pipeline size. Optionally pass candidate_id to focus on one candidate."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "candidate_id": {
                        "type": "string",
                        "description": "UUID of the candidate (optional — omit to get all candidates)",
                    },
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "analyze_round_status",
            "description": (
                "Show how many leads are currently active at each interview round, "
                "including stale leads with no update in over 7 days. "
                "Use this to answer 'how many leads are in the second round?' or 'where is the pipeline stuck?'"
            ),
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "analyze_lead_outcomes",
            "description": (
                "Outcome distribution (closed/dead/dropped/active/unresponsive) with monthly trend data. "
                "Optionally filter by date range or a specific business developer."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "date_from": {"type": "string", "description": "Start date YYYY-MM-DD (optional)"},
                    "date_to": {"type": "string", "description": "End date YYYY-MM-DD (optional)"},
                    "bd_id": {
                        "type": "string",
                        "description": "UUID of a specific business developer (optional)",
                    },
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "analyze_bd_performance",
            "description": (
                "Per-business-developer metrics: total leads, close rate, dead rate, active pipeline size. "
                "Use this to compare BD performance or identify top/bottom performers."
            ),
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_weekly_summary",
            "description": (
                "Generate a weekly summary of leads and interviews taken by each candidate, "
                "including the status of each opportunity (Converted, Rejected, Unresponsive, or Active). "
                "Use this when the admin asks for a 'summary of interviews', 'weekly report', or similar. "
                "Pass week_type='current' for the current week (Monday to today) or 'last' for the previous "
                "Mon–Sun week. Alternatively, pass explicit date_from and date_to (YYYY-MM-DD) to cover any range."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "week_type": {
                        "type": "string",
                        "enum": ["current", "last"],
                        "description": "'current' = Mon to today, 'last' = previous Mon–Sun week.",
                    },
                    "date_from": {"type": "string", "description": "Start date YYYY-MM-DD (optional, overrides week_type)"},
                    "date_to": {"type": "string", "description": "End date YYYY-MM-DD (optional, overrides week_type)"},
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "analyze_interview_notes",
            "description": (
                "Collect interview feedback, recruiter feedback, and thread notes for pattern analysis. "
                "Analyze the returned data to find common rejection reasons, success signals, or recurring themes. "
                "Optionally filter by candidate, company, or round."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "candidate_id": {"type": "string", "description": "UUID of a candidate (optional)"},
                    "company_id": {"type": "string", "description": "UUID of a company (optional)"},
                    "round": {"type": "string", "description": "Round label filter e.g. 'Technical' (optional)"},
                    "limit": {
                        "type": "integer",
                        "description": "Max records to return (default 50)",
                        "default": 50,
                    },
                },
                "required": [],
            },
        },
    },
]


def _tools_for_role(role: UserRole) -> list[dict[str, Any]]:
    """The exact tool set a role is offered — not just enforced at execution time. A
    role that can't write never even sees a write tool in the schema, so the model can't
    propose (and the UI can't render a confirm card for) an action that would just come
    back as a permission error."""
    tools: list[dict[str, Any]] = []
    for t in _TOOLS:
        tname = t["function"]["name"]
        if tname in _READ_ONLY_TOOL_NAMES:
            tools.append(t)
        elif tname in _LEAD_WRITE_TOOL_NAMES:
            if role in _LEAD_WRITE_ROLES:
                tools.append(t)
        else:  # create_company, update_interview — plain write access only
            if role not in _WRITE_BLOCKED_ROLES:
                tools.append(t)
    if role == UserRole.SUPERADMIN:
        tools += _ANALYTICS_TOOLS
    return tools


# ─── Time helpers ────────────────────────────────────────────

_TZ_EASTERN = ZoneInfo("America/New_York")
_TZ_PKT = ZoneInfo("Asia/Karachi")


def _est_to_pkt(t: dt_time, ref_date: Optional[date] = None) -> dt_time:
    """Convert an EST/EDT wall-clock time to PKT (Asia/Karachi, UTC+5), DST-aware."""
    d = ref_date or date.today()
    dt_east = datetime.combine(d, t, tzinfo=_TZ_EASTERN)
    return dt_east.astimezone(_TZ_PKT).replace(tzinfo=None).time()


# ─── Context snapshot ────────────────────────────────────────

def _pipeline_snapshot(session: Session, user: User, own_candidate_id: Optional[uuid.UUID]) -> str:
    """Compact table of recent pipeline records injected into the system prompt. Goes
    through the same scoped `list_interviews` endpoint every read tool uses — this used to
    query `Interview` directly with only a team-member filter, which meant every other
    role's snapshot (BD, dept lead, manager, ...) was drawn from the whole org, unscoped,
    baked straight into the model's context. That's the one context-injection surface that
    matters most to get right, since it happens on every single message regardless of what
    the user asks."""
    limit = 100 if user.role == UserRole.SUPERADMIN else 30
    rows = _list_interviews_endpoint(
        candidate_id=None,
        company_id=None,
        resume_profile_id=None,
        status_filter=None,
        search=None,
        date_from=None,
        date_to=None,
        department_id=None,
        session=session,
        current_user=user,
    )[:limit]
    if not rows:
        return "=== Pipeline snapshot: no records found ==="

    lines = [
        f"=== Pipeline snapshot (most recent {len(rows)} — use these IDs directly for updates) ===",
        "interview_id | thread_id | company | role | round | status | outcome_override | date",
    ]
    for iv in rows:
        lines.append(
            f"{iv['id']} | {iv['thread_id']} | {iv.get('company_name') or '?'} | "
            f"{iv.get('role')} | {iv.get('round')} | {iv.get('status') or '—'} | "
            f"{iv.get('lead_outcome') or '—'} | {iv.get('interview_date') or '—'}"
        )
    return "\n".join(lines)


# ─── System prompt ───────────────────────────────────────────

def _system_prompt(user: User, own_candidate_id: Optional[uuid.UUID], pipeline: str) -> str:
    today = date.today().strftime("%A, %B %d, %Y")

    if user.role == UserRole.TEAM_MEMBER:
        role_ctx = (
            f"You are assisting a TEAM MEMBER. "
            f"Their fixed candidate ID is {own_candidate_id}. "
            f"Always force candidate_id to this value for create_lead / schedule_interview. "
            f"Do not ask which candidate; apply it silently."
            if own_candidate_id else
            "You are assisting a TEAM MEMBER whose account has no linked candidate record. "
            "Inform them an admin must link their account before you can create leads or interviews."
        )
    elif user.role == UserRole.BD_TEAM_LEAD:
        role_ctx = (
            "You are assisting a BD TEAM LEAD. They manage a team of business developers and oversee the pipeline. "
            "They can create companies, open leads, schedule interviews, and update existing records — scoped to "
            "their own team; the backend enforces this, so an out-of-scope action will come back as a clear error "
            "rather than succeeding. "
            "When a candidate is not specified, call list_candidates and ask which candidate the opportunity is for. "
            "When a BD is mentioned, call list_business_developers to find the exact match and always pass bd_id. "
            "If no BD is specified for a lead or interview, ask if they'd like to assign one."
        )
    elif user.role in (UserRole.BD, UserRole.DEPT_LEAD, UserRole.TECH_STACK_MANAGER):
        role_label = {
            UserRole.BD: "BUSINESS DEVELOPER",
            UserRole.DEPT_LEAD: "DEPARTMENT LEAD",
            UserRole.TECH_STACK_MANAGER: "TECH STACK MANAGER",
        }[user.role]
        role_ctx = (
            f"You are assisting a {role_label}. They can create companies, open leads, schedule interviews, "
            "and update existing records — scoped to their own department/entity; the backend enforces this "
            "exactly like the rest of the app, so an out-of-scope action will come back as a clear error rather "
            "than silently succeeding or silently failing. "
            "When a candidate is not specified, call list_candidates and ask which candidate the opportunity is "
            "for. When a BD is mentioned, call list_business_developers to find the exact match and pass bd_id."
        )
    elif user.role in (UserRole.MANAGER, UserRole.BD_MANAGER, UserRole.GUEST, UserRole.COORDINATOR):
        role_label = user.role.value.replace("-", " ").title()
        role_ctx = (
            f"You are assisting a {role_label}, who has READ-ONLY access in this assistant. You can look up and "
            "summarize companies, candidates, business developers, and the interview/lead pipeline (via "
            "list_companies, list_candidates, list_business_developers, list_interviews, list_resume_profiles) — "
            "but you have NOT been given any tool to create or edit anything; those tools simply aren't in your "
            "toolset this turn. If they ask you to create, schedule, or change something, say plainly that their "
            "role has read-only access here and suggest they ask someone with write permissions — do not imply "
            "you attempted it."
        )
    else:
        role_ctx = (
            "You are assisting a SUPERADMIN with full access.\n\n"
            "## Analyst capabilities (SUPERADMIN only)\n"
            "You have access to deep analytics tools. When the admin asks for business insights, "
            "pipeline health, or performance data, act as a senior data analyst:\n"
            "- Use analyze_pipeline_funnel to answer questions about conversion rates and stage progress\n"
            "- Use analyze_candidate_performance to evaluate individual or all-candidate pipeline metrics\n"
            "- Use analyze_round_status to answer 'how many leads are in the second/third round?' type questions\n"
            "- Use analyze_lead_outcomes for outcome distribution and monthly trends\n"
            "- Use analyze_bd_performance to compare business developer effectiveness\n"
            "- Use analyze_interview_notes to surface patterns in feedback, rejection reasons, or recruiter notes\n"
            "- Use get_weekly_summary when asked for a 'summary of interviews', 'weekly report', 'this week's activity', "
            "  or 'last week's summary'. Pass week_type='current' or 'last', or explicit date_from/date_to.\n\n"
            "## Weekly summary formatting rules\n"
            "When you receive data from get_weekly_summary, format your reply EXACTLY as follows — "
            "no prose preamble, just the summary block so it is easy to copy:\n\n"
            "```\n"
            "📊 Interview Summary — [period]\n"
            "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
            "Total leads: [N]  |  Interview rounds taken: [N]\n\n"
            "👤 [Candidate Name] ([N] lead(s))\n"
            "  • [Company] — [Role] ([Round]) → [Converted ✅ / Rejected ❌ / Unresponsive 🔕 / Active 🟡]\n"
            "  • ...\n\n"
            "(repeat per candidate)\n\n"
            "📈 Outcome Breakdown\n"
            "  ✅ Converted   : [N]\n"
            "  ❌ Rejected    : [N]\n"
            "  🔕 Unresponsive: [N]\n"
            "  🟡 Active      : [N]\n"
            "```\n\n"
            "If a candidate has no interview rounds (lead-only), show the lead row with round 'Lead'.\n"
            "Always end with the outcome breakdown block.\n\n"
            "When presenting other analytics results: lead with the direct answer in the first sentence, "
            "then a sentence or two on what the data actually shows (a real pattern, not just a restatement "
            "of the numbers), and only add a suggestion if you have a genuinely useful one — don't force it. "
            "Skip this structure entirely for a simple lookup that only needs one fact.\n\n"
            "For lead/interview operations when no candidate is specified, ask which candidate the "
            "opportunity is for, then use list_candidates to find their ID."
        )

    return f"""You are an AI recruitment assistant for the AI Interviews Portal.
You help manage the recruitment pipeline: adding companies, creating leads, scheduling interviews, and editing existing records.

Today: {today}
User: {user.full_name} ({user.email}) — Role: {user.role.value}

{role_ctx}

{pipeline}

## Response style (follow this for every reply)
Talk like a sharp, capable colleague who already knows this system — not a corporate
chatbot.
- Get to the point. No "Certainly! I'd be happy to help with that" preambles, no
  restating the user's question back to them, no "Let me know if there's anything
  else!" sign-offs. Answer, then stop.
- Default to plain sentences. Only reach for a bullet or numbered list when you're
  presenting genuinely multiple items (several candidates, leads, interview rounds,
  etc.) — never for a single fact or a short explanation. Don't invent headers or
  bold text for an ordinary reply; save formatting for when it earns its keep.
- Be direct and confident. If you already have enough to act — the pipeline snapshot,
  something said earlier, an obvious default — act, don't ask permission to look
  something up. Don't hedge ("it looks like maybe...", "this could possibly..."). If
  something is genuinely ambiguous or missing, ask ONE crisp question for it and
  nothing more.
- Match the user's energy. A one-line request gets a one-line answer. A request for a
  summary or analysis gets the length it actually needs — not padding either way.
- Never narrate your own tool calls ("I'll check the database now...", "Let me look
  that up..."). Just call the tool and reply with the result.

## Confirmation is required for every write (CRITICAL — follow exactly)
create_company, create_lead, schedule_interview, update_interview, update_lead, and
update_lead_outcome do NOT execute when you call them — they only propose the action. The
tool result will come back as {{"status": "pending_confirmation", ...}}, not real data, and
no ID it might reference is real yet. When you see that:
- Tell the user in ONE short sentence exactly what you're about to do, then STOP. Do not
  say it succeeded, do not say "done," and do not chain another tool call afterward — the
  UI is showing them a Confirm/Cancel control right now for this proposal.
- Only one proposal can be pending at a time. If a request needs several steps (e.g. a
  company must be created before you can open a lead for it), propose only the FIRST step,
  explain that the rest will follow once they confirm, and stop there.
- The actual execution and the "it's done" confirmation happen outside this conversation,
  after the user clicks Confirm — you will not see the result of a confirmed action.
- Never fabricate or assume an ID from a pending (unconfirmed) proposal. If a later step
  genuinely needs the real ID a pending action would produce, wait for a future turn.

## Company lookup rules
1. Call list_companies and look for a company whose name matches what the user specified (case-insensitive).
2. If a match is found, use its ID — proceed.
3. If NO match is found, do NOT use any other company from the list. Propose create_company
   with the user's exact company name and stop (see the confirmation rule above) — you
   cannot create the lead/interview in the same turn since the company doesn't exist yet.
4. NEVER substitute a different company because it looks similar. The company name the user gives is the one to use.

## Profile / candidate / BD lookup rules
- Call list_resume_profiles to match the profile name. Use the exact match.
- Call list_candidates for candidates. For team members the candidate is fixed — do not ask.
- If the user mentions a BD (business developer / recruiter) name, call list_business_developers to find the exact match and always pass bd_id to create_lead and schedule_interview. Never omit bd_id when a BD name was given.

## General rules
- The pipeline snapshot above has IDs for existing records — use them directly for updates.
- Call list_interviews only for older records not in the snapshot.
- Never guess a UUID.
- Ask for one missing required field at a time.
- Dates: YYYY-MM-DD. Times: HH:MM (24-hour) EST.
- Round labels: Lead · Phone Screen · Technical · Onsite · Final Round · Offer

## Editing rules
- Change interview date/time/link/interviewer/round/per-round status → update_interview
- Change lead role/salary/notes/BD → update_lead
- Mark a whole opportunity as rejected/closed/dropped/dead/unresponsive/active → update_lead_outcome"""


# ─── Tool execution ──────────────────────────────────────────

def _exec_tool(
    name: str,
    args: dict[str, Any],
    session: Session,
    user: User,
    own_candidate_id: Optional[uuid.UUID],
    background_tasks: BackgroundTasks,
    confirm: bool = False,
) -> tuple[Any, Optional[ChatAction]]:
    """Run a tool and return (result_for_openai, action_or_None).

    `confirm` gates every entry in `_MUTATING_TOOLS`: the caller loop in `chat_message`
    never lets a mutating tool reach this function with `confirm=False` (it intercepts
    those calls itself and records a pending action instead) — the guard below is a
    second line of defense, not the primary gate. Only `POST /chat/confirm`, after
    verifying the pending action belongs to the requesting user, calls this with
    `confirm=True` to actually perform the write.
    """
    if name in _MUTATING_TOOLS and not confirm:
        return {
            "status": "pending_confirmation",
            "note": "Not executed — this requires the user's explicit confirmation in the UI.",
        }, None

    if name == "list_companies":
        # Companies have no scoping anywhere in the real API — every authenticated role
        # sees every company (see _list_companies_endpoint itself).
        rows = _list_companies_endpoint(session)
        return [{"id": str(r.id), "name": r.name, "is_staffing_firm": r.is_staffing_firm} for r in rows], None

    if name == "list_resume_profiles":
        from app.dept_scope import apply_dept_filter
        query = apply_dept_filter(select(ResumeProfile).order_by(ResumeProfile.name), ResumeProfile, user)
        rows = session.exec(query).all()
        return [{"id": str(r.id), "name": r.name} for r in rows], None

    if name == "list_candidates":
        rows = _list_candidates_endpoint(
            department_id=None, is_active=None, session=session, settings=get_settings(), current_user=user
        )
        return [{"id": str(r.id), "name": r.name} for r in rows], None

    if name == "list_business_developers":
        # department_id must be passed explicitly — calling a FastAPI route function
        # directly (bypassing request handling) leaves a Query(...)-defaulted param set to
        # the raw Query marker object, not None, which silently breaks the department
        # filter added in list_business_developers (a truthy non-string never matches any
        # real department id, so every dept-scoped BD gets filtered out).
        rows = _list_business_developers_endpoint(department_id=None, session=session, current_user=user)
        return [{"id": str(r.id), "name": r.name} for r in rows], None

    if name == "list_interviews":
        # The real endpoint's own `search` param already covers company/role/status/notes
        # text search — reuse it instead of re-filtering by hand, so scoping (team-member
        # own-candidate, BD/BD-team-lead entity scope, department scope for everyone else)
        # comes for free from the same code the Interviews page itself calls.
        search = (args.get("company_name") or args.get("role") or args.get("round") or "").strip() or None
        limit = min(int(args.get("limit", 20)), 50)
        rows = _list_interviews_endpoint(
            candidate_id=None,
            company_id=None,
            resume_profile_id=None,
            status_filter=None,
            search=search,
            date_from=None,
            date_to=None,
            department_id=None,
            session=session,
            current_user=user,
        )
        results = []
        for iv in rows[:limit]:
            created_at = iv.get("created_at")
            results.append({
                "interview_id": str(iv["id"]),
                "thread_id": str(iv["thread_id"]),
                "company": iv.get("company_name"),
                "role": iv.get("role"),
                "round": iv.get("round"),
                "status": iv.get("status"),
                "outcome_override": iv.get("lead_outcome"),
                "interview_date": str(iv["interview_date"]) if iv.get("interview_date") else None,
                "created_at": created_at.date().isoformat() if created_at else None,
            })
        return results, None

    if name == "create_company":
        existing = session.exec(select(Company).where(Company.name == args["name"])).first()
        if existing:
            return {"error": f"Company '{args['name']}' already exists (id: {existing.id})."}, None
        try:
            company = _create_company_endpoint(
                CompanyCreate(name=args["name"], is_staffing_firm=args.get("is_staffing_firm", False)),
                session,
                user,
            )
        except HTTPException as e:
            return {"error": e.detail}, None
        action = ChatAction(type="company_created", description=f"Company '{company.name}' created", id=str(company.id))
        return {"id": str(company.id), "name": company.name}, action

    if name == "create_lead":
        if user.role not in _LEAD_WRITE_ROLES:
            return {"error": "Your role doesn't have permission to create leads."}, None
        candidate_id_raw = own_candidate_id if user.role == UserRole.TEAM_MEMBER else args.get("candidate_id")
        try:
            company_id = uuid.UUID(args["company_id"])
            resume_profile_id = uuid.UUID(args["resume_profile_id"])
            candidate_id = uuid.UUID(str(candidate_id_raw)) if candidate_id_raw else None
        except ValueError as e:
            return {"error": f"Invalid UUID: {e}"}, None

        bd_id, bd_err = _resolve_bd_id(args, session)
        if bd_err:
            return {"error": bd_err}, None

        arrived_on = None
        if args.get("arrived_on"):
            try:
                arrived_on = date.fromisoformat(args["arrived_on"])
            except ValueError:
                pass

        payload = InterviewCreate(
            company_id=company_id,
            resume_profile_id=resume_profile_id,
            candidate_id=candidate_id,
            role=args["role"].strip(),
            salary_range=(args.get("salary_range") or "").strip() or None,
            bd_id=bd_id,
            round="1st",
            status="Upcoming",
            interview_date=arrived_on,
        )
        try:
            data = _create_interview_endpoint(payload, background_tasks, session, user)
        except HTTPException as e:
            return {"error": e.detail}, None

        # Thread-level notes aren't part of InterviewCreate — set them through the same
        # scoped lead-thread endpoint the Leads page uses. Best-effort: the lead itself
        # already exists at this point even if this secondary step fails.
        notes = (args.get("notes") or "").strip()
        if notes:
            try:
                _patch_lead_thread_endpoint(uuid.UUID(str(data["thread_id"])), LeadThreadUpdate(notes=notes), session, user)
            except HTTPException:
                pass

        desc = f"Lead created — {data.get('company_name')} · {args['role'].strip()}"
        action = ChatAction(type="lead_created", description=desc, id=str(data["thread_id"]))
        return {
            "thread_id": str(data["thread_id"]),
            "interview_id": str(data["id"]),
            "company": data.get("company_name"),
            "role": args["role"],
        }, action

    if name == "schedule_interview":
        # schedule_interview always opens a brand-new pipeline (no parent_interview_id
        # support today) — same lead-write gate as create_lead, not just plain write access.
        if user.role not in _LEAD_WRITE_ROLES:
            return {"error": "Your role doesn't have permission to open a new pipeline."}, None
        candidate_id_raw = own_candidate_id if user.role == UserRole.TEAM_MEMBER else args.get("candidate_id")
        try:
            company_id = uuid.UUID(args["company_id"])
            resume_profile_id = uuid.UUID(args["resume_profile_id"])
            candidate_id = uuid.UUID(str(candidate_id_raw)) if candidate_id_raw else None
        except ValueError as e:
            return {"error": f"Invalid UUID: {e}"}, None

        bd_id, bd_err = _resolve_bd_id(args, session)
        if bd_err:
            return {"error": bd_err}, None

        interview_date = None
        if args.get("interview_date"):
            try:
                interview_date = date.fromisoformat(args["interview_date"])
            except ValueError:
                pass

        time_est = None
        time_pkt = None
        if args.get("time_est"):
            try:
                parts = args["time_est"].split(":")
                time_est = dt_time(int(parts[0]), int(parts[1]))
                time_pkt = _est_to_pkt(time_est, interview_date)
            except (ValueError, IndexError):
                pass

        payload = InterviewCreate(
            company_id=company_id,
            resume_profile_id=resume_profile_id,
            candidate_id=candidate_id,
            role=args["role"].strip(),
            round=args["round"].strip(),
            interview_date=interview_date,
            time_est=time_est,
            time_pkt=time_pkt,
            bd_id=bd_id,
            interview_link=args.get("interview_link"),
            is_phone_call=args.get("is_phone_call", False),
            interviewer=args.get("interviewer"),
        )
        try:
            data = _create_interview_endpoint(payload, background_tasks, session, user)
        except HTTPException as e:
            return {"error": e.detail}, None

        date_str = f" on {interview_date}" if interview_date else ""
        time_str = f" at {args['time_est']} EST" if args.get("time_est") else ""
        desc = f"Interview scheduled — {data.get('company_name')} · {args['role']} · {args['round']}{date_str}{time_str}"
        action = ChatAction(type="interview_scheduled", description=desc, id=str(data["id"]))
        return {
            "interview_id": str(data["id"]),
            "thread_id": str(data["thread_id"]),
            "company": data.get("company_name"),
            "round": args["round"],
        }, action

    if name == "update_interview":
        try:
            iid = uuid.UUID(args["interview_id"])
        except ValueError as e:
            return {"error": f"Invalid UUID: {e}"}, None

        update_kwargs: dict[str, Any] = {}
        if args.get("interview_date"):
            try:
                update_kwargs["interview_date"] = date.fromisoformat(args["interview_date"])
            except ValueError:
                return {"error": "Invalid date format — use YYYY-MM-DD"}, None
        if args.get("time_est"):
            try:
                parts = args["time_est"].split(":")
                update_kwargs["time_est"] = dt_time(int(parts[0]), int(parts[1]))
            except (ValueError, IndexError):
                return {"error": "Invalid time format — use HH:MM"}, None
            # Mirror the edit form: always send time_pkt alongside time_est, derived from
            # the interview's date (the new one if it's also changing this call).
            ref_date = update_kwargs.get("interview_date")
            if ref_date is None:
                existing_iv = session.get(Interview, iid)
                ref_date = existing_iv.interview_date if existing_iv else None
            update_kwargs["time_pkt"] = _est_to_pkt(update_kwargs["time_est"], ref_date)
        if args.get("round"):
            update_kwargs["round"] = args["round"].strip()
        if args.get("status"):
            update_kwargs["status"] = args["status"].strip()
        if args.get("interview_link"):
            update_kwargs["interview_link"] = args["interview_link"].strip()
        if args.get("interviewer"):
            update_kwargs["interviewer"] = args["interviewer"].strip()
        if "is_phone_call" in args:
            update_kwargs["is_phone_call"] = bool(args["is_phone_call"])
        if args.get("feedback"):
            update_kwargs["feedback"] = args["feedback"].strip()
        if args.get("recruiter_feedback"):
            update_kwargs["recruiter_feedback"] = args["recruiter_feedback"].strip()

        if not update_kwargs:
            return {"error": "No fields provided to update"}, None

        try:
            data = _update_interview_endpoint(iid, InterviewUpdate(**update_kwargs), background_tasks, session, user)
        except HTTPException as e:
            return {"error": e.detail}, None

        desc = f"Interview updated — {', '.join(update_kwargs.keys())}"
        action = ChatAction(type="interview_updated", description=desc, id=str(data["id"]))
        return {"interview_id": str(data["id"]), "updated": list(update_kwargs.keys())}, action

    if name == "update_lead":
        if user.role not in _LEAD_WRITE_ROLES:
            return {"error": "Your role doesn't have permission to edit leads."}, None
        try:
            iid = uuid.UUID(args["interview_id"])
        except ValueError as e:
            return {"error": f"Invalid UUID: {e}"}, None
        # Read-only lookup, just to get the thread_id for the notes call below — the
        # actual writes below each go through their own scoped endpoint.
        interview_row = session.get(Interview, iid)
        if not interview_row:
            return {"error": "Interview (lead row) not found"}, None

        changed: list[str] = []
        update_kwargs: dict[str, Any] = {}
        if args.get("role"):
            update_kwargs["role"] = args["role"].strip()
            changed.append("role")
        if args.get("salary_range"):
            update_kwargs["salary_range"] = args["salary_range"].strip()
            changed.append("salary_range")

        bd_id, bd_err = _resolve_bd_id(args, session)
        if bd_err:
            return {"error": bd_err}, None
        if bd_id:
            update_kwargs["bd_id"] = bd_id
            changed.append("bd_id")

        if update_kwargs:
            try:
                _update_interview_endpoint(iid, InterviewUpdate(**update_kwargs), background_tasks, session, user)
            except HTTPException as e:
                return {"error": e.detail}, None

        if args.get("notes"):
            try:
                _patch_lead_thread_endpoint(
                    interview_row.thread_id, LeadThreadUpdate(notes=args["notes"].strip()), session, user
                )
            except HTTPException as e:
                return {"error": e.detail}, None
            changed.append("notes")

        if not changed:
            return {"error": "No fields provided to update"}, None

        desc = f"Lead updated — {', '.join(changed)}"
        action = ChatAction(type="lead_updated", description=desc, id=str(interview_row.thread_id))
        return {"interview_id": str(iid), "thread_id": str(interview_row.thread_id), "updated": changed}, action

    if name == "update_lead_outcome":
        outcome = args["outcome"].strip().lower()
        if outcome not in ALLOWED_LEAD_OUTCOMES:
            return {"error": f"Invalid outcome. Allowed: {', '.join(sorted(ALLOWED_LEAD_OUTCOMES))}"}, None  # noqa: E501
        try:
            thread_id = uuid.UUID(args["thread_id"])
        except ValueError as e:
            return {"error": f"Invalid UUID: {e}"}, None
        try:
            _patch_lead_thread_endpoint(thread_id, LeadThreadUpdate(outcome_override=outcome), session, user)
        except HTTPException as e:
            return {"error": e.detail}, None
        action = ChatAction(
            type="lead_outcome_updated",
            description=f"Lead outcome → '{outcome}'",
            id=str(thread_id),
        )
        return {"thread_id": str(thread_id), "outcome": outcome}, action

    if name == "analyze_pipeline_funnel":
        return analytics_helpers.get_pipeline_funnel(session), None

    if name == "analyze_candidate_performance":
        return analytics_helpers.get_candidate_performance(session, args.get("candidate_id")), None

    if name == "analyze_round_status":
        return analytics_helpers.get_round_status_snapshot(session), None

    if name == "analyze_lead_outcomes":
        return analytics_helpers.get_lead_outcome_stats(
            session,
            date_from=args.get("date_from"),
            date_to=args.get("date_to"),
            bd_id=args.get("bd_id"),
        ), None

    if name == "analyze_bd_performance":
        return analytics_helpers.get_bd_performance(session), None

    if name == "analyze_interview_notes":
        return analytics_helpers.get_interview_notes(
            session,
            candidate_id=args.get("candidate_id"),
            company_id=args.get("company_id"),
            round_filter=args.get("round"),
            limit=min(int(args.get("limit", 50)), 100),
        ), None

    if name == "get_weekly_summary":
        today = date.today()
        # Resolve date range
        if args.get("date_from") and args.get("date_to"):
            try:
                df = date.fromisoformat(args["date_from"])
                dt = date.fromisoformat(args["date_to"])
            except ValueError as e:
                return {"error": f"Invalid date format: {e}"}, None
        elif args.get("week_type", "current") == "last":
            # Previous Mon–Sun
            days_since_monday = today.weekday()  # Mon=0
            last_monday = today - timedelta(days=days_since_monday + 7)
            df = last_monday
            dt = last_monday + timedelta(days=6)
        else:
            # Current week: Mon to today
            df = today - timedelta(days=today.weekday())
            dt = today

        data = analytics_helpers.get_weekly_interview_summary(session, df, dt)
        action = ChatAction(
            type="summary_generated",
            description=f"Weekly summary: {df.isoformat()} → {dt.isoformat()}",
        )
        return data, action

    return {"error": f"Unknown tool: {name}"}, None


# ─── Endpoint ────────────────────────────────────────────────

@router.post("/message", response_model=ChatResponse)
def chat_message(
    body: ChatRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    # Every role can use Jarvis — what it's actually offered (read tools vs. write tools,
    # and which write tools) is scoped per role by `_tools_for_role` below, mirroring the
    # real REST gates exactly. Access itself (can they open Jarvis at all) is a separate,
    # subscription-based gate: superadmin always; everyone else needs an active trial or
    # subscription granted from User Management (see _assert_jarvis_access).
    _assert_jarvis_access(current_user)
    settings = get_settings()
    if not settings.OPENAI_API_KEY:
        raise HTTPException(status_code=500, detail="OpenAI API key is not configured.")

    from openai import OpenAI
    client = OpenAI(api_key=settings.OPENAI_API_KEY)

    own_candidate_id = None
    if current_user.role == UserRole.TEAM_MEMBER:
        own_candidate_id = candidate_id_for_team_member(session, current_user)

    pipeline = _pipeline_snapshot(session, current_user, own_candidate_id)
    system = _system_prompt(current_user, own_candidate_id, pipeline)

    messages: list[dict] = [{"role": "system", "content": system}]
    for m in body.messages:
        messages.append({"role": m.role, "content": m.content})
    messages.append({"role": "user", "content": body.message})

    tools = _tools_for_role(current_user.role)

    actions: list[ChatAction] = []
    pending_out: Optional[PendingActionOut] = None
    max_iterations = 10

    for _ in range(max_iterations):
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=messages,
            tools=tools,
            tool_choice="auto",
        )
        msg = response.choices[0].message

        if not msg.tool_calls:
            return ChatResponse(reply=msg.content or "", actions=actions, pending_action=pending_out)

        messages.append({
            "role": "assistant",
            "content": msg.content,
            "tool_calls": [
                {
                    "id": tc.id,
                    "type": "function",
                    "function": {"name": tc.function.name, "arguments": tc.function.arguments},
                }
                for tc in msg.tool_calls
            ],
        })

        for tc in msg.tool_calls:
            try:
                tool_args = json.loads(tc.function.arguments)
            except json.JSONDecodeError:
                tool_args = {}

            if tc.function.name in _MUTATING_TOOLS:
                # Propose, never execute here — the model only decided *what* to do; a
                # human still has to say "yes, do it" before anything is written.
                if pending_out is not None:
                    tool_result: Any = {
                        "error": (
                            "Another action is already awaiting the user's confirmation. "
                            "Wait for them to confirm or cancel it before proposing anything else."
                        ),
                    }
                else:
                    _prune_pending_actions()
                    action_id = str(uuid.uuid4())
                    _pending_actions[action_id] = {
                        "name": tc.function.name,
                        "args": tool_args,
                        "user_id": current_user.id,
                        "created_at": datetime.utcnow(),
                    }
                    pending_out = PendingActionOut(
                        id=action_id,
                        action_type=tc.function.name,
                        summary=_summarize_pending(tc.function.name, tool_args),
                        details=_build_pending_details(tc.function.name, tool_args, session),
                    )
                    tool_result = {
                        "status": "pending_confirmation",
                        "note": (
                            "Not executed — awaiting the user's explicit confirmation via the UI. "
                            "Tell them in one sentence what you're about to do, then stop. "
                            "Do not say it succeeded."
                        ),
                    }
            else:
                tool_result, action = _exec_tool(
                    tc.function.name, tool_args, session, current_user, own_candidate_id, background_tasks
                )
                if action:
                    actions.append(action)

            messages.append({
                "role": "tool",
                "tool_call_id": tc.id,
                "content": json.dumps(tool_result),
            })

    return ChatResponse(
        reply="I ran into an issue completing your request. Please try again.",
        actions=actions,
        pending_action=pending_out,
    )


@router.post("/confirm", response_model=ChatResponse)
def confirm_action(
    body: ConfirmActionRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Actually perform a previously-proposed write. This is the only path that ever
    calls `_exec_tool(..., confirm=True)` for a mutating tool."""
    _assert_jarvis_access(current_user)
    _prune_pending_actions()
    pending = _pending_actions.pop(body.action_id, None)
    if not pending:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="This action has expired or was already handled — please ask again.",
        )
    if pending["user_id"] != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This action does not belong to you.")

    own_candidate_id = None
    if current_user.role == UserRole.TEAM_MEMBER:
        own_candidate_id = candidate_id_for_team_member(session, current_user)

    result, action = _exec_tool(
        pending["name"], pending["args"], session, current_user, own_candidate_id, background_tasks, confirm=True
    )
    if isinstance(result, dict) and result.get("error"):
        return ChatResponse(reply=f"I couldn't complete that: {result['error']}", actions=[])
    return ChatResponse(reply=action.description if action else "Done.", actions=[action] if action else [])


@router.post("/cancel", status_code=status.HTTP_204_NO_CONTENT)
def cancel_action(
    body: ConfirmActionRequest,
    current_user: User = Depends(get_current_user),
) -> None:
    pending = _pending_actions.get(body.action_id)
    if pending and pending["user_id"] == current_user.id:
        _pending_actions.pop(body.action_id, None)
