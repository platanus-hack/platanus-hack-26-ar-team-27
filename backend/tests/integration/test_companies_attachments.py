from __future__ import annotations

import json
from io import BytesIO
from typing import Any

from fastapi.testclient import TestClient

from app.agents.runner import AgentRunner
from app.clients.anthropic_client import AnthropicResponse, AnthropicResponseBlock
from app.core.settings import Settings, get_settings
from app.db.models import AgentRun, Company


class _StubAnthropicClient:
    def __init__(self, responses: list[AnthropicResponse]):
        self._responses = list(responses)

    def messages_create(self, **kwargs):  # type: ignore[override]
        if not self._responses:
            raise AssertionError("no more responses")
        return self._responses.pop(0)


def test_analyze_accepts_multipart_attachments(monkeypatch, app_session_factory):
    monkeypatch.setenv("BACKEND_API_KEY", "test-key")
    get_settings.cache_clear()

    from app.api import companies as companies_api
    from app.api import deps as api_deps
    from app.main import create_app

    monkeypatch.setattr(companies_api, "get_session_factory", lambda: app_session_factory)
    monkeypatch.setattr(api_deps, "get_session_factory", lambda: app_session_factory)

    client = TestClient(create_app())
    response = client.post(
        "/companies/analyze",
        headers={"X-Api-Key": "test-key"},
        data={"raw_input": "Acme Robotics sells predictive maintenance software."},
        files=[
            (
                "files",
                ("brief.txt", BytesIO(b"ICP: plant managers in LATAM"), "text/plain"),
            )
        ],
    )

    assert response.status_code == 200
    body = response.json()
    company_id = body["id"]
    assert body["gtm_strategy"]

    with app_session_factory() as session:
        company = session.get(Company, company_id)
        assert company is not None
        assert company.gtm_strategy == body["gtm_strategy"]
        assert company.source_files_metadata == [
            {
                "name": "brief.txt",
                "content_type": "text/plain",
                "size_bytes": len(b"ICP: plant managers in LATAM"),
                "note": None,
            }
        ]


def test_analyze_stream_hides_attachment_context_from_persisted_payload(monkeypatch, app_session_factory):
    monkeypatch.setenv("BACKEND_API_KEY", "test-key")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-anthropic-key")
    get_settings.cache_clear()

    from app.api import companies as companies_api
    from app.api import deps as api_deps
    from app.main import create_app
    from app.services import diagnostic_service
    from app.tools.registry import get_global_registry

    stub = _StubAnthropicClient(
        [
            AnthropicResponse(
                content=[
                    AnthropicResponseBlock(
                        type="text",
                        text=json.dumps(
                            {
                                "company_name": "Acme Robotics",
                                "business_context_summary": "Predictive maintenance for manufacturers.",
                                "gtm_strategy": (
                                    "Priorizar una prospección outbound sobre manufacturers en LATAM "
                                    "con secuencias personalizadas para plant managers y una lista "
                                    "acotada de cuentas de alto fit."
                                ),
                                "icp_description": "Plant managers in LATAM manufacturers.",
                                "campaign_target_company_count": 50,
                                "internal_company_size_range": "2-10",
                                "suggested_domain_names": ["acmerobotics.com", "tryacmerobotics.com"],
                                "notes": "Used attachments as supplemental context.",
                            }
                        ),
                    )
                ],
                stop_reason="end_turn",
            )
        ]
    )
    runner = AgentRunner(
        get_global_registry(),
        client=stub,
        settings=Settings(
            anthropic_api_key="test-anthropic-key",
            anthropic_model="test-model",
            anthropic_max_tokens=200,
            anthropic_temperature=0,
            max_tool_iterations=4,
            agent_total_timeout_seconds=10,
        ),
    )
    monkeypatch.setattr(diagnostic_service, "AgentRunner", lambda registry: runner)
    monkeypatch.setattr(companies_api, "get_session_factory", lambda: app_session_factory)
    monkeypatch.setattr(api_deps, "get_session_factory", lambda: app_session_factory)

    client = TestClient(create_app())
    token_response = client.post(
        "/companies/analyze/stream-token",
        headers={"X-Api-Key": "test-key"},
        data={"raw_input": "Acme Robotics. Small team."},
        files=[
            (
                "files",
                ("brief.txt", BytesIO(b"Extra context: focuses on plant managers"), "text/plain"),
            )
        ],
    )

    assert token_response.status_code == 200
    stream_url = token_response.json()["stream_url"]

    stream_response = client.get(stream_url)
    assert stream_response.status_code == 200
    events = _parse_sse_events(stream_response.text)
    done_payload = next(payload for event, payload in events if event == "done")
    company_id = done_payload["company"]["id"]
    assert done_payload["company"]["gtm_strategy"] == (
        "Priorizar una prospección outbound sobre manufacturers en LATAM "
        "con secuencias personalizadas para plant managers y una lista "
        "acotada de cuentas de alto fit."
    )

    with app_session_factory() as session:
        company = session.get(Company, company_id)
        assert company is not None
        assert company.gtm_strategy == done_payload["company"]["gtm_strategy"]
        assert company.source_files_metadata == [
            {
                "name": "brief.txt",
                "content_type": "text/plain",
                "size_bytes": len(b"Extra context: focuses on plant managers"),
                "note": None,
            }
        ]
        agent_run = session.query(AgentRun).filter_by(id=company.agent_run_id).one()
        assert agent_run.input_payload == {
            "raw_input": "Acme Robotics. Small team.",
            "files": [
                {
                    "name": "brief.txt",
                    "content_type": "text/plain",
                    "size_bytes": len(b"Extra context: focuses on plant managers"),
                    "note": None,
                }
            ],
        }
        assert "attachment_context" not in agent_run.input_payload


def test_confirm_and_get_preserve_gtm_strategy(monkeypatch, app_session_factory):
    client = _make_client(monkeypatch, app_session_factory)
    analyze_response = client.post(
        "/companies/analyze",
        headers={"X-Api-Key": "test-key"},
        json={
            "raw_input": (
                "Acme Robotics sells predictive maintenance software for manufacturers in LATAM. "
                "ICP: plant managers at mid-market factories."
            )
        },
    )

    assert analyze_response.status_code == 200, analyze_response.text
    analyzed_company = analyze_response.json()
    assert analyzed_company["gtm_strategy"]

    confirm_response = client.post(
        f"/companies/{analyzed_company['id']}/confirm",
        headers={"X-Api-Key": "test-key"},
        json={},
    )
    assert confirm_response.status_code == 200, confirm_response.text
    assert confirm_response.json()["gtm_strategy"] == analyzed_company["gtm_strategy"]

    get_response = client.get(
        f"/companies/{analyzed_company['id']}",
        headers={"X-Api-Key": "test-key"},
    )
    assert get_response.status_code == 200, get_response.text
    assert get_response.json()["gtm_strategy"] == analyzed_company["gtm_strategy"]

    with app_session_factory() as session:
        company = session.get(Company, analyzed_company["id"])
        assert company is not None
        assert company.gtm_strategy == analyzed_company["gtm_strategy"]


def _make_client(monkeypatch, app_session_factory):
    """Helper: crea un TestClient con key configurada y DB parchada."""
    monkeypatch.setenv("BACKEND_API_KEY", "test-key")
    get_settings.cache_clear()

    from app.api import companies as companies_api
    from app.api import deps as api_deps
    from app.main import create_app

    monkeypatch.setattr(companies_api, "get_session_factory", lambda: app_session_factory)
    monkeypatch.setattr(api_deps, "get_session_factory", lambda: app_session_factory)
    return TestClient(create_app())


# ── Tests del endpoint /analyze/stream-token ──────────────────────────────────

def test_stream_token_multipart_text_only(monkeypatch, app_session_factory):
    """multipart con solo raw_input (sin archivos) → 200 y token válido.

    Nota: TestClient envía application/x-www-form-urlencoded cuando no hay files;
    el backend acepta ambos formatos de form ya que Starlette los parsea igual.
    Para forzar multipart se puede pasar files=[].
    """
    client = _make_client(monkeypatch, app_session_factory)
    resp = client.post(
        "/companies/analyze/stream-token",
        headers={"X-Api-Key": "test-key"},
        data={"raw_input": "Helio Robotics makes predictive maintenance SaaS."},
        # files=[] fuerza multipart/form-data en el TestClient
        files=[],
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert "token" in body
    assert body["stream_url"].startswith("/companies/analyze/stream?token=")


def test_stream_token_json_no_files(monkeypatch, app_session_factory):
    """application/json con raw_input y files:[] → 200 (backward compat)."""
    client = _make_client(monkeypatch, app_session_factory)
    resp = client.post(
        "/companies/analyze/stream-token",
        headers={"X-Api-Key": "test-key", "Content-Type": "application/json"},
        content=b'{"raw_input": "Finch is an embedded treasury API.", "files": []}',
    )
    assert resp.status_code == 200, resp.text
    assert "token" in resp.json()


def test_stream_token_multipart_with_txt_file(monkeypatch, app_session_factory):
    """multipart con raw_input + archivo .txt → 200 y token con attachment_context."""
    client = _make_client(monkeypatch, app_session_factory)
    resp = client.post(
        "/companies/analyze/stream-token",
        headers={"X-Api-Key": "test-key"},
        data={"raw_input": "Arc Studio generates Playwright tests with LLMs."},
        files=[
            ("files", ("notes.txt", BytesIO(b"ICP: engineering leads at YC companies."), "text/plain"))
        ],
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert "token" in body


def test_stream_token_empty_raw_input_returns_422(monkeypatch, app_session_factory):
    """raw_input vacío (solo whitespace) → 422 tras strip."""
    client = _make_client(monkeypatch, app_session_factory)
    resp = client.post(
        "/companies/analyze/stream-token",
        headers={"X-Api-Key": "test-key"},
        data={"raw_input": "   "},
        files=[],
    )
    assert resp.status_code == 422


def test_stream_token_missing_raw_input_returns_422(monkeypatch, app_session_factory):
    """Sin raw_input en multipart → 422."""
    client = _make_client(monkeypatch, app_session_factory)
    resp = client.post(
        "/companies/analyze/stream-token",
        headers={"X-Api-Key": "test-key"},
        data={},
        files=[],
    )
    assert resp.status_code == 422


def test_stream_token_unsupported_content_type_returns_415(monkeypatch, app_session_factory):
    """Content-Type text/plain → 415 Unsupported Media Type."""
    client = _make_client(monkeypatch, app_session_factory)
    resp = client.post(
        "/companies/analyze/stream-token",
        headers={"X-Api-Key": "test-key", "Content-Type": "text/plain"},
        content=b"raw text body",
    )
    assert resp.status_code == 415


def test_stream_token_strips_whitespace_in_raw_input(monkeypatch, app_session_factory):
    """raw_input con espacios al inicio/fin → se limpia y retorna 200."""
    client = _make_client(monkeypatch, app_session_factory)
    resp = client.post(
        "/companies/analyze/stream-token",
        headers={"X-Api-Key": "test-key"},
        data={"raw_input": "  Helio Robotics is a B2B SaaS.  "},
        files=[],
    )
    assert resp.status_code == 200, resp.text


def _parse_sse_events(body: str) -> list[tuple[str, Any]]:
    events: list[tuple[str, Any]] = []
    for chunk in body.split("\n\n"):
        if not chunk.strip():
            continue
        event_name = ""
        data_lines: list[str] = []
        for line in chunk.splitlines():
            if line.startswith("event: "):
                event_name = line[len("event: ") :]
            elif line.startswith("data: "):
                data_lines.append(line[len("data: ") :])
        if event_name:
            events.append((event_name, json.loads("\n".join(data_lines))))
    return events
