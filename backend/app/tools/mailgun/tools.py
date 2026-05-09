"""Mailgun-backed tools."""
from __future__ import annotations

from typing import Any

from app.clients.mailgun import get_mailgun_client
from app.core.safety import SideEffectLevel
from app.services import dry_run_fixtures as fx
from app.tools.registry import Tool, register_tool


def _create_domain(*, name: str, session=None, dry_run: bool = False, **_: Any) -> dict:
    if dry_run:
        return fx.mailgun_create_domain(name)
    return get_mailgun_client().create_domain(name).body


def _get_domain(*, name: str, session=None, dry_run: bool = False, **_: Any) -> dict:
    if dry_run:
        return fx.mailgun_create_domain(name)
    return get_mailgun_client().get_domain(name).body


def _verify_domain(*, name: str, session=None, dry_run: bool = False, **_: Any) -> dict:
    if dry_run:
        return fx.mailgun_verify_domain(name)
    return get_mailgun_client().verify_domain(name).body


def _send_message(
    *,
    domain: str,
    from_addr: str,
    to: list[str],
    subject: str,
    text: str,
    html: str | None = None,
    session=None,
    dry_run: bool = False,
    **_: Any,
) -> dict:
    if dry_run:
        return fx.mailgun_send_message(domain, recipient=(to[0] if to else "n/a"), subject=subject)
    return get_mailgun_client().send_message(
        domain, from_addr=from_addr, to=to, subject=subject, text=text, html=html
    ).body


def _get_suppressions(*, domain: str, kind: str = "unsubscribes", session=None, dry_run: bool = False, **_: Any) -> dict:
    if dry_run:
        return {"items": []}
    return get_mailgun_client().get_suppressions(domain, kind=kind).body


def _add_unsubscribe(*, domain: str, address: str, session=None, dry_run: bool = False, **_: Any) -> dict:
    if dry_run:
        return {"address": address, "tag": "*", "message": "added (dry-run)"}
    return get_mailgun_client().add_unsubscribe(domain, address).body


def register_all() -> None:
    register_tool(
        Tool(
            name="mailgun_create_domain",
            description="Create a Mailgun domain (returns required DNS records).",
            input_schema={"type": "object", "properties": {"name": {"type": "string"}}, "required": ["name"]},
            implementation=_create_domain,
            side_effect_level=SideEffectLevel.EXTERNAL_WRITE,
        )
    )
    register_tool(
        Tool(
            name="mailgun_get_domain",
            description="Fetch a Mailgun domain and its current DNS state.",
            input_schema={"type": "object", "properties": {"name": {"type": "string"}}, "required": ["name"]},
            implementation=_get_domain,
            side_effect_level=SideEffectLevel.EXTERNAL_READ,
        )
    )
    register_tool(
        Tool(
            name="mailgun_verify_domain",
            description="Trigger Mailgun verification for the given domain.",
            input_schema={"type": "object", "properties": {"name": {"type": "string"}}, "required": ["name"]},
            implementation=_verify_domain,
            side_effect_level=SideEffectLevel.EXTERNAL_WRITE,
        )
    )
    register_tool(
        Tool(
            name="mailgun_send_message",
            description="Send an email through Mailgun. SEND_EMAIL side effect.",
            input_schema={
                "type": "object",
                "properties": {
                    "domain": {"type": "string"},
                    "from_addr": {"type": "string"},
                    "to": {"type": "array", "items": {"type": "string"}},
                    "subject": {"type": "string"},
                    "text": {"type": "string"},
                    "html": {"type": "string"},
                },
                "required": ["domain", "from_addr", "to", "subject", "text"],
            },
            implementation=_send_message,
            side_effect_level=SideEffectLevel.SEND_EMAIL,
            requires_confirmation=True,
        )
    )
    register_tool(
        Tool(
            name="mailgun_get_suppressions",
            description="Fetch suppression list for a domain.",
            input_schema={
                "type": "object",
                "properties": {
                    "domain": {"type": "string"},
                    "kind": {"type": "string", "enum": ["unsubscribes", "bounces", "complaints"]},
                },
                "required": ["domain"],
            },
            implementation=_get_suppressions,
            side_effect_level=SideEffectLevel.EXTERNAL_READ,
        )
    )
    register_tool(
        Tool(
            name="mailgun_add_unsubscribe",
            description="Add an unsubscribe entry for an address.",
            input_schema={
                "type": "object",
                "properties": {"domain": {"type": "string"}, "address": {"type": "string"}},
                "required": ["domain", "address"],
            },
            implementation=_add_unsubscribe,
            side_effect_level=SideEffectLevel.EXTERNAL_WRITE,
        )
    )
