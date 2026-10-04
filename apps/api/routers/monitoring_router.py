"""
Monitoring & Observability Router:
Provides endpoints for Grafana/Prometheus scrapers, Sentry error telemetry status, and system health alerts.
"""

from fastapi import APIRouter, Response
from packages.monitoring.metrics import telemetry

router = APIRouter(tags=["Monitoring & Observability"])


@router.get("/metrics")
def prometheus_metrics():
    """Returns Prometheus text exposition format for infra scrapers."""
    stats = telemetry.get_stats()
    body = (
        f"# HELP revops_api_latency_p95_seconds P95 latency for API requests\n"
        f"# TYPE revops_api_latency_p95_seconds gauge\n"
        f"revops_api_latency_p95_seconds {stats['api_latency_p95_sec']}\n\n"
        f"# HELP revops_api_total_requests Total number of API requests\n"
        f"# TYPE revops_api_total_requests counter\n"
        f"revops_api_total_requests {stats['total_requests']}\n\n"
        f"# HELP revops_api_error_rate_pct Error rate percentage\n"
        f"# TYPE revops_api_error_rate_pct gauge\n"
        f"revops_api_error_rate_pct {stats['error_rate_pct']}\n\n"
        f"# HELP revops_crm_sync_failures_hourly Failures per hour syncing with CRM\n"
        f"# TYPE revops_crm_sync_failures_hourly gauge\n"
        f"revops_crm_sync_failures_hourly {stats['crm_sync_failures_last_hour']}\n"
    )
    return Response(content=body, media_type="text/plain; version=0.0.4")


@router.get("/api/v1/monitoring/health")
def monitoring_dashboard_stats():
    """Returns JSON payload for SaaS Admin & Grafana dashboards."""
    return telemetry.get_stats()
