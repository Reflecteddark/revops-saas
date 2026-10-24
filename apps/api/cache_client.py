"""
Redis & Resilient In-Memory Cache Client for Multi-Tenant Isolation.
Cache key patterns (strictly scoped by tenant_id, zero shared keys):
- calls:{tenant_id}
- deals:{tenant_id}
"""

import json
import logging
import os
import time
from typing import Any

import redis
import redis.asyncio as aioredis

logger = logging.getLogger("cache_client")

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
REDIS_ENABLED = os.getenv("REDIS_ENABLED", "true").lower() in ("true", "1", "yes")

# Resilient in-memory fallback cache: { key: { "timestamp": float, "data": Any, "ex": int } }
_FALLBACK_MEMORY_CACHE: dict[str, dict[str, Any]] = {}

_async_redis_client: aioredis.Redis | None = None
_sync_redis_client: redis.Redis | None = None


def get_sync_redis() -> redis.Redis | None:
    """Returns initialized synchronous Redis client with short connection timeout."""
    global _sync_redis_client
    if not REDIS_ENABLED:
        return None
    if _sync_redis_client is None:
        try:
            _sync_redis_client = redis.from_url(
                REDIS_URL,
                decode_responses=True,
                socket_connect_timeout=0.5,
                socket_timeout=0.5
            )
            # Connectivity check
            _sync_redis_client.ping()
        except Exception as e:
            logger.debug(f"Sync Redis connection note ({REDIS_URL}): {e}")
            _sync_redis_client = None
    return _sync_redis_client


def get_async_redis() -> aioredis.Redis | None:
    """Returns initialized asynchronous Redis client."""
    global _async_redis_client
    if not REDIS_ENABLED:
        return None
    if _async_redis_client is None:
        try:
            _async_redis_client = aioredis.from_url(
                REDIS_URL,
                decode_responses=True,
                socket_connect_timeout=0.5,
                socket_timeout=0.5
            )
        except Exception as e:
            logger.debug(f"Async Redis connection note ({REDIS_URL}): {e}")
            _async_redis_client = None
    return _async_redis_client


def get_cached_json_sync(key: str) -> Any | None:
    """Reads cached JSON value from Redis with fallback to in-memory cache."""
    client = get_sync_redis()
    if client:
        try:
            val = client.get(key)
            if val is not None:
                return json.loads(val)
        except Exception as e:
            logger.debug(f"Redis sync get failed for {key}: {e}")

    # Fallback to local memory cache
    entry = _FALLBACK_MEMORY_CACHE.get(key)
    if entry:
        now = time.time()
        if now - entry.get("timestamp", 0) < entry.get("ex", 60):
            return entry.get("data")
        _FALLBACK_MEMORY_CACHE.pop(key, None)
    return None


def set_cached_json_sync(key: str, value: Any, ex: int = 60) -> bool:
    """Stores value in Redis with TTL and updates in-memory fallback cache."""
    # Always update memory fallback for maximum resilience
    _FALLBACK_MEMORY_CACHE[key] = {
        "timestamp": time.time(),
        "data": value,
        "ex": ex
    }

    client = get_sync_redis()
    if client:
        try:
            client.set(key, json.dumps(value, ensure_ascii=False), ex=ex)
            return True
        except Exception as e:
            logger.debug(f"Redis sync set failed for {key}: {e}")
    return False


async def get_cached_json_async(key: str) -> Any | None:
    """Asynchronously reads cached JSON value from Redis."""
    client = get_async_redis()
    if client:
        try:
            val = await client.get(key)
            if val is not None:
                return json.loads(val)
        except Exception as e:
            logger.debug(f"Redis async get failed for {key}: {e}")
    return get_cached_json_sync(key)


async def set_cached_json_async(key: str, value: Any, ex: int = 60) -> bool:
    """Asynchronously writes value to Redis with TTL."""
    _FALLBACK_MEMORY_CACHE[key] = {
        "timestamp": time.time(),
        "data": value,
        "ex": ex
    }
    client = get_async_redis()
    if client:
        try:
            await client.set(key, json.dumps(value, ensure_ascii=False), ex=ex)
            return True
        except Exception as e:
            logger.debug(f"Redis async set failed for {key}: {e}")
    return False


def delete_cached_json_sync(key: str) -> bool:
    """Invalidates cache key synchronously."""
    _FALLBACK_MEMORY_CACHE.pop(key, None)
    client = get_sync_redis()
    if client:
        try:
            client.delete(key)
            return True
        except Exception as e:
            logger.debug(f"Redis sync delete failed for {key}: {e}")
    return False


async def delete_cached_json_async(key: str) -> bool:
    """Invalidates cache key asynchronously."""
    _FALLBACK_MEMORY_CACHE.pop(key, None)
    client = get_async_redis()
    if client:
        try:
            await client.delete(key)
            return True
        except Exception as e:
            logger.debug(f"Redis async delete failed for {key}: {e}")
    return False
