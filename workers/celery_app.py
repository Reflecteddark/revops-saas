"""
Celery Worker Configuration for RevOps SaaS.
Orchestrates asynchronous tasks:
- Simulation Queue (Monte-Carlo long runs)
- CRM Sync Queue (amoCRM / Bitrix24 batch updates)
"""

import os
from celery import Celery

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

celery_app = Celery(
    "revops_workers",
    broker=REDIS_URL,
    backend=REDIS_URL,
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_routes={
        "workers.tasks.run_simulation_task": {"queue": "simulation_queue"},
        "workers.tasks.sync_crm_task": {"queue": "crm_sync_queue"},
    },
)
