"""Shared HTTP helper with short timeouts and explicit unavailability errors."""

from __future__ import annotations

from typing import Any

import httpx

from app.data.cache import ExternalUnavailable


def get_json(source: str, url: str, *, headers: dict[str, str], timeout_s: float,
             params: dict[str, str] | None = None) -> Any:
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
