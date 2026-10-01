"""Read-only MCP (Model Context Protocol) server so ChatGPT / Claude can chat about portal data.

Speaks MCP's Streamable HTTP transport in its plain-JSON form (no SSE stream, no server-side
sessions): every JSON-RPC request is answered in the POST response itself. That is all a
tools-only server needs, and it keeps this a single stateless endpoint.

Gated by a shared-secret token in the URL (settings.MCP_TOKEN), same model as public_stats —
ChatGPT's custom connectors can't send a static auth header, so the URL itself is the secret.
Every call runs AS the user named by settings.MCP_USER_EMAIL, through Jarvis's own tool
executor, so department / BD / team-member scoping is exactly what that user sees in the app.
Only read and analytics tools are exposed; nothing here can write.
"""

from __future__ import annotations

import hmac
import json
import logging
from typing import Any, Optional

from fastapi import APIRouter, BackgroundTasks, Body, Depends, HTTPException, Response
from fastapi.responses import JSONResponse
from sqlmodel import Session, select

from app.config import get_settings
from app.database import get_session
from app.models.user import User, UserRole
from app.routers.chat import _ANALYTICS_TOOLS, _READ_ONLY_TOOL_NAMES, _TOOLS, _exec_tool
from app.team_member_scope import candidate_id_for_team_member

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/mcp", tags=["MCP"])

_SUPPORTED_PROTOCOL_VERSIONS = ("2025-06-18", "2025-03-26", "2024-11-05")
_SERVER_INSTRUCTIONS = (
    "Read-only access to the RizViz Analytics Portal: interview leads, interview rounds, candidates, "
    "companies, business developers (BDs), resume profiles, and pipeline analytics. "
    "Interview times are stored in US Eastern time (time_est). "
    "Use the analyze_* and get_weekly_summary tools for aggregate questions, list_interviews / "
    "get_upcoming_interviews for individual records, and the list_* tools to resolve names to IDs."
)


def _require_valid_token(token: str) -> None:
    configured = get_settings().MCP_TOKEN
    # 404 (not 403), as in public_stats: a guessed token learns nothing about whether MCP is on.
    if not configured or not hmac.compare_digest(token, configured):
        raise HTTPException(status_code=404, detail="Not found")


def _acting_user(session: Session) -> User:
    email = (get_settings().MCP_USER_EMAIL or "").strip().lower()
    user = session.exec(select(User).where(User.email == email)).first() if email else None
    if not user or not user.is_active:
        logger.error("MCP_USER_EMAIL %r does not match an active user", email)
        raise HTTPException(status_code=503, detail="MCP is not configured")
    return user


def _tool_defs_for(user: User) -> list[dict[str, Any]]:
    """Jarvis's read-only tools (+ analytics for superadmins), in MCP's tool shape."""
    fns = [t["function"] for t in _TOOLS if t["function"]["name"] in _READ_ONLY_TOOL_NAMES]
    if user.role == UserRole.SUPERADMIN:
        fns += [t["function"] for t in _ANALYTICS_TOOLS]
    return [
        {
            "name": fn["name"],
            "description": fn["description"],
            "inputSchema": fn["parameters"],
            "annotations": {"readOnlyHint": True, "openWorldHint": False},
        }
        for fn in fns
    ]


def _rpc_result(req_id: Any, result: dict[str, Any]) -> dict[str, Any]:
    return {"jsonrpc": "2.0", "id": req_id, "result": result}


def _rpc_error(req_id: Any, code: int, message: str) -> dict[str, Any]:
    return {"jsonrpc": "2.0", "id": req_id, "error": {"code": code, "message": message}}


def _handle(msg: Any, session: Session, user: User, own_candidate_id) -> Optional[dict[str, Any]]:
    """Handle one JSON-RPC message; None for notifications (which get no response)."""
    if not isinstance(msg, dict) or msg.get("jsonrpc") != "2.0" or not isinstance(msg.get("method"), str):
        return _rpc_error(msg.get("id") if isinstance(msg, dict) else None, -32600, "Invalid Request")

    method, req_id, params = msg["method"], msg.get("id"), msg.get("params") or {}
    if "id" not in msg:
        return None  # notifications/initialized, notifications/cancelled, …

    if method == "initialize":
        requested = params.get("protocolVersion")
        version = requested if requested in _SUPPORTED_PROTOCOL_VERSIONS else _SUPPORTED_PROTOCOL_VERSIONS[0]
        return _rpc_result(req_id, {
            "protocolVersion": version,
            "capabilities": {"tools": {"listChanged": False}},
            "serverInfo": {"name": "rizviz-analytics-portal", "version": "1.0.0"},
            "instructions": _SERVER_INSTRUCTIONS,
        })

    if method == "ping":
        return _rpc_result(req_id, {})

    if method == "tools/list":
        return _rpc_result(req_id, {"tools": _tool_defs_for(user)})

    if method == "tools/call":
        name = params.get("name")
        args = params.get("arguments") or {}
        if name not in {t["name"] for t in _tool_defs_for(user)}:
            return _rpc_error(req_id, -32602, f"Unknown tool: {name}")
        try:
            # confirm stays False: even if a write tool slipped into the list, _exec_tool refuses it.
            result, _action = _exec_tool(name, args, session, user, own_candidate_id, BackgroundTasks())
        except HTTPException as e:
            result = {"error": e.detail}
        except Exception:
            logger.exception("MCP tool %s failed", name)
            session.rollback()
            result = {"error": "Internal error while running this tool"}
        is_error = isinstance(result, dict) and "error" in result
        return _rpc_result(req_id, {
            "content": [{"type": "text", "text": json.dumps(result, default=str)}],
            "isError": is_error,
        })

    return _rpc_error(req_id, -32601, f"Method not found: {method}")


@router.post("/{token}")
def mcp_endpoint(
    token: str,
    payload: Any = Body(...),
    session: Session = Depends(get_session),
):
    _require_valid_token(token)
    user = _acting_user(session)
    own_candidate_id = (
        candidate_id_for_team_member(session, user) if user.role == UserRole.TEAM_MEMBER else None
    )

    if isinstance(payload, list):
        replies = [r for m in payload if (r := _handle(m, session, user, own_candidate_id)) is not None]
    else:
        replies = _handle(payload, session, user, own_candidate_id)

    if not replies:
        return Response(status_code=202)  # only notifications were sent
    return JSONResponse(replies, headers={"Cache-Control": "no-store"})


@router.get("/{token}")
@router.delete("/{token}")
def mcp_no_stream(token: str):
    # Stateless JSON-only server: no standalone SSE stream and no sessions to terminate.
    _require_valid_token(token)
    return Response(status_code=405, headers={"Allow": "POST"})
