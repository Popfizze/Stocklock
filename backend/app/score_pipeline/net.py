"""HTTP for the pipeline: raw bytes, polite retries, and a process-wide rate limiter per source."""

from __future__ import annotations

import threading
import time
from collections.abc import Callable, Iterable
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any, TypeVar

import httpx

from app.data.cache import ExternalUnavailable

T = TypeVar("T")
R = TypeVar("R")


class RateLimiter:
    """At most `per_second` calls per second across threads (SEC asks for 10/s at most)."""

    def __init__(self, per_second: float) -> None:
        self.interval = 1.0 / per_second
        self._lock = threading.Lock()
        self._next = 0.0

    def wait(self) -> None:
        with self._lock:
            now = time.monotonic()
            slot = max(now, self._next)
            self._next = slot + self.interval
        delay = slot - time.monotonic()
        if delay > 0:
            time.sleep(delay)


def get(source: str, url: str, *, headers: dict[str, str] | None = None, params: Any = None,
        timeout_s: float = 20, retries: int = 2, limiter: RateLimiter | None = None,
        sleep: Callable[[float], None] = time.sleep) -> httpx.Response:
    """A successful response; retries timeouts, 429 and 5xx with a short backoff, else ExternalUnavailable."""
    last = "erreur inconnue"
    for attempt in range(retries + 1):
        if attempt:
            sleep(2.0 * attempt)
        if limiter is not None:
            limiter.wait()
        try:
            response = httpx.get(url, headers=headers, params=params, timeout=timeout_s, follow_redirects=True)
        except httpx.TimeoutException:
            last = f"délai dépassé ({timeout_s:.0f} s)"
            continue
        except httpx.HTTPError as exc:
            last = f"erreur réseau ({type(exc).__name__})"
            continue
        if response.status_code == 429 or response.status_code >= 500:
            last = f"HTTP {response.status_code}"
            continue
        if response.status_code >= 400:
            raise ExternalUnavailable(source, f"HTTP {response.status_code}")
        return response
    raise ExternalUnavailable(source, last)


def parallel(items: Iterable[T], fn: Callable[[T], R], workers: int, deadline: float | None = None
             ) -> list[tuple[T, R | None, Exception | None]]:
    """(item, result, error) for each item; items not started before `deadline` get a TimeoutError."""
    items = list(items)
    out: list[tuple[T, R | None, Exception | None]] = []

    def guarded(item: T) -> R:
        if deadline is not None and time.monotonic() > deadline:
            raise TimeoutError("temps limite de l'étape atteint")
        return fn(item)

    with ThreadPoolExecutor(max_workers=max(1, workers)) as pool:
        futures = {pool.submit(guarded, item): item for item in items}
        for future in as_completed(futures):
            item = futures[future]
            try:
                out.append((item, future.result(), None))
            except Exception as exc:  # recorded per item by the caller
                out.append((item, None, exc))
    return out
