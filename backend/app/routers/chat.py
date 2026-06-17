"""Agentic chat assistant — creates companies, leads, and interviews via OpenAI function calling."""

from __future__ import annotations

import json
import uuid
from datetime import datetime, date, time as dt_time, timedelta
from typing import Any, Optional
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import selectinload
from sqlmodel import Session, select

from app import analytics_helpers
from app.config import get_settings
from app.database import get_session
from app.deps import get_current_user
from app.models.business_developer import BusinessDeveloper
from app.models.candidate import Candidate
from app.models.company import Company
from app.models.interview import Interview
from app.models.lead_thread import LeadThread
from app.models.resume_profile import ResumeProfile
from app.models.user import User, UserRole
from app.lead_thread_utils import ensure_lead_thread, ALLOWED_LEAD_OUTCOMES
from app.team_member_scope import candidate_id_for_team_member
from app.email_ses import try_send_interview_created_email, make_presigned_doc_url

router = APIRouter(prefix="/api/v1/chat", tags=["Chat"])


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


class ChatResponse(BaseModel):
    reply: str
    actions: list[ChatAction] = []


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
    """Return a compact table of recent pipeline records to inject into the system prompt."""
    limit = 100 if user.role == UserRole.SUPERADMIN else 30
    stmt = (
        select(Interview)
        .options(selectinload(Interview.company))
        .order_by(Interview.created_at.desc())
        .limit(limit)
    )
    if user.role == UserRole.TEAM_MEMBER and own_candidate_id:
        stmt = stmt.where(Interview.candidate_id == own_candidate_id)

    rows = session.exec(stmt).all()
    if not rows:
        return "=== Pipeline snapshot: no records found ==="

    lines = [
        f"=== Pipeline snapshot (most recent {limit} — use these IDs directly for updates) ===",
        "interview_id | thread_id | company | role | round | status | outcome_override | date",
    ]
    for iv in rows:
        lt = session.get(LeadThread, iv.thread_id)
        outcome = lt.outcome_override if lt else None
        lines.append(
            f"{iv.id} | {iv.thread_id} | {iv.company.name if iv.company else '?'} | "
            f"{iv.role} | {iv.round} | {iv.status or '—'} | {outcome or '—'} | "
            f"{iv.interview_date or '—'}"
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
            "They can create companies, open leads, schedule interviews, and update existing records. "
            "When a candidate is not specified, call list_candidates and ask which candidate the opportunity is for. "
            "When a BD is mentioned, call list_business_developers to find the exact match and always pass bd_id. "
            "If no BD is specified for a lead or interview, ask if they'd like to assign one."
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
            "When presenting other analytics results, structure your response as:\n"
            "1. **Key numbers** — the direct answer to the question\n"
            "2. **Pattern** — what the data reveals (e.g. 'most losses happen at the Technical round')\n"
            "3. **Suggestion** — one or two actionable recommendations\n\n"
            "For lead/interview operations when no candidate is specified, ask which candidate the "
            "opportunity is for, then use list_candidates to find their ID."
        )

    return f"""You are an AI recruitment assistant for the AI Interviews Portal.
You help manage the recruitment pipeline: adding companies, creating leads, scheduling interviews, and editing existing records.

Today: {today}
User: {user.full_name} ({user.email}) — Role: {user.role.value}

{role_ctx}

{pipeline}

## Company lookup rules (CRITICAL — follow exactly)
1. Call list_companies and look for a company whose name matches what the user specified (case-insensitive).
2. If a match is found, use its ID — proceed.
3. If NO match is found, do NOT use any other company from the list. Instead:
   a. Call create_company with the user's exact company name.
   b. Inform the user in your reply: "I didn't find '[name]' in the database, so I created it."
   c. Then continue creating the lead/interview using the newly created company's ID.
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
- Be transparent: state every action you take in your reply (company created, lead created, interview scheduled, field updated, etc.).
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
) -> tuple[Any, Optional[ChatAction]]:
    """Run a tool and return (result_for_openai, action_or_None)."""

    if name == "list_companies":
        rows = session.exec(select(Company).order_by(Company.name)).all()
        return [{"id": str(r.id), "name": r.name, "is_staffing_firm": r.is_staffing_firm} for r in rows], None

    if name == "list_resume_profiles":
        from app.dept_scope import apply_dept_filter
        query = apply_dept_filter(select(ResumeProfile).order_by(ResumeProfile.name), ResumeProfile, user)
        rows = session.exec(query).all()
        return [{"id": str(r.id), "name": r.name} for r in rows], None

    if name == "list_candidates":
        if user.role == UserRole.TEAM_MEMBER:
            if own_candidate_id is None:
                return [], None
            c = session.get(Candidate, own_candidate_id)
            return [{"id": str(c.id), "name": c.name}] if c else [], None
        rows = session.exec(select(Candidate).order_by(Candidate.name)).all()
        return [{"id": str(r.id), "name": r.name} for r in rows], None

    if name == "list_business_developers":
        rows = session.exec(select(BusinessDeveloper).order_by(BusinessDeveloper.name)).all()
        return [{"id": str(r.id), "name": r.name} for r in rows], None

    if name == "list_interviews":
        company_filter = args.get("company_name", "").strip().lower()
        role_filter = args.get("role", "").strip().lower()
        round_filter = args.get("round", "").strip().lower()
        limit = min(int(args.get("limit", 20)), 50)

        stmt = (
            select(Interview)
            .options(selectinload(Interview.company))
            .order_by(Interview.created_at.desc())
        )
        if user.role == UserRole.TEAM_MEMBER and own_candidate_id:
            stmt = stmt.where(Interview.candidate_id == own_candidate_id)

        results = []
        for iv in session.exec(stmt).all():
            company_name = iv.company.name if iv.company else ""
            if company_filter and company_filter not in company_name.lower():
                continue
            if role_filter and role_filter not in iv.role.lower():
                continue
            if round_filter and round_filter not in iv.round.lower():
                continue
            lt = session.get(LeadThread, iv.thread_id)
            results.append({
                "interview_id": str(iv.id),
                "thread_id": str(iv.thread_id),
                "company": company_name,
                "role": iv.role,
                "round": iv.round,
                "status": iv.status,
                "outcome_override": lt.outcome_override if lt else None,
                "interview_date": str(iv.interview_date) if iv.interview_date else None,
                "created_at": iv.created_at.date().isoformat(),
            })
            if len(results) >= limit:
                break
        return results, None

    if name == "create_company":
        existing = session.exec(select(Company).where(Company.name == args["name"])).first()
        if existing:
            return {"error": f"Company '{args['name']}' already exists (id: {existing.id})."}, None
        company = Company(
            name=args["name"],
            is_staffing_firm=args.get("is_staffing_firm", False),
            detail=args.get("detail"),
        )
        session.add(company)
        session.commit()
        session.refresh(company)
        action = ChatAction(type="company_created", description=f"Company '{company.name}' created", id=str(company.id))
        return {"id": str(company.id), "name": company.name}, action

    if name == "create_lead":
        candidate_id_raw = own_candidate_id if user.role == UserRole.TEAM_MEMBER else args.get("candidate_id")
        try:
            company_id = uuid.UUID(args["company_id"])
            resume_profile_id = uuid.UUID(args["resume_profile_id"])
            candidate_id = uuid.UUID(str(candidate_id_raw)) if candidate_id_raw else None
            bd_id = uuid.UUID(args["bd_id"]) if args.get("bd_id") else None
        except ValueError as e:
            return {"error": f"Invalid UUID: {e}"}, None

        if not bd_id and args.get("bd_name"):
            bd_row = session.exec(
                select(BusinessDeveloper).where(BusinessDeveloper.name.ilike(f"%{args['bd_name']}%"))
            ).first()
            if bd_row:
                bd_id = bd_row.id

        if not session.get(Company, company_id):
            return {"error": "Company not found"}, None
        if not session.get(ResumeProfile, resume_profile_id):
            return {"error": "Resume profile not found"}, None
        if candidate_id and not session.get(Candidate, candidate_id):
            return {"error": "Candidate not found"}, None
        if bd_id and not session.get(BusinessDeveloper, bd_id):
            return {"error": "Business developer not found"}, None

        arrived_on = None
        if args.get("arrived_on"):
            try:
                arrived_on = date.fromisoformat(args["arrived_on"])
            except ValueError:
                pass

        thread_id = uuid.uuid4()
        lt = ensure_lead_thread(session, thread_id)
        if candidate_id:
            lt.entertaining_candidate_id = candidate_id
        notes = (args.get("notes") or "").strip() or None
        if notes:
            lt.notes = notes
        if arrived_on:
            lt.arrived_on = arrived_on
        lt.updated_at = datetime.utcnow()
        session.add(lt)

        dept_id = user.department_id
        if candidate_id:
            cand = session.get(Candidate, candidate_id)
            if cand and cand.department_id:
                dept_id = cand.department_id

        interview = Interview(
            thread_id=thread_id,
            company_id=company_id,
            resume_profile_id=resume_profile_id,
            candidate_id=candidate_id,
            role=args["role"].strip(),
            salary_range=(args.get("salary_range") or "").strip() or None,
            bd_id=bd_id,
            round="1st",
            status="Upcoming",
            interview_date=arrived_on,
            department_id=dept_id,
            created_by_user_id=user.id,
        )
        session.add(interview)
        session.commit()
        session.refresh(interview)


        company = session.get(Company, company_id)
        desc = f"Lead created — {company.name} · {args['role'].strip()}"
        action = ChatAction(type="lead_created", description=desc, id=str(thread_id))
        return {"thread_id": str(thread_id), "interview_id": str(interview.id), "company": company.name, "role": args["role"]}, action

    if name == "schedule_interview":
        candidate_id_raw = own_candidate_id if user.role == UserRole.TEAM_MEMBER else args.get("candidate_id")
        try:
            company_id = uuid.UUID(args["company_id"])
            resume_profile_id = uuid.UUID(args["resume_profile_id"])
            candidate_id = uuid.UUID(str(candidate_id_raw)) if candidate_id_raw else None
            bd_id = uuid.UUID(args["bd_id"]) if args.get("bd_id") else None
        except ValueError as e:
            return {"error": f"Invalid UUID: {e}"}, None

        if not bd_id and args.get("bd_name"):
            bd_row = session.exec(
                select(BusinessDeveloper).where(BusinessDeveloper.name.ilike(f"%{args['bd_name']}%"))
            ).first()
            if bd_row:
                bd_id = bd_row.id

        if not session.get(Company, company_id):
            return {"error": "Company not found"}, None
        if not session.get(ResumeProfile, resume_profile_id):
            return {"error": "Resume profile not found"}, None
        if candidate_id and not session.get(Candidate, candidate_id):
            return {"error": "Candidate not found"}, None

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

        dept_id = user.department_id
        if candidate_id:
            cand = session.get(Candidate, candidate_id)
            if cand and cand.department_id:
                dept_id = cand.department_id

        interview = Interview(
            thread_id=uuid.uuid4(),
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
            department_id=dept_id,
            created_by_user_id=user.id,
        )
        session.add(interview)
        session.commit()

        company = session.get(Company, company_id)
        date_str = f" on {interview_date}" if interview_date else ""
        time_str = f" at {args['time_est']} EST" if args.get("time_est") else ""
        desc = f"Interview scheduled — {company.name} · {args['role']} · {args['round']}{date_str}{time_str}"
        action = ChatAction(type="interview_scheduled", description=desc, id=str(interview.id))
        return {"interview_id": str(interview.id), "thread_id": str(interview.thread_id), "company": company.name, "round": args["round"]}, action

    if name == "update_interview":
        try:
            iid = uuid.UUID(args["interview_id"])
        except ValueError as e:
            return {"error": f"Invalid UUID: {e}"}, None
        iv = session.get(Interview, iid)
        if not iv:
            return {"error": "Interview not found"}, None

        changed = []
        if "interview_date" in args and args["interview_date"]:
            try:
                iv.interview_date = date.fromisoformat(args["interview_date"])
                changed.append("date")
                # Recompute PKT for the new date if a time is already set
                if iv.time_est:
                    iv.time_pkt = _est_to_pkt(iv.time_est, iv.interview_date)
            except ValueError:
                return {"error": "Invalid date format — use YYYY-MM-DD"}, None
        if "time_est" in args and args["time_est"]:
            try:
                parts = args["time_est"].split(":")
                iv.time_est = dt_time(int(parts[0]), int(parts[1]))
                iv.time_pkt = _est_to_pkt(iv.time_est, iv.interview_date)
                changed.append("time")
            except (ValueError, IndexError):
                return {"error": "Invalid time format — use HH:MM"}, None
        if "round" in args and args["round"]:
            iv.round = args["round"].strip()
            changed.append("round")
        if "status" in args and args["status"]:
            iv.status = args["status"].strip()
            changed.append("status")
        if "interview_link" in args and args["interview_link"]:
            iv.interview_link = args["interview_link"].strip()
            changed.append("link")
        if "interviewer" in args and args["interviewer"]:
            iv.interviewer = args["interviewer"].strip()
            changed.append("interviewer")
        if "is_phone_call" in args:
            iv.is_phone_call = bool(args["is_phone_call"])
            changed.append("is_phone_call")
        if "feedback" in args and args["feedback"]:
            iv.feedback = args["feedback"].strip()
            changed.append("feedback")
        if "recruiter_feedback" in args and args["recruiter_feedback"]:
            iv.recruiter_feedback = args["recruiter_feedback"].strip()
            changed.append("recruiter_feedback")

        if not changed:
            return {"error": "No fields provided to update"}, None

        iv.updated_at = datetime.utcnow()
        session.add(iv)
        session.commit()

        desc = f"Interview updated — {', '.join(changed)}"
        action = ChatAction(type="interview_updated", description=desc, id=str(iv.id))
        return {"interview_id": str(iv.id), "updated": changed}, action

    if name == "update_lead":
        try:
            iid = uuid.UUID(args["interview_id"])
        except ValueError as e:
            return {"error": f"Invalid UUID: {e}"}, None
        iv = session.get(Interview, iid)
        if not iv:
            return {"error": "Interview (lead row) not found"}, None

        changed = []
        if "role" in args and args["role"]:
            iv.role = args["role"].strip()
            changed.append("role")
        if "salary_range" in args and args["salary_range"]:
            iv.salary_range = args["salary_range"].strip()
            changed.append("salary_range")
        if "bd_id" in args and args["bd_id"]:
            try:
                bd_id = uuid.UUID(args["bd_id"])
            except ValueError as e:
                return {"error": f"Invalid BD UUID: {e}"}, None
            if not session.get(BusinessDeveloper, bd_id):
                return {"error": "Business developer not found"}, None
            iv.bd_id = bd_id
            changed.append("bd_id")
        elif "bd_name" in args and args["bd_name"]:
            bd_row = session.exec(
                select(BusinessDeveloper).where(BusinessDeveloper.name.ilike(f"%{args['bd_name']}%"))
            ).first()
            if bd_row:
                iv.bd_id = bd_row.id
                changed.append("bd_id")
            else:
                return {"error": f"Business developer '{args['bd_name']}' not found"}, None

        if "notes" in args and args["notes"]:
            lt = ensure_lead_thread(session, iv.thread_id)
            lt.notes = args["notes"].strip()
            lt.updated_at = datetime.utcnow()
            session.add(lt)
            changed.append("notes")

        if not changed:
            return {"error": "No fields provided to update"}, None

        iv.updated_at = datetime.utcnow()
        session.add(iv)
        session.commit()

        desc = f"Lead updated — {', '.join(changed)}"
        action = ChatAction(type="lead_updated", description=desc, id=str(iv.thread_id))
        return {"interview_id": str(iv.id), "thread_id": str(iv.thread_id), "updated": changed}, action

    if name == "update_lead_outcome":
        outcome = args["outcome"].strip().lower()
        if outcome not in ALLOWED_LEAD_OUTCOMES:
            return {"error": f"Invalid outcome. Allowed: {', '.join(sorted(ALLOWED_LEAD_OUTCOMES))}"}, None  # noqa: E501
        try:
            thread_id = uuid.UUID(args["thread_id"])
        except ValueError as e:
            return {"error": f"Invalid UUID: {e}"}, None
        lt = ensure_lead_thread(session, thread_id)
        prev_outcome = (lt.outcome_override or "").strip().lower()
        lt.outcome_override = outcome
        if outcome == "unresponsive":
            if prev_outcome != "unresponsive":
                lt.unresponsive_since = datetime.utcnow()
        else:
            lt.unresponsive_since = None
        lt.updated_at = datetime.utcnow()
        session.add(lt)
        session.commit()
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
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    if current_user.role not in (UserRole.SUPERADMIN, UserRole.TEAM_MEMBER, UserRole.BD_TEAM_LEAD):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Chat is only available to team members, BD team leads, and admins.")

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

    tools = _TOOLS + (_ANALYTICS_TOOLS if current_user.role == UserRole.SUPERADMIN else [])

    actions: list[ChatAction] = []
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
            return ChatResponse(reply=msg.content or "", actions=actions)

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
            result, action = _exec_tool(tc.function.name, tool_args, session, current_user, own_candidate_id)
            if action:
                actions.append(action)
            messages.append({
                "role": "tool",
                "tool_call_id": tc.id,
                "content": json.dumps(result),
            })

    return ChatResponse(reply="I ran into an issue completing your request. Please try again.", actions=actions)
