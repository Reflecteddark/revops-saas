"""
Celery Worker Configuration for RevOps SaaS.
Orchestrates asynchronous tasks:
- Simulation Queue (Monte-Carlo long runs)
- CRM Sync Queue (amoCRM / Bitrix24 batch updates)
- Call Processing Queue (Telephony audio ingestion, Gemini scoring, Google Sheets sync)
"""

import os

try:
    from celery import Celery
    HAS_CELERY = True
except ImportError:
    HAS_CELERY = False

    class Celery:  # type: ignore[no-redef]
        """Lightweight in-memory shim when celery package is not installed."""
        def __init__(self, name="revops_workers", broker=None, backend=None):
            self.name = name
            self.conf = type("Conf", (), {"update": lambda self, *args, **kwargs: None})()

        def task(self, *task_args, **task_kwargs):
            def decorator(fn):
                class WrappedTask:
                    def __init__(self, func):
                        self.func = func
                        self.__name__ = func.__name__
                        self.request = type("Req", (), {"retries": 0})()
                        self.max_retries = task_kwargs.get("max_retries", 3)

                    def delay(self, *a, **kw):
                        raise RuntimeError("Celery broker is not installed or offline in this environment")

                    def retry(self, exc=None, countdown=0):
                        raise exc or RuntimeError("Task retry")

                    def __call__(self, *a, **kw):
                        return self.func(self, *a, **kw)

                return WrappedTask(fn)
            return decorator

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
        "workers.tasks.process_call_audio_task": {"queue": "call_processing_queue"},
    },
)
