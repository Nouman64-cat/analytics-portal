"""Agentic chat assistant — creates companies, leads, and interviews via OpenAI function calling."""

from __future__ import annotations

import json
import uuid
from datetime import datetime, date
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlmodel import Session, select

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
from app.lead_thread_utils import ensure_lead_thread
from app.team_member_scope import candidate_id_for_team_member

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
            "description": "List all companies in the database. Call this first to resolve a company name to its ID before creating a lead or scheduling an interview.",
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
            "name": "create_company",
            "description": "Create a new company. Only call this after confirming with list_companies that it does not already exist.",
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
            "description": "Open a new lead (pipeline opportunity) for a company. Requires company_id and resume_profile_id (resolve them with list_* first).",
            "parameters": {
                "type": "object",
                "properties": {
                    "company_id": {"type": "string", "description": "UUID of the company"},
                    "resume_profile_id": {"type": "string", "description": "UUID of the resume profile"},
                    "role": {"type": "string", "description": "Job title / opportunity name"},
                    "candidate_id": {"type": "string", "description": "UUID of the candidate entertaining this lead (leave blank for team members — it is set automatically)"},
                    "bd_id": {"type": "string", "description": "UUID of the business developer (optional)"},
                    "salary_range": {"type": "string", "description": "e.g. '$120k–$140k' (optional)"},
                    "notes": {"type": "string", "description": "Free-text notes (optional)"},
                    "arrived_on": {"type": "string", "description": "Date the lead was received, YYYY-MM-DD (optional)"},
                },
                "required": ["company_id", "resume_profile_id", "role"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "schedule_interview",
            "description": "Schedule an interview round. Requires company_id and resume_profile_id (resolve with list_* first).",
            "parameters": {
                "type": "object",
                "properties": {
                    "company_id": {"type": "string", "description": "UUID of the company"},
                    "resume_profile_id": {"type": "string", "description": "UUID of the resume profile"},
                    "role": {"type": "string", "description": "Job title"},
                    "round": {"type": "string", "description": "Round label — e.g. 'Lead', 'Phone Screen', 'Technical', 'Onsite', 'Final Round', 'Offer'"},
                    "interview_date": {"type": "string", "description": "YYYY-MM-DD (optional)"},
                    "time_est": {"type": "string", "description": "HH:MM 24-hour EST time (optional)"},
                    "candidate_id": {"type": "string", "description": "UUID of the candidate (leave blank for team members — set automatically)"},
                    "bd_id": {"type": "string", "description": "UUID of the business developer (optional)"},
                    "interview_link": {"type": "string", "description": "Meeting URL (optional)"},
                    "is_phone_call": {"type": "boolean", "description": "True if this is a phone call", "default": False},
                    "interviewer": {"type": "string", "description": "Interviewer name (optional)"},
                },
                "required": ["company_id", "resume_profile_id", "role", "round"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_interviews",
            "description": (
                "Search interviews/leads in the database. Use this to find the interview_id or thread_id "
                "before calling update_interview_status or update_lead_outcome. "
                "Filter by company name, role, or round to narrow results."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "company_name": {"type": "string", "description": "Partial company name to filter by (optional)"},
                    "role": {"type": "string", "description": "Partial role/job title to filter by (optional)"},
                    "round": {"type": "string", "description": "Round label to filter by (optional)"},
                    "limit": {"type": "integer", "description": "Max results to return (default 20)", "default": 20},
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "update_interview_status",
            "description": (
                "Update the status text on a single interview round row (e.g. 'Passed', 'Rejected', 'No Show', 'Rescheduled'). "
                "Use this for per-round outcomes. To update the overall pipeline/lead outcome use update_lead_outcome instead."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "interview_id": {"type": "string", "description": "UUID of the interview row to update"},
                    "status": {"type": "string", "description": "New status text for this round (e.g. 'Passed', 'Rejected', 'No Show', 'Rescheduled', 'Offer Extended')"},
                },
                "required": ["interview_id", "status"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "update_lead_outcome",
            "description": (
                "Update the overall pipeline outcome for a lead thread. "
                "Use this when the user says the lead/opportunity was closed, rejected, dropped, etc. "
                "Allowed values: active, unresponsive, dropped, dead, rejected, closed."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "thread_id": {"type": "string", "description": "UUID of the lead thread (from list_interviews)"},
                    "outcome": {
                        "type": "string",
                        "enum": ["active", "unresponsive", "dropped", "dead", "rejected", "closed"],
                        "description": "New pipeline outcome",
                    },
                },
                "required": ["thread_id", "outcome"],
            },
        },
    },
]


# ─── System prompt ───────────────────────────────────────────

def _system_prompt(user: User, own_candidate_id: Optional[uuid.UUID]) -> str:
    today = date.today().strftime("%A, %B %d, %Y")
    if user.role == UserRole.TEAM_MEMBER:
        role_ctx = (
            f"You are assisting a TEAM MEMBER. "
            f"Their fixed candidate ID is {own_candidate_id}. "
            f"Always force candidate_id to this value when calling create_lead or schedule_interview — never use any other candidate ID for this user. "
            f"Do not ask which candidate to use; just apply it silently."
            if own_candidate_id else
            "You are assisting a TEAM MEMBER, but their account has no linked candidate record. "
            "Inform them they need an admin to link their account to a candidate before you can create leads or interviews on their behalf."
        )
    else:
        role_ctx = (
            "You are assisting a SUPERADMIN. They have full access and can create leads and interviews for any candidate. "
            "When no candidate is specified ask which candidate the opportunity is for, then use list_candidates to find their ID."
        )

    return f"""You are an AI recruitment assistant for the AI Interviews Portal.
You help manage the recruitment pipeline by adding companies, creating leads, and scheduling interview rounds.

Today: {today}
User: {user.full_name} ({user.email}) — Role: {user.role.value}

{role_ctx}

How to act:
- Use list_* tools first to resolve names to IDs — never guess an ID
- If a company does not exist, offer to create it (confirm with the user first)
- Ask for missing required fields one at a time in a friendly, conversational way
- After each successful action, clearly confirm what was created or scheduled
- Dates must be YYYY-MM-DD. Times must be HH:MM (24-hour) EST
- Common round labels: Lead · Phone Screen · Technical · Onsite · Final Round · Offer
- To update a status or outcome: first call list_interviews to find the right record, then call update_interview_status (per-round result) or update_lead_outcome (overall pipeline outcome)
- Lead outcomes: active · unresponsive · dropped · dead · rejected · closed
- Keep responses concise and focused"""


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
        rows = session.exec(select(ResumeProfile).order_by(ResumeProfile.name)).all()
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

    if name == "create_company":
        existing = session.exec(select(Company).where(Company.name == args["name"])).first()
        if existing:
            return {"error": f"Company '{args['name']}' already exists (id: {existing.id}). Use its ID instead."}, None
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
        # Enforce candidate for team members
        candidate_id_raw = own_candidate_id if user.role == UserRole.TEAM_MEMBER else args.get("candidate_id")
        try:
            company_id = uuid.UUID(args["company_id"])
            resume_profile_id = uuid.UUID(args["resume_profile_id"])
            candidate_id = uuid.UUID(str(candidate_id_raw)) if candidate_id_raw else None
            bd_id = uuid.UUID(args["bd_id"]) if args.get("bd_id") else None
        except ValueError as e:
            return {"error": f"Invalid UUID: {e}"}, None

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
        lt.updated_at = datetime.utcnow()
        session.add(lt)

        interview = Interview(
            thread_id=thread_id,
            company_id=company_id,
            resume_profile_id=resume_profile_id,
            candidate_id=candidate_id,
            role=args["role"].strip(),
            salary_range=(args.get("salary_range") or "").strip() or None,
            bd_id=bd_id,
            round="Lead",
            interview_date=arrived_on,
        )
        session.add(interview)
        session.commit()

        company = session.get(Company, company_id)
        desc = f"Lead created — {company.name} · {args['role'].strip()}"
        action = ChatAction(type="lead_created", description=desc, id=str(thread_id))
        return {"thread_id": str(thread_id), "company": company.name, "role": args["role"]}, action

    if name == "schedule_interview":
        candidate_id_raw = own_candidate_id if user.role == UserRole.TEAM_MEMBER else args.get("candidate_id")
        try:
            company_id = uuid.UUID(args["company_id"])
            resume_profile_id = uuid.UUID(args["resume_profile_id"])
            candidate_id = uuid.UUID(str(candidate_id_raw)) if candidate_id_raw else None
            bd_id = uuid.UUID(args["bd_id"]) if args.get("bd_id") else None
        except ValueError as e:
            return {"error": f"Invalid UUID: {e}"}, None

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

        from datetime import time as dt_time
        time_est = None
        if args.get("time_est"):
            try:
                parts = args["time_est"].split(":")
                time_est = dt_time(int(parts[0]), int(parts[1]))
            except (ValueError, IndexError):
                pass

        interview = Interview(
            thread_id=uuid.uuid4(),
            company_id=company_id,
            resume_profile_id=resume_profile_id,
            candidate_id=candidate_id,
            role=args["role"].strip(),
            round=args["round"].strip(),
            interview_date=interview_date,
            time_est=time_est,
            bd_id=bd_id,
            interview_link=args.get("interview_link"),
            is_phone_call=args.get("is_phone_call", False),
            interviewer=args.get("interviewer"),
        )
        session.add(interview)
        session.commit()

        company = session.get(Company, company_id)
        date_str = f" on {interview_date}" if interview_date else ""
        time_str = f" at {args['time_est']} EST" if args.get("time_est") else ""
        desc = f"Interview scheduled — {company.name} · {args['role']} · {args['round']}{date_str}{time_str}"
        action = ChatAction(type="interview_scheduled", description=desc, id=str(interview.id))
        return {"interview_id": str(interview.id), "company": company.name, "round": args["round"]}, action

    if name == "list_interviews":
        query = (
            select(Interview, Company)
            .join(Company, Interview.company_id == Company.id)
            .order_by(Interview.created_at.desc())
        )
        company_name = args.get("company_name", "").strip().lower()
        role_filter = args.get("role", "").strip().lower()
        round_filter = args.get("round", "").strip().lower()
        limit = min(int(args.get("limit", 20)), 50)

        rows = session.exec(query).all()
        results = []
        for interview, company in rows:
            if company_name and company_name not in company.name.lower():
                continue
            if role_filter and role_filter not in interview.role.lower():
                continue
            if round_filter and round_filter not in interview.round.lower():
                continue
            results.append({
                "interview_id": str(interview.id),
                "thread_id": str(interview.thread_id),
                "company": company.name,
                "role": interview.role,
                "round": interview.round,
                "status": interview.status,
                "interview_date": str(interview.interview_date) if interview.interview_date else None,
                "created_at": interview.created_at.date().isoformat(),
            })
            if len(results) >= limit:
                break
        return results, None

    if name == "update_interview_status":
        try:
            iid = uuid.UUID(args["interview_id"])
        except ValueError as e:
            return {"error": f"Invalid UUID: {e}"}, None
        interview = session.get(Interview, iid)
        if not interview:
            return {"error": "Interview not found"}, None
        interview.status = args["status"].strip()
        interview.updated_at = datetime.utcnow()
        session.add(interview)
        session.commit()
        action = ChatAction(
            type="interview_status_updated",
            description=f"Interview status set to '{interview.status}'",
            id=str(interview.id),
        )
        return {"interview_id": str(interview.id), "status": interview.status}, action

    if name == "update_lead_outcome":
        from app.lead_thread_utils import ALLOWED_LEAD_OUTCOMES, ensure_lead_thread
        outcome = args["outcome"].strip().lower()
        if outcome not in ALLOWED_LEAD_OUTCOMES:
            return {"error": f"Invalid outcome. Must be one of: {', '.join(sorted(ALLOWED_LEAD_OUTCOMES))}"}, None
        try:
            thread_id = uuid.UUID(args["thread_id"])
        except ValueError as e:
            return {"error": f"Invalid UUID: {e}"}, None
        lt = ensure_lead_thread(session, thread_id)
        lt.outcome_override = outcome
        lt.updated_at = datetime.utcnow()
        session.add(lt)
        session.commit()
        action = ChatAction(
            type="lead_outcome_updated",
            description=f"Lead outcome updated to '{outcome}'",
            id=str(thread_id),
        )
        return {"thread_id": str(thread_id), "outcome": outcome}, action

    return {"error": f"Unknown tool: {name}"}, None


# ─── Endpoint ────────────────────────────────────────────────

@router.post("/message", response_model=ChatResponse)
def chat_message(
    body: ChatRequest,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    if current_user.role not in (UserRole.SUPERADMIN, UserRole.TEAM_MEMBER):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Chat is only available to team members and admins.")

    settings = get_settings()
    if not settings.OPENAI_API_KEY:
        raise HTTPException(status_code=500, detail="OpenAI API key is not configured.")

    from openai import OpenAI
    client = OpenAI(api_key=settings.OPENAI_API_KEY)

    own_candidate_id = None
    if current_user.role == UserRole.TEAM_MEMBER:
        own_candidate_id = candidate_id_for_team_member(session, current_user)

    messages: list[dict] = [{"role": "system", "content": _system_prompt(current_user, own_candidate_id)}]
    for m in body.messages:
        messages.append({"role": m.role, "content": m.content})
    messages.append({"role": "user", "content": body.message})

    actions: list[ChatAction] = []
    max_iterations = 10

    for _ in range(max_iterations):
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=messages,
            tools=_TOOLS,
            tool_choice="auto",
        )
        msg = response.choices[0].message

        if not msg.tool_calls:
            return ChatResponse(reply=msg.content or "", actions=actions)

        # Add assistant message with tool calls
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

        # Execute each tool call and feed results back
        for tc in msg.tool_calls:
            try:
                args = json.loads(tc.function.arguments)
            except json.JSONDecodeError:
                args = {}
            result, action = _exec_tool(tc.function.name, args, session, current_user, own_candidate_id)
            if action:
                actions.append(action)
            messages.append({
                "role": "tool",
                "tool_call_id": tc.id,
                "content": json.dumps(result),
            })

    return ChatResponse(reply="I ran into an issue completing your request. Please try again.", actions=actions)
