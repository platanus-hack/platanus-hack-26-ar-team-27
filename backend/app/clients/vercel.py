"""Vercel REST client.

Used to deploy generated static blogs and attach a custom subdomain.

Endpoints used:
  - POST /v13/deployments                     create a deployment (auto-creates project on first run)
  - POST /v10/projects/{idOrName}/domains     attach a custom domain to a project
  - GET  /v9/projects/{idOrName}/domains/{d}  inspect domain verification status

Auth: Bearer token (`Authorization: Bearer <VERCEL_TOKEN>`).
Team-scoped tokens require the `teamId` query param on every call.
"""
from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any

import httpx

from app.core.logging import get_logger, redact
from app.core.settings import Settings, get_settings

logger = get_logger(__name__)


class VercelError(RuntimeError):
    def __init__(self, message: str, status: int | None = None, payload: Any = None):
        super().__init__(message)
        self.status = status
        self.payload = payload


@dataclass
class VercelResponse:
    status_code: int
    body: Any
    latency_ms: int


class VercelClient:
    def __init__(self, settings: Settings | None = None, http: httpx.Client | None = None):
        self._settings = settings or get_settings()
        self._http = http or httpx.Client(timeout=httpx.Timeout(30.0, connect=5.0))

    @property
    def base_url(self) -> str:
        return (self._settings.vercel_api_base or "https://api.vercel.com").rstrip("/")

    def _params(self, extra: dict[str, Any] | None = None) -> dict[str, Any]:
        params: dict[str, Any] = {}
        if self._settings.vercel_team_id:
            params["teamId"] = self._settings.vercel_team_id
        if extra:
            params.update(extra)
        return params

    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self._settings.vercel_token}",
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
    ) -> VercelResponse:
        url = f"{self.base_url}{path}"
        started = time.perf_counter()
        resp = self._http.request(
            method,
            url,
            params=self._params(params),
            json=json_body,
            headers=self._headers(),
        )
        latency_ms = int((time.perf_counter() - started) * 1000)
        if resp.status_code == 204 or not resp.content:
            body: Any = {}
        else:
            try:
                body = resp.json()
            except Exception:
                body = {"raw": resp.text}
        logger.info(
            "vercel call",
            extra={
                "method": method,
                "path": path,
                "status_code": resp.status_code,
                "latency_ms": latency_ms,
                "payload": redact(json_body or {}),
            },
        )
        if resp.status_code >= 500:
            raise VercelError(f"Vercel {path} failed: {resp.status_code}", resp.status_code, body)
        if resp.status_code >= 400:
            raise VercelError(
                f"Vercel {path} error: {resp.status_code} {body!r}",
                resp.status_code,
                body if isinstance(body, dict) else {"body": body},
            )
        return VercelResponse(status_code=resp.status_code, body=body, latency_ms=latency_ms)

    def create_deployment(
        self,
        *,
        project_name: str,
        files: list[dict[str, Any]],
        target: str = "production",
    ) -> VercelResponse:
        """Create a deployment.

        `files` items: {"file": "index.html", "data": "<utf-8 string>"}.
        Vercel accepts inline UTF-8 strings under `data`; binaries would need base64.
        """
        body: dict[str, Any] = {
            "name": project_name,
            "files": files,
            "target": target,
            "projectSettings": {"framework": None},
        }
        return self._request("POST", "/v13/deployments", json_body=body)

    def add_project_domain(self, project: str, domain: str) -> VercelResponse:
        return self._request(
            "POST",
            f"/v10/projects/{project}/domains",
            json_body={"name": domain},
        )

    def get_project_domain(self, project: str, domain: str) -> VercelResponse:
        return self._request("GET", f"/v9/projects/{project}/domains/{domain}")


_default_client: VercelClient | None = None


def get_vercel_client() -> VercelClient:
    global _default_client
    if _default_client is None:
        _default_client = VercelClient()
    return _default_client


def set_vercel_client(client: VercelClient) -> None:
    global _default_client
    _default_client = client
