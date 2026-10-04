"""
Main FastAPI Application for RevOps SaaS.
Combines Auth, Multi-Tenancy, 7 Sins Diagnostics, РОП Cockpit, Monte Carlo, and Speech AI.
"""

from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.staticfiles import StaticFiles

from packages.database.session import init_db
from .routers import auth_router, diagnostics_router, radar_router, simulator_router, calls_router

BASE_DIR = Path(__file__).resolve().parent.parent.parent
STATIC_DIR = BASE_DIR / "apps" / "web" / "static"


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize DB schema on startup
    init_db()
    yield


app = FastAPI(
    title="RevOps Enterprise OS — SaaS API",
    description="Мультиарендная B2B SaaS-платформа управления выручкой, речевой ИИ-аналитики и ликвидации узких мест.",
    version="1.0.0",
    lifespan=lifespan,
)

# Enable CORS for Next.js / frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include Routers
app.include_router(auth_router.router, prefix="/api/v1")
app.include_router(diagnostics_router.router, prefix="/api/v1")
app.include_router(radar_router.router, prefix="/api/v1")
app.include_router(simulator_router.router, prefix="/api/v1")
app.include_router(calls_router.router, prefix="/api/v1")


@app.get("/api/v1/health")
def health_check():
    return {
        "status": "healthy",
        "service": "RevOps SaaS Engine",
        "version": "1.0.0",
        "multi_tenancy": "PostgreSQL / SQLite with Tenant Context",
        "rbac_roles": 7,
    }


# Mount web dashboard if it exists
INDEX_HTML = BASE_DIR / "apps" / "web" / "index.html"
if INDEX_HTML.exists():
    @app.get("/", response_class=HTMLResponse)
    def serve_dashboard():
        with open(INDEX_HTML, "r", encoding="utf-8") as f:
            return HTMLResponse(content=f.read())
