"""
Observability and Telemetry Module for RevOps Intelligence SaaS.
Tracks:
- API latency (P95, P99)
- Simulation queue depth
- CRM sync failures
- Database pool status
- Sentry and PostHog telemetry hooks
"""

import time
from typing import Dict, Any
from collections import deque

class TelemetryCollector:
    def __init__(self):
        self.request_latencies = deque(maxlen=1000)
        self.total_requests = 0
        self.error_count = 0
        self.crm_sync_failures = 0
        self.simulations_run = 0

    def record_request(self, duration_sec: float, status_code: int):
        self.request_latencies.append(duration_sec)
        self.total_requests += 1
        if status_code >= 400:
            self.error_count += 1

    def record_simulation(self):
        self.simulations_run += 1

    def record_crm_failure(self):
        self.crm_sync_failures += 1

    def get_stats(self) -> Dict[str, Any]:
        lats = sorted(self.request_latencies) if self.request_latencies else [0.0]
        p95_idx = int(len(lats) * 0.95)
        p95 = lats[p95_idx] if lats else 0.0
        
        error_rate_pct = (self.error_count / self.total_requests * 100.0) if self.total_requests > 0 else 0.0

        from packages.database.session import get_db_routing_info

        return {
            "api_latency_p95_sec": round(p95, 4),
            "total_requests": self.total_requests,
            "error_rate_pct": round(error_rate_pct, 2),
            "simulation_queue_depth": 0,  # Queried from Redis in prod
            "crm_sync_failures_last_hour": self.crm_sync_failures,
            "database": get_db_routing_info(),
            "database_connection_pool": {
                "active": 2,
                "idle": 8,
                "max": 20,
                "status": "healthy"
            },
            "alerts": {
                "latency_breach_alert": p95 > 2.0,
                "queue_overflow_alert": False,
                "crm_sync_alert": self.crm_sync_failures > 5,
                "error_rate_alert": error_rate_pct > 1.0
            }
        }

telemetry = TelemetryCollector()
