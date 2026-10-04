"""
WebSocket Connection Manager for Real-Time Client Updates.
Supports organization-level broadcasting (deal updates, simulation completion, radar alerts).
"""

from typing import Dict, List
from fastapi import WebSocket


class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, List[WebSocket]] = {}

    async def connect(self, org_id: str, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.setdefault(org_id, []).append(websocket)

    def disconnect(self, org_id: str, websocket: WebSocket):
        if org_id in self.active_connections:
            if websocket in self.active_connections[org_id]:
                self.active_connections[org_id].remove(websocket)
            if not self.active_connections[org_id]:
                del self.active_connections[org_id]

    async def broadcast(self, org_id: str, message: dict):
        for connection in list(self.active_connections.get(org_id, [])):
            try:
                await connection.send_json(message)
            except Exception:
                self.disconnect(org_id, connection)


manager = ConnectionManager()
