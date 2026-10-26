"""
Main FastAPI Application for RevOps Intelligence SaaS.
Implements the 8-Layer Enterprise Architecture:
- API Gateway & Routers (Simulator, Deals, Metrics, Insights, Webhooks, Auth, Radar, Calls)
- WebSocket Manager for real-time live updates
- Multi-tenant data layer & OpenAPI 3.1
"""

import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, RedirectResponse, Response
from fastapi.staticfiles import StaticFiles

from packages.database.session import init_db
from packages.monitoring.metrics import telemetry

from .routers import webhook_ingress, integrations_health_router
from .routers import (
    admin_router,
    auth_router,
    calls_router,
    deals_router,
    diagnostics_router,
    insights_router,
    metrics_router,
    monitoring_router,
    public_router,
    radar_router,
    settings_router,
    sheets_router,
    simulator_router,
    tenants_router,
    webhooks_router,
)
from .websocket_manager import manager

BASE_DIR = Path(__file__).resolve().parent.parent.parent


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


import logging

from fastapi.exception_handlers import http_exception_handler
from fastapi.openapi.docs import get_swagger_ui_html
from fastapi.openapi.utils import get_openapi
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.responses import HTMLResponse, JSONResponse

from packages.monitoring.telegram_alerts import format_error_alert, send_telegram_alert

import hmac

from .routers.admin_router import (
    ALLOWED_ADMIN_KEYS,
    COOKIE_ADMIN_AUTH_NAME,
    generate_admin_cookie_token,
    verify_admin_access,
    verify_admin_cookie_token,
)

logger = logging.getLogger("revops_api")

app = FastAPI(
    title="RevOps Intelligence — Enterprise SaaS API",
    description="Платформа стохастического моделирования выручки, ИИ-инсайтов и ликвидации узких мест воронки.",
    version="1.0.0",
    lifespan=lifespan,
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)

@app.get("/docs", include_in_schema=False)
async def get_protected_docs(request: Request):
    """Admin-only protected Swagger UI with automatic HttpOnly Cookie establishment."""
    verify_admin_access(request)

    base_response = get_swagger_ui_html(
        openapi_url="/openapi.json",
        title="RevOps Intelligence SaaS — API Documentation",
        swagger_ui_parameters={"persistAuthorization": True}
    )
    html_content = bytes(base_response.body).decode("utf-8")
    cleanup_script = "<script>if(window.location.search.includes('admin_key')){window.history.replaceState({},document.title,window.location.pathname);}</script></body>"
    if "</body>" in html_content:
        html_content = html_content.replace("</body>", cleanup_script)
    else:
        html_content += cleanup_script

    resp_headers = dict(base_response.headers)
    resp_headers.pop("content-length", None)
    response = HTMLResponse(content=html_content, status_code=200, headers=resp_headers)

    existing_cookie = request.cookies.get(COOKIE_ADMIN_AUTH_NAME)
    if not existing_cookie or not verify_admin_cookie_token(existing_cookie):
        is_https = request.url.scheme == "https" or request.headers.get("x-forwarded-proto") == "https" or bool(request.headers.get("cf-connecting-ip"))
        host = request.headers.get("host", "").lower()
        cookie_domain = ".ai-rop.ru" if (is_https and ("ai-rop.ru" in host or bool(request.headers.get("cf-connecting-ip")))) else None
        cookie_samesite: Literal["lax", "strict", "none"] = "none" if (is_https and cookie_domain) else "lax"
        new_token = generate_admin_cookie_token()
        response.set_cookie(
            key=COOKIE_ADMIN_AUTH_NAME,
            value=new_token,
            httponly=True,
            secure=is_https,
            samesite=cookie_samesite,
            domain=cookie_domain,
            max_age=7 * 86400,
            path="/"
        )
    return response

@app.get("/openapi.json", include_in_schema=False)
async def get_protected_openapi(request: Request):
    """Admin-only protected OpenAPI schema with HttpOnly cookie maintenance."""
    verify_admin_access(request)
    schema = get_openapi(title=app.title, version=app.version, routes=app.routes)
    response = JSONResponse(content=schema)

    existing_cookie = request.cookies.get(COOKIE_ADMIN_AUTH_NAME)
    if not existing_cookie or not verify_admin_cookie_token(existing_cookie):
        is_https = request.url.scheme == "https" or request.headers.get("x-forwarded-proto") == "https" or bool(request.headers.get("cf-connecting-ip"))
        host = request.headers.get("host", "").lower()
        cookie_domain = ".ai-rop.ru" if (is_https and ("ai-rop.ru" in host or bool(request.headers.get("cf-connecting-ip")))) else None
        cookie_samesite: Literal["lax", "strict", "none"] = "none" if (is_https and cookie_domain) else "lax"
        response.set_cookie(
            key=COOKIE_ADMIN_AUTH_NAME,
            value=generate_admin_cookie_token(),
            httponly=True,
            secure=is_https,
            samesite=cookie_samesite,
            domain=cookie_domain,
            max_age=7 * 86400,
            path="/"
        )
    return response

# Latency & Telemetry Middleware (Prometheus & Sentry Observability)
@app.middleware("http")
async def track_latency_middleware(request: Request, call_next):
    start = time.perf_counter()
    try:
        response = await call_next(request)
        duration = time.perf_counter() - start
        telemetry.record_request(duration, response.status_code)
        return response
    except Exception as exc:
        duration = time.perf_counter() - start
        telemetry.record_request(duration, 500)
        raise exc


# Global Exception Handlers (Telegram Incident Alerts on 500)
@app.exception_handler(StarletteHTTPException)
async def custom_http_exception_handler(request: Request, exc: StarletteHTTPException):
    if exc.status_code >= 500:
        client_ip = request.client.host if request.client else "unknown"
        logger.error(f"HTTP {exc.status_code} Error on {request.method} {request.url.path}: {exc.detail}")
        try:
            alert_text = format_error_alert(
                request_method=request.method,
                request_url=str(request.url),
                client_ip=client_ip,
                exc=exc
            )
            send_telegram_alert(alert_text)
        except Exception as e:
            logger.error(f"Failed to dispatch Telegram alert for HTTP {exc.status_code}: {e}")
    return await http_exception_handler(request, exc)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """
    Global 500 Exception Handler.
    Catches all unhandled server exceptions, logs stacktrace,
    sends instant Telegram incident notification, and returns 500 JSON response.
    """
    client_ip = request.client.host if request.client else "unknown"
    logger.error(f"Unhandled 500 Exception on {request.method} {request.url.path}: {exc}", exc_info=exc)
    try:
        alert_text = format_error_alert(
            request_method=request.method,
            request_url=str(request.url),
            client_ip=client_ip,
            exc=exc
        )
        send_telegram_alert(alert_text)
    except Exception as e:
        logger.error(f"Failed to dispatch Telegram error alert: {e}")

    return JSONResponse(
        status_code=500,
        content={
            "status": "error",
            "message": "Internal Server Error",
            "detail": "An unexpected internal server error occurred. Incident has been dispatched to engineering via Telegram."
        }
    )

# CORS Middleware (allows Vercel, localhost, PWA, Tauri)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://ai-rop.ru",
        "https://report.ai-rop.ru",
        "http://localhost:3000",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
    ],
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
app.include_router(admin_router.router, prefix="/api/v1")
app.include_router(settings_router.router, prefix="/api/v1")
app.include_router(sheets_router.router, prefix="/api/v1")
app.include_router(tenants_router.router, prefix="/api/v1")
app.include_router(webhook_ingress.router)
app.include_router(integrations_health_router.router)
app.include_router(public_router.router, prefix="/api/v1/public")
app.include_router(public_router.router, prefix="/api/v1")


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


@app.get("/api/v1/diagnostics/trigger-500", include_in_schema=False)
def trigger_intentional_500():
    """Diagnostic route to test 500 exception handling and Telegram alert dispatching."""
    raise RuntimeError("Intentional 500 test exception for Telegram alert verification")


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
APP_JS = BASE_DIR / "apps" / "web" / "app.js"
NO_CACHE_HEADERS = {
    "Cache-Control": "no-cache, no-store, must-revalidate",
    "Pragma": "no-cache",
    "Expires": "0"
}

if INDEX_HTML.exists():
    @app.get("/")
    @app.get("/app")
    @app.get("/app/")
    def serve_dashboard(request: Request):
        host = request.headers.get("host", "").lower()
        if "report.ai-rop.ru" in host or (host and "ai-rop.ru" in host and not host.startswith("app.")):
            target_url = "https://app.ai-rop.ru/"
            if request.query_params:
                target_url += f"?{request.query_params}"
            return RedirectResponse(url=target_url, status_code=307)

        with open(INDEX_HTML, "r", encoding="utf-8") as f:
            content = f.read()

        admin_key_param = request.query_params.get("admin_key")
        is_admin_valid = bool(admin_key_param and any(hmac.compare_digest(admin_key_param, k) for k in ALLOWED_ADMIN_KEYS))
        if is_admin_valid:
            clean_script = (
                f'<script>'
                f'try{{localStorage.setItem("revops_admin_key","{admin_key_param}");'
                f'if(window.location.search.includes("admin_key")){{'
                f'const u=new URL(window.location.href);u.searchParams.delete("admin_key");'
                f'window.history.replaceState({{}},document.title,u.pathname+(u.search?u.search:""));'
                f'}}'
                f'}}catch(e){{}}'
                f'</script></head>'
            )
            content = content.replace("</head>", clean_script)

        response = HTMLResponse(content=content, headers=NO_CACHE_HEADERS)
        if is_admin_valid:
            is_https = request.url.scheme == "https" or request.headers.get("x-forwarded-proto") == "https" or bool(request.headers.get("cf-connecting-ip"))
            cookie_domain = ".ai-rop.ru" if (is_https and ("ai-rop.ru" in host or bool(request.headers.get("cf-connecting-ip")))) else None
            cookie_samesite: Literal["lax", "strict", "none"] = "none" if (is_https and cookie_domain) else "lax"
            new_token = generate_admin_cookie_token()
            response.set_cookie(
                key=COOKIE_ADMIN_AUTH_NAME,
                value=new_token,
                httponly=True,
                secure=is_https,
                samesite=cookie_samesite,
                domain=cookie_domain,
                max_age=7 * 86400,
                path="/"
            )
        return response

    @app.get("/admin")
    @app.get("/app/admin")
    def serve_admin(request: Request):
        host = request.headers.get("host", "").lower()
        if "report.ai-rop.ru" in host or (host and "ai-rop.ru" in host and not host.startswith("app.")):
            target_url = "https://app.ai-rop.ru/admin"
            if request.query_params:
                target_url += f"?{request.query_params}"
            return RedirectResponse(url=target_url, status_code=307)

        with open(INDEX_HTML, "r", encoding="utf-8") as f:
            content = f.read()

        admin_key_param = request.query_params.get("admin_key")
        is_admin_valid = bool(admin_key_param and any(hmac.compare_digest(admin_key_param, k) for k in ALLOWED_ADMIN_KEYS))
        storage_inject = f'try{{localStorage.setItem("revops_admin_key","{admin_key_param}");}}catch(e){{}}' if is_admin_valid else ''
        inject_script = (
            f'<script>window.__INITIAL_TAB__="admin";{storage_inject}'
            f'if(window.location.search.includes("admin_key")){{'
            f'try{{const u=new URL(window.location.href);u.searchParams.delete("admin_key");'
            f'window.history.replaceState({{}},document.title,u.pathname+(u.search?u.search:""));'
            f'}}catch(e){{}}}}'
            f'</script></head>'
        )
        content = content.replace("</head>", inject_script)

        response = HTMLResponse(content=content, headers=NO_CACHE_HEADERS)
        if is_admin_valid:
            is_https = request.url.scheme == "https" or request.headers.get("x-forwarded-proto") == "https" or bool(request.headers.get("cf-connecting-ip"))
            host = request.headers.get("host", "").lower()
            cookie_domain = ".ai-rop.ru" if (is_https and ("ai-rop.ru" in host or bool(request.headers.get("cf-connecting-ip")))) else None
            cookie_samesite: Literal["lax", "strict", "none"] = "none" if (is_https and cookie_domain) else "lax"
            new_token = generate_admin_cookie_token()
            response.set_cookie(
                key=COOKIE_ADMIN_AUTH_NAME,
                value=new_token,
                httponly=True,
                secure=is_https,
                samesite=cookie_samesite,
                domain=cookie_domain,
                max_age=7 * 86400,
                path="/"
            )
        return response

if APP_JS.exists():
    @app.get("/app.js")
    @app.get("/app/app.js")
    def serve_app_js():
        return FileResponse(APP_JS, media_type="application/javascript", headers=NO_CACHE_HEADERS)

WEB_JS_DIR = BASE_DIR / "apps" / "web" / "js"
if WEB_JS_DIR.exists():
    app.mount("/js", StaticFiles(directory=str(WEB_JS_DIR)), name="js")
    app.mount("/app/js", StaticFiles(directory=str(WEB_JS_DIR)), name="app_js")

# Mount Marketing Landing (apps/landing)
LANDING_DIR = BASE_DIR / "apps" / "landing"
LANDING_HTML = LANDING_DIR / "index.html"
if LANDING_HTML.exists():
    @app.get("/landing", response_class=HTMLResponse)
    def serve_landing():
        with open(LANDING_HTML, "r", encoding="utf-8") as f:
            return HTMLResponse(content=f.read())

    for folder in ["css", "images", "fonts", "audio", "samples", "webfonts"]:
        sub_dir = LANDING_DIR / folder
        if sub_dir.exists():
            app.mount(f"/{folder}", StaticFiles(directory=str(sub_dir)), name=f"landing_{folder}")

