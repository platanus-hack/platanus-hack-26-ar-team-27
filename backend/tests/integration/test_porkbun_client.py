from __future__ import annotations

import httpx
import pytest
import respx

from app.clients.porkbun import PorkbunClient, PorkbunError
from app.core.settings import Settings


@pytest.fixture()
def settings() -> Settings:
    return Settings(
        porkbun_api_key="pk-test",
        porkbun_secret_api_key="sk-test",
        porkbun_base_url="https://api.porkbun.com/api/json/v3",
    )


@pytest.fixture()
def client(settings):
    return PorkbunClient(settings=settings, http=httpx.Client(timeout=5.0))


@respx.mock
def test_check_domain_availability_success(client, settings):
    route = respx.post("https://api.porkbun.com/api/json/v3/domain/checkDomain/example.com").mock(
        return_value=httpx.Response(
            200,
            json={"status": "SUCCESS", "available": True, "price": "3.50", "premium": False},
        )
    )
    res = client.check_domain_availability("example.com")
    assert route.called
    assert res.status_code == 200
    assert res.body["available"] is True
    assert float(res.body["price"]) == 3.50


@respx.mock
def test_get_pricing(client):
    respx.post("https://api.porkbun.com/api/json/v3/pricing/get").mock(
        return_value=httpx.Response(200, json={"status": "SUCCESS", "pricing": {"com": {"registration": "9.13"}}})
    )
    res = client.get_pricing()
    assert res.body["pricing"]["com"]["registration"] == "9.13"


@respx.mock
def test_register_domain_success(client):
    respx.post("https://api.porkbun.com/api/json/v3/domain/register/example.com").mock(
        return_value=httpx.Response(200, json={"status": "SUCCESS", "id": "porkbun-xyz"})
    )
    res = client.register_domain("example.com", years=1)
    assert res.body["id"] == "porkbun-xyz"


@respx.mock
def test_register_domain_5xx_raises(client):
    respx.post("https://api.porkbun.com/api/json/v3/domain/register/fail.com").mock(
        return_value=httpx.Response(503, json={"status": "ERROR"})
    )
    with pytest.raises(PorkbunError):
        client.register_domain("fail.com")


@respx.mock
def test_dns_crud(client):
    respx.post("https://api.porkbun.com/api/json/v3/dns/create/example.com").mock(
        return_value=httpx.Response(200, json={"status": "SUCCESS", "id": "rec-1"})
    )
    respx.post("https://api.porkbun.com/api/json/v3/dns/retrieve/example.com").mock(
        return_value=httpx.Response(200, json={"status": "SUCCESS", "records": []})
    )
    respx.post("https://api.porkbun.com/api/json/v3/dns/edit/example.com/rec-1").mock(
        return_value=httpx.Response(200, json={"status": "SUCCESS"})
    )
    respx.post("https://api.porkbun.com/api/json/v3/dns/delete/example.com/rec-1").mock(
        return_value=httpx.Response(200, json={"status": "SUCCESS"})
    )
    assert client.create_dns_record("example.com", type="TXT", name="@", content="v=spf1 -all").body["id"] == "rec-1"
    assert client.list_dns_records("example.com").body["status"] == "SUCCESS"
    assert client.update_dns_record(
        "example.com", "rec-1", type="TXT", name="@", content="v=spf1 -all"
    ).body["status"] == "SUCCESS"
    assert client.delete_dns_record("example.com", "rec-1").body["status"] == "SUCCESS"
