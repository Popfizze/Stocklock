"""Shared HTTP helper with short timeouts and explicit unavailability errors."""

from __future__ import annotations

import threading
import time
from typing import Any
from urllib.parse import urlsplit

import httpx

from app.data.cache import ExternalUnavailable


class RateLimiter:
    """At most `per_second` calls per second across the process's threads."""

    def __init__(self, per_second: float) -> None:
        self.interval = 1.0 / per_second
        self._lock = threading.Lock()
        self._next = 0.0

    def wait(self) -> None:
        with self._lock:
            slot = max(time.monotonic(), self._next)
            self._next = slot + self.interval
        delay = slot - time.monotonic()
        if delay > 0:
            time.sleep(delay)


# SEC fair access: 10 requests per second at most. Group runs fetch EDGAR for several titles at once.
SEC_LIMITER = RateLimiter(8)


def _throttle(url: str) -> None:
    if urlsplit(url).netloc.lower().endswith("sec.gov"):
        SEC_LIMITER.wait()


def get_json(source: str, url: str, *, headers: dict[str, str], timeout_s: float,
             params: dict[str, str] | None = None) -> Any:
    _throttle(url)
    try:
        response = httpx.get(url, params=params, headers=headers, timeout=timeout_s,
                             follow_redirects=True)
    except httpx.TimeoutException as exc:
        raise ExternalUnavailable(source, f"délai dépassé ({timeout_s:.0f} s)") from exc
    except httpx.HTTPError as exc:
        raise ExternalUnavailable(source, f"erreur réseau ({type(exc).__name__})") from exc
    if response.status_code == 429:
        raise ExternalUnavailable(source, "limite de débit atteinte (HTTP 429)")
    if response.status_code == 404:
        raise ExternalUnavailable(source, "ressource introuvable (HTTP 404)")
    if response.status_code >= 400:
        raise ExternalUnavailable(source, f"HTTP {response.status_code}")
    try:
        return response.json()
    except ValueError as exc:
        snippet = response.text[:120].replace("\n", " ")
        raise ExternalUnavailable(source, f"réponse non JSON ({snippet!r})") from exc


def get_text(source: str, url: str, *, headers: dict[str, str], timeout_s: float,
             max_bytes: int = 1_500_000) -> tuple[str, str, str]:
    """(text, content type, final URL) of a page; only HTML and plain text, at most `max_bytes`."""
    _throttle(url)
    try:
        with httpx.stream("GET", url, headers=headers, timeout=timeout_s, follow_redirects=True) as response:
            if response.status_code == 429:
                raise ExternalUnavailable(source, "limite de débit atteinte (HTTP 429)")
            if response.status_code >= 400:
                raise ExternalUnavailable(source, f"HTTP {response.status_code}")
            kind = response.headers.get("content-type", "").split(";")[0].strip().lower()
            if kind not in {"text/html", "application/xhtml+xml", "text/plain", ""}:
                raise ExternalUnavailable(source, f"contenu non textuel ({kind})")
            chunks, size = [], 0
            for chunk in response.iter_bytes():
                chunks.append(chunk)
                size += len(chunk)
                if size >= max_bytes:
                    break
            body = b"".join(chunks)[:max_bytes]
            try:
                text = body.decode(response.charset_encoding or "utf-8", errors="replace")
            except LookupError:  # unknown charset name in the header
                text = body.decode("utf-8", errors="replace")
            return text, kind, str(response.url)
    except httpx.TimeoutException as exc:
        raise ExternalUnavailable(source, f"délai dépassé ({timeout_s:.0f} s)") from exc
    except httpx.HTTPError as exc:
        raise ExternalUnavailable(source, f"erreur réseau ({type(exc).__name__})") from exc
