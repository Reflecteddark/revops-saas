"""
Main FastAPI Application for RevOps Intelligence SaaS.
Implements the 8-Layer Enterprise Architecture:
- API Gateway & Routers (Simulator, Deals, Metrics, Insights, Webhooks, Auth, Radar, Calls)
- WebSocket Manager for real-time live updates
- Multi-tenant data layer & OpenAPI 3.1
"""

from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.staticfiles import StaticFiles

from packages.database.session import init_db
from .websocket_manager import manager
import time
from fastapi import Request
from packages.monitoring.metrics import telemetry
from .routers import (
    auth_router, 
    diagnostics_router, 
    radar_router, 
    simulator_router, 
    calls_router,
    deals_router,
    metrics_router,
    insights_router,
    webhooks_router,
    monitoring_router
)

BASE_DIR = Path(__file__).resolve().parent.parent.parent


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(
    title="RevOps Intelligence — Enterprise SaaS API",
    description="Платформа стохастического моделирования выручки, ИИ-инсайтов и ликвидации узких мест воронки.",
    version="1.0.0",
    lifespan=lifespan,
)

# Latency & Telemetry Middleware (Prometheus & Sentry Observability)
@app.middleware("http")
async def track_latency_middleware(request: Request, call_next):
    start = time.perf_counter()
    response = await call_next(request)
    duration = time.perf_counter() - start
    telemetry.record_request(duration, response.status_code)
    return response

# CORS Middleware (allows Vercel, localhost, PWA, Tauri)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register API v1 Routers (Matching Architecture Specification)
app.include_router(simulator_router.router, prefix="/api/v1")
app.include_router(deals_router.router, prefix="/api/v1")
app.include_router(metrics_router.router, prefix="/api/v1")
app.include_router(insights_router.router, prefix="/api/v1")
app.include_router(webhooks_router.router, prefix="/api/v1")
app.include_router(monitoring_router.router)
app.include_router(auth_router.router, prefix="/api/v1")
app.include_router(diagnostics_router.router, prefix="/api/v1")
app.include_router(radar_router.router, prefix="/api/v1")
app.include_router(calls_router.router, prefix="/api/v1")


# Real-time WebSocket Endpoint
@app.websocket("/ws/org/{org_id}")
async def websocket_endpoint(websocket: WebSocket, org_id: str):
    await manager.connect(org_id, websocket)
    try:
        while True:
            data = await websocket.receive_text()
            # Echo heartbeat or client ack
            await websocket.send_json({"type": "pong", "received": data})
    except WebSocketDisconnect:
        manager.disconnect(org_id, websocket)


@app.get("/api/v1/health")
def health_check():
    return {
        "status": "healthy",
        "service": "RevOps Intelligence SaaS Engine",
        "version": "1.0.0",
        "rbac_roles": 7,
        "layers": {
            "client": "Next.js 15 / Responsive Bento Web",
            "api": "FastAPI (Python 3.12)",
            "compute": "Monte-Carlo Engine (NumPy + Rust Rayon Ready)",
            "data": "PostgreSQL 16 + TimescaleDB + Redis 7",
            "integrations": "amoCRM, Bitrix24, Claude API"
        }
    }


# Serve Branded SVG Favicon
@app.get("/favicon.ico", include_in_schema=False)
def get_favicon():
    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">'
        '<defs>'
        '<linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">'
        '<stop offset="0%" stop-color="#7352ff"/>'
        '<stop offset="100%" stop-color="#00d4ff"/>'
        '</linearGradient>'
        '</defs>'
        '<rect width="32" height="32" rx="8" fill="url(#g)"/>'
        '<text x="50%" y="54%" font-family="system-ui, -apple-system, sans-serif" font-size="19" font-weight="800" fill="#ffffff" text-anchor="middle" dominant-baseline="middle">R</text>'
        '</svg>'
    )
    return Response(content=svg, media_type="image/svg+xml")


# Mount Web Dashboard
INDEX_HTML = BASE_DIR / "apps" / "web" / "index.html"
if INDEX_HTML.exists():
    @app.get("/", response_class=HTMLResponse)
    def serve_dashboard():
        with open(INDEX_HTML, "r", encoding="utf-8") as f:
            return HTMLResponse(content=f.read())
