from __future__ import annotations

from fastapi.testclient import TestClient

from app.db.models import Company, PurchasedDomain
from app.main import create_app


def test_blog_publish_and_get_keep_contract(app_session_factory, monkeypatch):
    monkeypatch.setenv("BACKEND_API_KEY", "test-key")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "")

    with app_session_factory() as session:
        company = Company(
            name="Helio Robotics",
            business_context_summary=(
                "Helio Robotics builds predictive-maintenance SaaS for industrial robots."
            ),
            icp_description="Plant managers in mid-market manufacturing teams across LATAM",
            target_countries=["Mexico", "Chile"],
            confirmation_status="confirmed",
        )
        session.add(company)
        session.flush()
        session.add(
            PurchasedDomain(
                company_id=company.id,
                domain="helio.mx",
                status="active_for_demo",
                idempotency_key=f"pd-{company.id}",
            )
        )
        session.commit()
        company_id = company.id

    client = TestClient(create_app())
    headers = {"X-Api-Key": "test-key"}

    publish = client.post(
        f"/companies/{company_id}/blog/publish",
        json={"execute": False},
        headers=headers,
    )
    assert publish.status_code == 200
    body = publish.json()
    assert set(body) == {
        "id",
        "company_id",
        "custom_url",
        "vercel_deployment_url",
        "subdomain_host",
        "title",
        "status",
        "error_message",
    }
    assert body["company_id"] == company_id
    assert body["status"] == "dry_run"
    assert body["subdomain_host"] == "blog.helio.mx"

    get_blog = client.get(f"/companies/{company_id}/blog", headers=headers)
    assert get_blog.status_code == 200
    assert get_blog.json() == body
