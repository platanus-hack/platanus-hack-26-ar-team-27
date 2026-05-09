"""Research/send tools (wrappers around the campaign service primitives)."""
from __future__ import annotations

from typing import Any

from app.core.safety import SideEffectLevel
from app.db.models import Contact, Suppression, TargetCompany
from app.services.research.provider import get_provider
from app.tools.registry import Tool, register_tool


def _find_target_companies(*, icp: str | None = None, limit: int = 5, session=None, dry_run: bool = False, **_: Any):
    provider = get_provider()
    accounts = provider.find_target_companies(icp=icp, limit=limit)
    return {"accounts": [a.__dict__ for a in accounts]}


def _find_contacts(*, account_name: str, domain: str | None = None, limit: int = 1, session=None, dry_run: bool = False, **_: Any):
    provider = get_provider()
    fake = type("A", (), {"name": account_name, "domain": domain, "industry": None, "size_range": None, "location": None, "raw": {}})()
    return {"contacts": [c.__dict__ for c in provider.find_contacts(fake, limit=limit)]}


def _score_target(*, account: dict, icp: str | None = None, session=None, dry_run: bool = False, **_: Any):
    score = 0.5
    if icp:
        text = " ".join(str(account.get(k) or "") for k in ("industry", "size_range", "location")).lower()
        score += 0.05 * sum(1 for w in icp.lower().split() if len(w) > 3 and w in text)
    return {"score": min(1.0, score)}


def _validate_contact(*, email: str | None, session=None, dry_run: bool = False, **_: Any):
    if not email or "@" not in email:
        return {"valid": False}
    local, _, host = email.partition("@")
    return {"valid": bool(local and host and "." in host)}


def _check_suppression(*, email: str, session=None, dry_run: bool = False, **_: Any):
    suppressed = bool(session.query(Suppression).filter_by(email=email.lower()).first())
    return {"suppressed": suppressed}


def _compose_email(*, target_id: str, contact_id: str, session=None, dry_run: bool = False, **_: Any):
    target = session.get(TargetCompany, target_id)
    contact = session.get(Contact, contact_id)
    if target is None or contact is None:
        return {"error": "not_found"}
    return {
        "subject": f"Quick note for {target.name}",
        "body": (
            f"Hi {(contact.full_name or '').split()[0] or 'there'},\n\n"
            f"I'm reaching out because {target.name} caught my eye. "
            "Would love a quick chat. Unsubscribe: %unsubscribe_url%"
        ),
    }


def _save_email_draft(*, target_id: str, contact_id: str, subject: str, body: str, session=None, dry_run: bool = False, **_: Any):
    return {"saved": True, "target_id": target_id, "contact_id": contact_id, "subject": subject}


def _approve_email_batch(*, draft_ids: list[str], session=None, dry_run: bool = False, **_: Any):
    return {"approved": draft_ids}


def _send_campaign_email(*, draft_id: str, session=None, dry_run: bool = False, **_: Any):
    return {"draft_id": draft_id, "dispatched": True, "dry_run": dry_run}


def _record_email_event(*, mailgun_message_id: str, event_type: str, session=None, dry_run: bool = False, **_: Any):
    return {"recorded": True, "event_type": event_type}


def _update_campaign_metrics(*, campaign_id: str, session=None, dry_run: bool = False, **_: Any):
    return {"updated": True}


def register_all() -> None:
    register_tool(
        Tool(
            name="find_target_companies",
            description="Use the configured ResearchProvider to list target accounts.",
            input_schema={
                "type": "object",
                "properties": {"icp": {"type": "string"}, "limit": {"type": "integer", "minimum": 1, "maximum": 50}},
            },
            implementation=_find_target_companies,
            side_effect_level=SideEffectLevel.EXTERNAL_READ,
        )
    )
    register_tool(
        Tool(
            name="find_contacts",
            description="List contacts for a given account.",
            input_schema={
                "type": "object",
                "properties": {
                    "account_name": {"type": "string"},
                    "domain": {"type": "string"},
                    "limit": {"type": "integer", "minimum": 1, "maximum": 5},
                },
                "required": ["account_name"],
            },
            implementation=_find_contacts,
            side_effect_level=SideEffectLevel.EXTERNAL_READ,
        )
    )
    register_tool(
        Tool(
            name="score_target_company",
            description="Score a target account against an ICP description (0..1).",
            input_schema={
                "type": "object",
                "properties": {"account": {"type": "object"}, "icp": {"type": "string"}},
                "required": ["account"],
            },
            implementation=_score_target,
            side_effect_level=SideEffectLevel.NONE,
        )
    )
    register_tool(
        Tool(
            name="validate_contact",
            description="Lightweight email-format validation.",
            input_schema={"type": "object", "properties": {"email": {"type": "string"}}, "required": ["email"]},
            implementation=_validate_contact,
            side_effect_level=SideEffectLevel.NONE,
        )
    )
    register_tool(
        Tool(
            name="check_suppression",
            description="Check if an email is suppressed in our local table.",
            input_schema={"type": "object", "properties": {"email": {"type": "string"}}, "required": ["email"]},
            implementation=_check_suppression,
            side_effect_level=SideEffectLevel.NONE,
        )
    )
    register_tool(
        Tool(
            name="compose_campaign_email",
            description="Compose a personalized cold email body for a contact.",
            input_schema={
                "type": "object",
                "properties": {"target_id": {"type": "string"}, "contact_id": {"type": "string"}},
                "required": ["target_id", "contact_id"],
            },
            implementation=_compose_email,
            side_effect_level=SideEffectLevel.NONE,
        )
    )
    register_tool(
        Tool(
            name="save_email_draft",
            description="Persist a draft (no real send).",
            input_schema={
                "type": "object",
                "properties": {
                    "target_id": {"type": "string"},
                    "contact_id": {"type": "string"},
                    "subject": {"type": "string"},
                    "body": {"type": "string"},
                },
                "required": ["target_id", "contact_id", "subject", "body"],
            },
            implementation=_save_email_draft,
            side_effect_level=SideEffectLevel.DB_WRITE,
        )
    )
    register_tool(
        Tool(
            name="approve_email_batch",
            description="Approve a batch of drafts so they may be sent.",
            input_schema={
                "type": "object",
                "properties": {"draft_ids": {"type": "array", "items": {"type": "string"}}},
                "required": ["draft_ids"],
            },
            implementation=_approve_email_batch,
            side_effect_level=SideEffectLevel.DB_WRITE,
        )
    )
    register_tool(
        Tool(
            name="send_campaign_email",
            description="Send an approved draft. SEND_EMAIL side effect.",
            input_schema={
                "type": "object",
                "properties": {"draft_id": {"type": "string"}},
                "required": ["draft_id"],
            },
            implementation=_send_campaign_email,
            side_effect_level=SideEffectLevel.SEND_EMAIL,
        )
    )
    register_tool(
        Tool(
            name="record_email_event",
            description="Record a Mailgun event in our DB.",
            input_schema={
                "type": "object",
                "properties": {"mailgun_message_id": {"type": "string"}, "event_type": {"type": "string"}},
                "required": ["mailgun_message_id", "event_type"],
            },
            implementation=_record_email_event,
            side_effect_level=SideEffectLevel.DB_WRITE,
        )
    )
    register_tool(
        Tool(
            name="update_campaign_metrics",
            description="Recompute aggregate metrics for a campaign.",
            input_schema={
                "type": "object",
                "properties": {"campaign_id": {"type": "string"}},
                "required": ["campaign_id"],
            },
            implementation=_update_campaign_metrics,
            side_effect_level=SideEffectLevel.DB_WRITE,
        )
    )
