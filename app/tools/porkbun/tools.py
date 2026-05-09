"""Porkbun-backed tools.

Each tool delegates to the global Porkbun client when running real, or
to deterministic fixtures in dry-run. The runner enforces safety; tools
themselves do not check flags.
"""
from __future__ import annotations

from typing import Any

from app.clients.porkbun import get_porkbun_client
from app.core.safety import SideEffectLevel
from app.services import dry_run_fixtures as fx
from app.tools.registry import Tool, register_tool


def _ping(*, session=None, dry_run: bool = False, **_: Any) -> dict:
    if dry_run:
        return {"status": "SUCCESS", "yourIp": "127.0.0.1"}
    return get_porkbun_client().ping().body


def _get_pricing(*, session=None, dry_run: bool = False, **_: Any) -> dict:
    if dry_run:
        return fx.porkbun_pricing()
    return get_porkbun_client().get_pricing().body


def _check_availability(*, domain: str, session=None, dry_run: bool = False, **_: Any) -> dict:
    if dry_run:
        return fx.porkbun_check_availability(domain)
    return get_porkbun_client().check_domain_availability(domain).body


def _register_domain(*, domain: str, years: int = 1, session=None, dry_run: bool = False, **_: Any) -> dict:
    if dry_run:
        return fx.porkbun_register(domain)
    return get_porkbun_client().register_domain(domain, years=years).body


def _list_domains(*, session=None, dry_run: bool = False, **_: Any) -> dict:
    if dry_run:
        return {"status": "SUCCESS", "domains": []}
    return get_porkbun_client().list_domains().body


def _get_domain(*, domain: str, session=None, dry_run: bool = False, **_: Any) -> dict:
    if dry_run:
        return {"status": "SUCCESS", "domain": domain}
    return get_porkbun_client().get_domain(domain).body


def _create_record(
    *, domain: str, type: str, name: str, content: str, ttl: int = 600, prio: int | None = None,
    session=None, dry_run: bool = False, **_: Any,
) -> dict:
    if dry_run:
        return fx.porkbun_create_record(domain, type=type, name=name, content=content)
    return get_porkbun_client().create_dns_record(
        domain, type=type, name=name, content=content, ttl=ttl, prio=prio
    ).body


def _list_records(*, domain: str, session=None, dry_run: bool = False, **_: Any) -> dict:
    if dry_run:
        return {"status": "SUCCESS", "records": []}
    return get_porkbun_client().list_dns_records(domain).body


def _update_record(
    *, domain: str, record_id: str, type: str, name: str, content: str, ttl: int = 600, prio: int | None = None,
    session=None, dry_run: bool = False, **_: Any,
) -> dict:
    if dry_run:
        return {"status": "SUCCESS"}
    return get_porkbun_client().update_dns_record(
        domain, record_id, type=type, name=name, content=content, ttl=ttl, prio=prio
    ).body


def _delete_record(*, domain: str, record_id: str, session=None, dry_run: bool = False, **_: Any) -> dict:
    if dry_run:
        return {"status": "SUCCESS"}
    return get_porkbun_client().delete_dns_record(domain, record_id).body


_DOMAIN_INPUT = {
    "type": "object",
    "properties": {"domain": {"type": "string"}},
    "required": ["domain"],
}


def register_all() -> None:
    register_tool(
        Tool(
            name="porkbun_ping",
            description="Porkbun /ping sanity check.",
            input_schema={"type": "object", "properties": {}},
            implementation=_ping,
            side_effect_level=SideEffectLevel.EXTERNAL_READ,
        )
    )
    register_tool(
        Tool(
            name="porkbun_get_pricing",
            description="Fetch TLD price list from Porkbun.",
            input_schema={"type": "object", "properties": {}},
            implementation=_get_pricing,
            side_effect_level=SideEffectLevel.EXTERNAL_READ,
        )
    )
    register_tool(
        Tool(
            name="porkbun_check_availability",
            description="Check whether a domain is available and its price.",
            input_schema=_DOMAIN_INPUT,
            implementation=_check_availability,
            side_effect_level=SideEffectLevel.EXTERNAL_READ,
        )
    )
    register_tool(
        Tool(
            name="porkbun_register_domain",
            description="Register a domain via Porkbun. PURCHASE side effect.",
            input_schema={
                "type": "object",
                "properties": {"domain": {"type": "string"}, "years": {"type": "integer", "minimum": 1, "maximum": 10}},
                "required": ["domain"],
            },
            implementation=_register_domain,
            side_effect_level=SideEffectLevel.PURCHASE,
            requires_confirmation=True,
        )
    )
    register_tool(
        Tool(
            name="porkbun_list_domains",
            description="List all domains under the Porkbun account.",
            input_schema={"type": "object", "properties": {}},
            implementation=_list_domains,
            side_effect_level=SideEffectLevel.EXTERNAL_READ,
        )
    )
    register_tool(
        Tool(
            name="porkbun_get_domain",
            description="Get details for a single domain.",
            input_schema=_DOMAIN_INPUT,
            implementation=_get_domain,
            side_effect_level=SideEffectLevel.EXTERNAL_READ,
        )
    )
    register_tool(
        Tool(
            name="porkbun_create_record",
            description="Create a DNS record in Porkbun.",
            input_schema={
                "type": "object",
                "properties": {
                    "domain": {"type": "string"},
                    "type": {"type": "string"},
                    "name": {"type": "string"},
                    "content": {"type": "string"},
                    "ttl": {"type": "integer", "minimum": 60, "maximum": 86400},
                    "prio": {"type": "integer"},
                },
                "required": ["domain", "type", "name", "content"],
            },
            implementation=_create_record,
            side_effect_level=SideEffectLevel.EXTERNAL_WRITE,
        )
    )
    register_tool(
        Tool(
            name="porkbun_list_records",
            description="List DNS records for a domain.",
            input_schema=_DOMAIN_INPUT,
            implementation=_list_records,
            side_effect_level=SideEffectLevel.EXTERNAL_READ,
        )
    )
    register_tool(
        Tool(
            name="porkbun_update_record",
            description="Update an existing Porkbun DNS record.",
            input_schema={
                "type": "object",
                "properties": {
                    "domain": {"type": "string"},
                    "record_id": {"type": "string"},
                    "type": {"type": "string"},
                    "name": {"type": "string"},
                    "content": {"type": "string"},
                },
                "required": ["domain", "record_id", "type", "name", "content"],
            },
            implementation=_update_record,
            side_effect_level=SideEffectLevel.EXTERNAL_WRITE,
        )
    )
    register_tool(
        Tool(
            name="porkbun_delete_record",
            description="Delete a Porkbun DNS record.",
            input_schema={
                "type": "object",
                "properties": {"domain": {"type": "string"}, "record_id": {"type": "string"}},
                "required": ["domain", "record_id"],
            },
            implementation=_delete_record,
            side_effect_level=SideEffectLevel.EXTERNAL_WRITE,
        )
    )
