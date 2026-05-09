"""Spaceship REST client.

Spaceship public API:
  - Base URL: https://spaceship.dev/api/v1
  - Auth: header `X-Api-Key` + `X-Api-Secret`
  - DNS list:   GET    /dns/records/{domain}?take=N&skip=0
  - DNS save:   PUT    /dns/records/{domain}   body {force, items[]}
  - DNS delete: DELETE /dns/records/{domain}   body [items]

Per-type field mapping for an item in `items`:
  - A / AAAA  -> {type, name, ttl, address}
  - CNAME     -> {type, name, ttl, cname}
  - MX        -> {type, name, ttl, preference, exchange}
  - TXT/NS/CAA-> {type, name, ttl, value}
"""
from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any

import httpx

from app.core.logging import get_logger, redact
from app.core.settings import Settings, get_settings

logger = get_logger(__name__)


class SpaceshipError(RuntimeError):
    def __init__(self, message: str, status: int | None = None, payload: dict | None = None):
        super().__init__(message)
        self.status = status
        self.payload = payload


@dataclass
class SpaceshipResponse:
    status_code: int
    body: Any
    latency_ms: int


class SpaceshipClient:
    def __init__(self, settings: Settings | None = None, http: httpx.Client | None = None):
        self._settings = settings or get_settings()
        self._http = http or httpx.Client(timeout=httpx.Timeout(20.0, connect=5.0))

    @property
    def base_url(self) -> str:
        return (getattr(self._settings, "spaceship_base_url", None) or "https://spaceship.dev/api/v1").rstrip("/")

    def _headers(self) -> dict[str, str]:
        return {
            "X-Api-Key": self._settings.spaceship_api_key,
            "X-Api-Secret": self._settings.spaceship_api_secret,
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

    def _request(
        self,
        method: str,
        path: str,
        *,
        params: dict[str, Any] | None = None,
        json_body: Any | None = None,
    ) -> SpaceshipResponse:
        url = f"{self.base_url}{path}"
        started = time.perf_counter()
        resp = self._http.request(
            method,
            url,
            params=params,
            json=json_body,
            headers=self._headers(),
        )
        latency_ms = int((time.perf_counter() - started) * 1000)
        body: Any
        if resp.status_code == 204 or not resp.content:
            body = {}
        else:
            try:
                body = resp.json()
            except Exception:
                body = {"raw": resp.text}
        logger.info(
            "spaceship call",
            extra={
                "method": method,
                "path": path,
                "status_code": resp.status_code,
                "latency_ms": latency_ms,
                "payload": redact(json_body or {}),
            },
        )
        if resp.status_code >= 500:
            raise SpaceshipError(f"Spaceship {path} failed: {resp.status_code}", resp.status_code, body)
        if resp.status_code >= 400:
            raise SpaceshipError(
                f"Spaceship {path} error: {resp.status_code} {body!r}",
                resp.status_code,
                body if isinstance(body, dict) else {"body": body},
            )
        return SpaceshipResponse(status_code=resp.status_code, body=body, latency_ms=latency_ms)

    # ---------- DNS records ----------

    def list_dns_records(self, domain: str, *, take: int = 100, skip: int = 0) -> SpaceshipResponse:
        return self._request("GET", f"/dns/records/{domain}", params={"take": take, "skip": skip})

    def save_dns_records(
        self,
        domain: str,
        records: list[dict[str, Any]],
        *,
        force: bool = True,
    ) -> SpaceshipResponse:
        items = [self._normalize(r) for r in records]
        return self._request("PUT", f"/dns/records/{domain}", json_body={"force": force, "items": items})

    def delete_dns_records(self, domain: str, records: list[dict[str, Any]]) -> SpaceshipResponse:
        return self._request(
            "DELETE",
            f"/dns/records/{domain}",
            json_body=[self._normalize(r, for_delete=True) for r in records],
        )

    @staticmethod
    def _normalize(record: dict[str, Any], *, for_delete: bool = False) -> dict[str, Any]:
        rtype = (record.get("type") or "").upper()
        item: dict[str, Any] = {"type": rtype, "name": record.get("name") or "@"}
        ttl = record.get("ttl")
        if ttl is not None and not for_delete:
            item["ttl"] = int(ttl)
        if rtype in ("A", "AAAA"):
            item["address"] = record.get("address") or record.get("value")
        elif rtype == "CNAME":
            item["cname"] = record.get("cname") or record.get("value")
        elif rtype == "MX":
            preference = record.get("preference")
            exchange = record.get("exchange")
            if preference is None or exchange is None:
                value = record.get("value") or ""
                parts = value.split()
                if len(parts) >= 2:
                    preference = preference if preference is not None else int(parts[0])
                    exchange = exchange or " ".join(parts[1:])
            if preference is None or exchange is None:
                priority = record.get("priority")
                exchange = exchange or record.get("value") or ""
                preference = preference if preference is not None else (int(priority) if priority is not None else 10)
            item["preference"] = int(preference)
            item["exchange"] = exchange
        else:
            item["value"] = record.get("value") or record.get("content") or ""
        return item


_default_client: SpaceshipClient | None = None


def get_spaceship_client() -> SpaceshipClient:
    global _default_client
    if _default_client is None:
        _default_client = SpaceshipClient()
    return _default_client


def set_spaceship_client(client: SpaceshipClient) -> None:
    global _default_client
    _default_client = client
