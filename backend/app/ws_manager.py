"""In-memory WebSocket connection registry for internal team messaging.

Single-process only — matches the current single small instance. If this ever needs to
scale to multiple backend processes, this would need to move to Redis pub/sub or similar.
"""

import uuid
from collections import defaultdict

from fastapi import WebSocket


class ConnectionManager:
    def __init__(self) -> None:
        self.active: dict[uuid.UUID, set[WebSocket]] = defaultdict(set)
        # Cached at connect time so a channel broadcast never needs a DB hit.
        self.dept_scope: dict[uuid.UUID, set[str]] = {}

    async def connect(self, user_id: uuid.UUID, dept_ids: list[str], ws: WebSocket) -> None:
        self.active[user_id].add(ws)
        self.dept_scope[user_id] = set(dept_ids)

    def disconnect(self, user_id: uuid.UUID, ws: WebSocket) -> None:
        self.active.get(user_id, set()).discard(ws)
        if not self.active.get(user_id):
            self.active.pop(user_id, None)
            self.dept_scope.pop(user_id, None)

    async def send_to_user(self, user_id: uuid.UUID, payload: dict) -> None:
        for ws in list(self.active.get(user_id, ())):
            try:
                await ws.send_json(payload)
            except Exception:
                self.disconnect(user_id, ws)

    async def broadcast(self, user_ids: set[uuid.UUID], payload: dict) -> None:
        for uid in user_ids:
            await self.send_to_user(uid, payload)

    def connected_users_in_department(self, department_id: uuid.UUID) -> set[uuid.UUID]:
        dept = str(department_id)
        return {uid for uid, scope in self.dept_scope.items() if dept in scope}


manager = ConnectionManager()
