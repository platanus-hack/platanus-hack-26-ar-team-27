"""Porkbun REST client.

All Porkbun endpoints expect POST with a JSON body containing `apikey` and
`secretapikey`. We log status, latency and a redacted payload on every call.
"""
from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any

import httpx

from app.core.logging import get_logger, redact
from app.core.settings import Settings, get_settings

logger = get_logger(__name__)


class PorkbunError(RuntimeError):
    def __init__(self, message: str, status: int | None = None, payload: dict | None = None):
        super().__init__(message)
        self.status = status
        self.payload = payload


@dataclass
class PorkbunResponse:
    status_code: int
    body: dict[str, Any]
    latency_ms: int


class PorkbunClient:
    def __init__(self, settings: Settings | None = None, http: httpx.Client | None = None):
        self._settings = settings or get_settings()
        self._http = http or httpx.Client(timeout=httpx.Timeout(20.0, connect=5.0))

    @property
    def base_url(self) -> str:
        return self._settings.porkbun_base_url.rstrip("/")

    def _auth_payload(self) -> dict[str, Any]:
        return {
            "apikey": self._settings.porkbun_api_key,
            "secretapikey": self._settings.porkbun_secret_api_key,
        }

    def _post(self, path: str, payload: dict[str, Any] | None = None) -> PorkbunResponse:
        url = f"{self.base_url}{path}"
        body = {**self._auth_payload(), **(payload or {})}
        started = time.perf_counter()
        resp = self._http.post(url, json=body)
        latency_ms = int((time.perf_counter() - started) * 1000)
        try:
            data = resp.json()
        except Exception:
            data = {"status": "ERROR", "message": resp.text}
        logger.info(
            "porkbun call",
            extra={
                "endpoint": path,
                "status_code": resp.status_code,
                "latency_ms": latency_ms,
                "payload": redact(payload or {}),
                "response_status": data.get("status"),
            },
        )
        if resp.status_code >= 500:
            raise PorkbunError(f"Porkbun {path} failed: {resp.status_code}", resp.status_code, data)
        return PorkbunResponse(status_code=resp.status_code, body=data, latency_ms=latency_ms)

    # ---------- public methods ----------

    def ping(self) -> PorkbunResponse:
        return self._post("/ping")

    def get_pricing(self) -> PorkbunResponse:
        return self._post("/pricing/get")

    def check_domain_availability(self, domain: str) -> PorkbunResponse:
        return self._post(f"/domain/checkDomain/{domain}")

    def register_domain(
        self,
        domain: str,
        *,
        years: int = 1,
        coupon: str | None = None,
    ) -> PorkbunResponse:
        body: dict[str, Any] = {"years": years}
        if coupon:
            body["coupon"] = coupon
        return self._post(f"/domain/register/{domain}", body)

    def list_domains(self) -> PorkbunResponse:
        return self._post("/domain/listAll")

    def get_domain(self, domain: str) -> PorkbunResponse:
        return self._post(f"/domain/getDomain/{domain}")

    def create_dns_record(
        self,
        domain: str,
        *,
        type: str,
        name: str,
        content: str,
        ttl: int = 600,
        prio: int | None = None,
    ) -> PorkbunResponse:
        body: dict[str, Any] = {"type": type, "name": name, "content": content, "ttl": ttl}
        if prio is not None:
            body["prio"] = prio
        return self._post(f"/dns/create/{domain}", body)

    def list_dns_records(self, domain: str) -> PorkbunResponse:
        return self._post(f"/dns/retrieve/{domain}")

    def update_dns_record(
        self,
        domain: str,
        record_id: str,
        *,
        type: str,
        name: str,
        content: str,
        ttl: int = 600,
        prio: int | None = None,
    ) -> PorkbunResponse:
        body: dict[str, Any] = {"type": type, "name": name, "content": content, "ttl": ttl}
        if prio is not None:
            body["prio"] = prio
        return self._post(f"/dns/edit/{domain}/{record_id}", body)

    def delete_dns_record(self, domain: str, record_id: str) -> PorkbunResponse:
        return self._post(f"/dns/delete/{domain}/{record_id}")


_default_client: PorkbunClient | None = None


def get_porkbun_client() -> PorkbunClient:
    global _default_client
    if _default_client is None:
        _default_client = PorkbunClient()
    return _default_client


def set_porkbun_client(client: PorkbunClient) -> None:
    global _default_client
    _default_client = client
