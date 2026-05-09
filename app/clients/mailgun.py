"""Mailgun REST client + webhook signature helper."""
from __future__ import annotations

import hashlib
import hmac
import time
from collections import defaultdict
from collections.abc import Iterable
from dataclasses import dataclass
from typing import Any

import httpx

from app.core.logging import get_logger, redact
from app.core.settings import Settings, get_settings

logger = get_logger(__name__)


class MailgunError(RuntimeError):
    def __init__(self, message: str, status: int | None = None, payload: dict | None = None):
        super().__init__(message)
        self.status = status
        self.payload = payload


@dataclass
class MailgunResponse:
    status_code: int
    body: dict[str, Any]
    latency_ms: int


class MailgunClient:
    def __init__(self, settings: Settings | None = None, http: httpx.Client | None = None):
        self._settings = settings or get_settings()
        self._http = http or httpx.Client(timeout=httpx.Timeout(20.0, connect=5.0))

    @property
    def base_url(self) -> str:
        if self._settings.mailgun_region == "EU":
            return "https://api.eu.mailgun.net"
        return self._settings.mailgun_base_url.rstrip("/")

    def _auth(self) -> tuple[str, str]:
        return ("api", self._settings.mailgun_api_key)

    def _request(
        self,
        method: str,
        path: str,
        *,
        params: dict[str, Any] | None = None,
        data: dict[str, Any] | list[tuple[str, Any]] | None = None,
        json_body: dict[str, Any] | None = None,
    ) -> MailgunResponse:
        url = f"{self.base_url}{path}"
        if isinstance(data, list):
            grouped: dict[str, list[str]] = defaultdict(list)
            for k, v in data:
                grouped[k].append(str(v))
            data_dict: dict[str, Any] | None = {
                k: (vs if len(vs) > 1 else vs[0]) for k, vs in grouped.items()
            }
        else:
            data_dict = data
        started = time.perf_counter()
        resp = self._http.request(
            method,
            url,
            params=params,
            data=data_dict,
            json=json_body,
            auth=self._auth(),
        )
        latency_ms = int((time.perf_counter() - started) * 1000)
        try:
            body = resp.json()
        except Exception:
            body = {"raw": resp.text}
        logger.info(
            "mailgun call",
            extra={
                "method": method,
                "path": path,
                "status_code": resp.status_code,
                "latency_ms": latency_ms,
                "payload": redact(data_dict or json_body or {}),
            },
        )
        if resp.status_code >= 500:
            raise MailgunError(f"Mailgun {path} failed: {resp.status_code}", resp.status_code, body)
        return MailgunResponse(status_code=resp.status_code, body=body, latency_ms=latency_ms)

    # -------- domain --------

    def create_domain(
        self,
        name: str,
        *,
        smtp_password: str | None = None,
        spam_action: str = "disabled",
        wildcard: bool = False,
    ) -> MailgunResponse:
        data = [
            ("name", name),
            ("spam_action", spam_action),
            ("wildcard", str(wildcard).lower()),
            ("web_scheme", "https"),
        ]
        if smtp_password:
            data.append(("smtp_password", smtp_password))
        return self._request("POST", "/v3/domains", data=data)

    def get_domain(self, name: str) -> MailgunResponse:
        return self._request("GET", f"/v3/domains/{name}")

    def verify_domain(self, name: str) -> MailgunResponse:
        return self._request("PUT", f"/v3/domains/{name}/verify")

    def get_domain_dns_records(self, name: str) -> MailgunResponse:
        return self.get_domain(name)

    # -------- messages --------

    def send_message(
        self,
        domain: str,
        *,
        from_addr: str,
        to: Iterable[str],
        subject: str,
        text: str,
        html: str | None = None,
        tags: Iterable[str] | None = None,
        tracking: bool = True,
        reply_to: str | None = None,
        custom_vars: dict[str, str] | None = None,
    ) -> MailgunResponse:
        data: list[tuple[str, Any]] = [
            ("from", from_addr),
            ("subject", subject),
            ("text", text),
            ("o:tracking", "yes" if tracking else "no"),
            ("o:tracking-clicks", "yes" if tracking else "no"),
            ("o:tracking-opens", "yes" if tracking else "no"),
        ]
        for recipient in to:
            data.append(("to", recipient))
        if html:
            data.append(("html", html))
        if tags:
            for tag in tags:
                data.append(("o:tag", tag))
        if reply_to:
            data.append(("h:Reply-To", reply_to))
        if custom_vars:
            for k, v in custom_vars.items():
                data.append((f"v:{k}", v))
        return self._request("POST", f"/v3/{domain}/messages", data=data)

    # -------- routes --------

    def create_route(self, expression: str, action: list[str], description: str = "") -> MailgunResponse:
        data: list[tuple[str, Any]] = [
            ("expression", expression),
            ("description", description),
        ]
        for a in action:
            data.append(("action", a))
        return self._request("POST", "/v3/routes", data=data)

    def list_routes(self) -> MailgunResponse:
        return self._request("GET", "/v3/routes")

    # -------- webhooks --------

    def create_domain_webhook(self, domain: str, event: str, urls: list[str]) -> MailgunResponse:
        data: list[tuple[str, Any]] = []
        for url in urls:
            data.append(("url", url))
        return self._request("POST", f"/v3/domains/{domain}/webhooks/{event}", data=data)

    def list_domain_webhooks(self, domain: str) -> MailgunResponse:
        return self._request("GET", f"/v3/domains/{domain}/webhooks")

    # -------- suppressions --------

    def get_suppressions(self, domain: str, kind: str = "unsubscribes") -> MailgunResponse:
        assert kind in ("unsubscribes", "bounces", "complaints")
        return self._request("GET", f"/v3/{domain}/{kind}")

    def add_unsubscribe(self, domain: str, address: str, tag: str = "*") -> MailgunResponse:
        data = [("address", address), ("tag", tag)]
        return self._request("POST", f"/v3/{domain}/unsubscribes", data=data)

    # -------- signature helpers --------

    def validate_webhook_signature(self, *, timestamp: str, token: str, signature: str) -> bool:
        key = (self._settings.mailgun_webhook_signing_key or "").encode("utf-8")
        if not key:
            return False
        msg = f"{timestamp}{token}".encode()
        digest = hmac.new(key, msg, hashlib.sha256).hexdigest()
        return hmac.compare_digest(digest, signature or "")


_default_client: MailgunClient | None = None


def get_mailgun_client() -> MailgunClient:
    global _default_client
    if _default_client is None:
        _default_client = MailgunClient()
    return _default_client


def set_mailgun_client(client: MailgunClient) -> None:
    global _default_client
    _default_client = client
