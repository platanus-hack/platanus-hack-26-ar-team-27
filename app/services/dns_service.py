"""DNS configuration: Mailgun create + Porkbun records + verify."""
from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy.orm import Session

from app.agents.runner import record_audit
from app.clients.mailgun import MailgunClient, get_mailgun_client
from app.clients.porkbun import PorkbunClient, get_porkbun_client
from app.clients.spaceship import SpaceshipClient, get_spaceship_client
from app.core.safety import Decision, SideEffectLevel, evaluate
from app.core.settings import get_settings
from app.db.models import DomainDnsRecord, MailgunDomain, PurchasedDomain
from app.schemas.domains import DnsConfigureResult, DnsRecordOut, DnsVerifyResult
from app.services.dry_run_fixtures import (
    mailgun_create_domain as fx_mailgun_create_domain,
)
from app.services.dry_run_fixtures import (
    mailgun_verify_domain as fx_mailgun_verify_domain,
)
from app.services.dry_run_fixtures import (
    porkbun_create_record as fx_porkbun_create_record,
)


class DomainNotFound(Exception):
    pass


def _augment_with_dmarc(bundle: list[dict], domain: str) -> list[dict]:
    """Add a permissive DMARC TXT record if Mailgun didn't already include one."""
    has_dmarc = any(
        (r.get("record_type") or r.get("type") or "").upper() == "TXT"
        and "_dmarc" in str(r.get("name") or r.get("host") or "").lower()
        for r in bundle
    )
    if has_dmarc:
        return bundle
    return list(bundle) + [
        {
            "record_type": "TXT",
            "name": f"_dmarc.{domain}",
            "value": "v=DMARC1; p=none; rua=mailto:postmaster@" + domain + "; adkim=r; aspf=r;",
        }
    ]


def _normalize_record(record: dict) -> dict:
    return {
        "record_type": (record.get("record_type") or record.get("type") or "TXT").upper(),
        "name": record.get("name") or record.get("host") or "@",
        "value": record.get("value") or record.get("content") or "",
        "priority": int(record["priority"]) if record.get("priority") not in (None, "") else None,
    }


def _spaceship_relative_name(record_name: str, domain: str) -> str:
    """Spaceship expects DNS names relative to the domain (e.g. `@`, `email`).

    Mailgun returns absolute hostnames (`email.example.com`). Convert.
    """
    name = (record_name or "").strip().rstrip(".")
    if not name or name == domain:
        return "@"
    suffix = f".{domain}"
    if name.endswith(suffix):
        return name[: -len(suffix)] or "@"
    return name


def _materialize_records(
    session: Session,
    domain: PurchasedDomain,
    bundle: list[dict],
    *,
    porkbun: PorkbunClient | None,
    spaceship: SpaceshipClient | None,
    provider: str,
    real: bool,
) -> list[DomainDnsRecord]:
    rows: list[DomainDnsRecord] = []
    if real and provider == "spaceship":
        # Spaceship saves all records in a single PUT.
        items: list[dict] = []
        normed: list[dict] = []
        for record in bundle:
            norm = _normalize_record(record)
            items.append(
                {
                    "type": norm["record_type"],
                    "name": _spaceship_relative_name(norm["name"], domain.domain),
                    "value": norm["value"],
                    "ttl": 600,
                    "priority": norm["priority"],
                    "preference": norm["priority"],
                    "exchange": norm["value"] if norm["record_type"] == "MX" else None,
                }
            )
            normed.append(norm)
        spaceship.save_dns_records(domain.domain, items, force=True)  # type: ignore[union-attr]
        for norm in normed:
            row = DomainDnsRecord(
                domain_id=domain.id,
                record_type=norm["record_type"],
                host=norm["name"],
                value=norm["value"],
                priority=norm["priority"],
                ttl=600,
                status="created",
                source="mailgun",
                external_record_id="",
                provider="spaceship",
            )
            session.add(row)
            rows.append(row)
        session.flush()
        return rows

    for record in bundle:
        norm = _normalize_record(record)
        if real:
            resp = porkbun.create_dns_record(  # type: ignore[union-attr]
                domain.domain,
                type=norm["record_type"],
                name=norm["name"],
                content=norm["value"],
                prio=norm["priority"],
            ).body
        else:
            resp = fx_porkbun_create_record(
                domain.domain, type=norm["record_type"], name=norm["name"], content=norm["value"]
            )
        row = DomainDnsRecord(
            domain_id=domain.id,
            record_type=norm["record_type"],
            host=norm["name"],
            value=norm["value"],
            priority=norm["priority"],
            ttl=600,
            status="created",
            source="mailgun" if real else "dry_run",
            external_record_id=str(resp.get("id") or ""),
            provider="porkbun",
        )
        session.add(row)
        rows.append(row)
    session.flush()
    return rows


def configure_dns(
    session: Session,
    domain_id: str,
    *,
    execute: bool,
    mailgun: MailgunClient | None = None,
    porkbun: PorkbunClient | None = None,
) -> DnsConfigureResult:
    domain = session.get(PurchasedDomain, domain_id)
    if domain is None:
        raise DomainNotFound(domain_id)
    settings = get_settings()
    evaluation = evaluate(SideEffectLevel.EXTERNAL_WRITE, execute=execute, settings=settings)
    record_audit(
        session,
        actor="dns-configuration",
        tool_name="configure_dns",
        decision=evaluation.decision.value,
        flag=evaluation.flag,
        side_effect_level=SideEffectLevel.EXTERNAL_WRITE,
        request={"domain": domain.domain, "execute": execute},
        response={"reason": evaluation.reason},
    )
    real = evaluation.decision == Decision.ALLOWED
    provider = (settings.dns_provider or "porkbun").lower()
    mailgun = mailgun or (get_mailgun_client() if real else None)
    porkbun_client = porkbun or (get_porkbun_client() if real and provider == "porkbun" else None)
    spaceship_client: SpaceshipClient | None = (
        get_spaceship_client() if real and provider == "spaceship" else None
    )

    if real:
        mg_resp = mailgun.create_domain(domain.domain).body  # type: ignore[union-attr]
    else:
        mg_resp = fx_mailgun_create_domain(domain.domain)

    sending = mg_resp.get("sending_dns_records") or []
    receiving = mg_resp.get("receiving_dns_records") or []
    tracking = mg_resp.get("tracking_dns_records") or []

    mg_row = (
        session.query(MailgunDomain).filter_by(domain_id=domain.id).one_or_none()
    )
    if mg_row is None:
        mg_row = MailgunDomain(
            domain_id=domain.id,
            mailgun_domain_name=domain.domain,
            region=settings.mailgun_region,
            status="unverified",
        )
        session.add(mg_row)
    mg_row.sending_dns_records_json = sending
    mg_row.receiving_dns_records_json = receiving
    mg_row.tracking_dns_records_json = tracking
    mg_row.raw_response_json = mg_resp
    session.flush()

    bundle = sending + receiving + tracking
    bundle = _augment_with_dmarc(bundle, domain.domain)
    records = _materialize_records(
        session,
        domain,
        bundle,
        porkbun=porkbun_client,
        spaceship=spaceship_client,
        provider=provider,
        real=real,
    )
    domain.status = "dns_pending"
    session.flush()

    return DnsConfigureResult(
        domain_id=domain.id,
        domain=domain.domain,
        dry_run=not real,
        mailgun_status=mg_row.status,
        records=[DnsRecordOut.model_validate(r) for r in records],
    )


def verify_dns(
    session: Session,
    domain_id: str,
    *,
    execute: bool,
    mailgun: MailgunClient | None = None,
) -> DnsVerifyResult:
    domain = session.get(PurchasedDomain, domain_id)
    if domain is None:
        raise DomainNotFound(domain_id)
    settings = get_settings()
    evaluation = evaluate(SideEffectLevel.EXTERNAL_WRITE, execute=execute, settings=settings)
    real = evaluation.decision == Decision.ALLOWED
    mailgun = mailgun or (get_mailgun_client() if real else None)

    if real:
        resp = mailgun.verify_domain(domain.domain).body  # type: ignore[union-attr]
    else:
        resp = fx_mailgun_verify_domain(domain.domain)

    state = resp.get("domain", {}).get("state") or "unknown"
    mg_row = session.query(MailgunDomain).filter_by(domain_id=domain.id).one_or_none()
    if mg_row is not None:
        mg_row.status = state
        if state == "active":
            mg_row.verified_at = datetime.now(tz=UTC)
    if state == "active":
        domain.status = "dns_verified"
    session.flush()
    return DnsVerifyResult(
        domain_id=domain.id,
        domain=domain.domain,
        status=domain.status,
        pending_records=[] if state == "active" else ["awaiting propagation"],
    )
