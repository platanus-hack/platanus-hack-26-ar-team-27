"""GTM B2B MVP — Typer CLI.

Every dangerous subcommand defaults to dry-run; pass --execute to opt in
(and only after the relevant ALLOW_* env flag is set).
"""
from __future__ import annotations

import json
from pathlib import Path

import typer
from rich.console import Console

from app.core.logging import configure_logging
from app.db.session import get_session_factory
from app.schemas.gtm import CompanyAnalyzeRequest, CompanyConfirmRequest, SourceFile
from app.services.campaign_service import (
    approve_drafts,
    generate_drafts,
    research_targets,
    send_campaign,
)
from app.services.diagnostic_service import analyze_company, confirm_company
from app.services.dns_service import configure_dns, verify_dns
from app.services.domain_service import plan_domains, purchase_domains
from app.services.warmup_service import run_warmup
from app.tools.bootstrap import ensure_registered

app = typer.Typer(help="GTM B2B MVP CLI")
company_app = typer.Typer(help="Company diagnostic")
domains_app = typer.Typer(help="Domain plan/purchase")
dns_app = typer.Typer(help="DNS configuration")
warmup_app = typer.Typer(help="Warmup lite")
campaign_app = typer.Typer(help="Research + send")
demo_app = typer.Typer(help="End-to-end demo")
app.add_typer(company_app, name="company")
app.add_typer(domains_app, name="domains")
app.add_typer(dns_app, name="dns")
app.add_typer(warmup_app, name="warmup")
app.add_typer(campaign_app, name="campaign")
app.add_typer(demo_app, name="demo")

console = Console()


def _session():
    factory = get_session_factory()
    return factory()


def _bootstrap() -> None:
    configure_logging()
    ensure_registered()


def _load_input(input_path: Path) -> CompanyAnalyzeRequest:
    text = input_path.read_text(encoding="utf-8")
    if input_path.suffix.lower() == ".json":
        data = json.loads(text)
        return CompanyAnalyzeRequest(
            raw_input=data.get("raw_input") or data.get("description") or "",
            files=[SourceFile(**f) for f in data.get("files", [])],
        )
    return CompanyAnalyzeRequest(raw_input=text)


# ---------------------------------------------------------------------------
# company
# ---------------------------------------------------------------------------


@company_app.command("analyze")
def company_analyze(input: Path = typer.Option(..., exists=True, readable=True)):
    _bootstrap()
    payload = _load_input(input)
    with _session() as session:
        company = analyze_company(session, payload)
        session.commit()
        console.print({"company_id": company.id, "name": company.name, "target": company.target_company_count})


@company_app.command("confirm")
def company_confirm(company_id: str = typer.Option(...)):
    _bootstrap()
    with _session() as session:
        company = confirm_company(session, company_id, CompanyConfirmRequest())
        session.commit()
        console.print({"company_id": company.id, "status": company.confirmation_status})


# ---------------------------------------------------------------------------
# domains
# ---------------------------------------------------------------------------


domains_pool_app = typer.Typer(help="Manage the pre-owned domain pool")
domains_app.add_typer(domains_pool_app, name="pool")


@domains_pool_app.command("add")
def domains_pool_add(
    domain: list[str] = typer.Option(..., "--domain", help="Domain to add (repeat for multiple)"),
    notes: str | None = typer.Option(None, "--notes"),
):
    """Add one or more pre-owned domains to the pool."""
    _bootstrap()
    from app.services.seed_real_domains import add_to_pool

    with _session() as session:
        rows = [add_to_pool(session, d, notes=notes) for d in domain]
        session.commit()
        console.print(
            [{"id": r.id, "domain": r.domain, "status": r.status, "notes": r.notes} for r in rows]
        )


@domains_pool_app.command("list")
def domains_pool_list():
    _bootstrap()
    from app.services.seed_real_domains import list_pool

    with _session() as session:
        rows = list_pool(session)
        console.print(
            [{"id": r.id, "domain": r.domain, "status": r.status, "notes": r.notes} for r in rows]
        )


@domains_pool_app.command("remove")
def domains_pool_remove(domain: str = typer.Option(...)):
    _bootstrap()
    from app.services.seed_real_domains import remove_from_pool

    with _session() as session:
        ok = remove_from_pool(session, domain)
        session.commit()
        console.print({"removed": ok, "domain": domain})


@domains_app.command("plan")
def domains_plan(company_id: str = typer.Option(...)):
    _bootstrap()
    with _session() as session:
        plan = plan_domains(session, company_id)
        console.print(plan.model_dump())


@domains_app.command("purchase")
def domains_purchase(
    company_id: str = typer.Option(...),
    execute: bool = typer.Option(False, "--execute", help="Run real purchases (requires ALLOW_DOMAIN_PURCHASES=true)"),
):
    _bootstrap()
    with _session() as session:
        result = purchase_domains(session, company_id, execute=execute)
        session.commit()
        console.print(result.model_dump())


# ---------------------------------------------------------------------------
# dns
# ---------------------------------------------------------------------------


@dns_app.command("configure")
def dns_configure(
    company_id: str | None = typer.Option(None),
    domain_id: str | None = typer.Option(None),
    execute: bool = typer.Option(False, "--execute"),
):
    _bootstrap()
    if not (company_id or domain_id):
        raise typer.BadParameter("provide --company-id or --domain-id")
    with _session() as session:
        if domain_id:
            ids = [domain_id]
        else:
            from app.db.models import PurchasedDomain

            ids = [
                pd.id
                for pd in session.query(PurchasedDomain).filter(PurchasedDomain.company_id == company_id).all()
            ]
        results = []
        for did in ids:
            result = configure_dns(session, did, execute=execute)
            verify = verify_dns(session, did, execute=execute)
            results.append({"configure": result.model_dump(), "verify": verify.model_dump()})
        session.commit()
        console.print(results)


# ---------------------------------------------------------------------------
# warmup
# ---------------------------------------------------------------------------


@warmup_app.command("run")
def warmup_run(
    company_id: str = typer.Option(...),
    execute: bool = typer.Option(False, "--execute"),
    accelerated: bool = typer.Option(True, "--accelerated/--paced"),
):
    _bootstrap()
    with _session() as session:
        result = run_warmup(session, company_id, execute=execute, accelerated=accelerated)
        session.commit()
        console.print(result.model_dump())


# ---------------------------------------------------------------------------
# campaign
# ---------------------------------------------------------------------------


@campaign_app.command("research")
def campaign_research(
    company_id: str = typer.Option(...),
    csv_path: Path | None = typer.Option(None),
    limit: int = typer.Option(5),
):
    _bootstrap()
    with _session() as session:
        result = research_targets(session, company_id, csv_path=str(csv_path) if csv_path else None, limit=limit)
        session.commit()
        console.print({"campaign_id": result.campaign_id, "targets": len(result.targets), "contacts": len(result.contacts)})


@campaign_app.command("drafts")
def campaign_drafts(campaign_id: str = typer.Option(...)):
    _bootstrap()
    with _session() as session:
        drafts = generate_drafts(session, campaign_id)
        session.commit()
        console.print({"drafts": len(drafts)})


@campaign_app.command("approve")
def campaign_approve(campaign_id: str = typer.Option(...), all: bool = typer.Option(True, "--all/--ids-only")):
    _bootstrap()
    with _session() as session:
        n = approve_drafts(session, campaign_id, draft_ids=[], approve_all=all)
        session.commit()
        console.print({"approved": n})


@campaign_app.command("send")
def campaign_send(
    campaign_id: str = typer.Option(...),
    execute: bool = typer.Option(False, "--execute"),
):
    _bootstrap()
    with _session() as session:
        result = send_campaign(session, campaign_id, execute=execute)
        session.commit()
        console.print(result.model_dump())


# ---------------------------------------------------------------------------
# demo
# ---------------------------------------------------------------------------


def _step(label: str, payload: dict | str | None = None) -> None:
    console.rule(f"[bold cyan]{label}")
    if payload is not None:
        console.print(payload)


@demo_app.command("run-end-to-end")
def demo_run_end_to_end(
    input: Path = typer.Option(Path("examples/company_input.json"), exists=True, readable=True),
    csv: Path = typer.Option(Path("examples/targets.csv")),
    execute: bool = typer.Option(
        False,
        "--execute",
        help="Run real external actions (requires the relevant ALLOW_* flag in .env). Default is dry-run.",
    ),
    seed_domain: list[str] = typer.Option(
        None,
        "--seed-domain",
        help="Pre-load an externally-purchased domain (skip the purchase step). Repeat to add more. "
        "If omitted, available domains in the `owned_domain_pool` table are used automatically.",
    ),
    pool_limit: int = typer.Option(
        2,
        "--pool-limit",
        help="When pulling from the pool, take at most this many domains (defaults to the 2-domain hard cap).",
    ),
    skip_pool: bool = typer.Option(
        False,
        "--skip-pool",
        help="Force the original purchase flow even if the pool has available domains.",
    ),
    recipient: str | None = typer.Option(
        None,
        "--recipient",
        help="If set, replace the standard target list with one contact pointing to this real email.",
    ),
    use_anthropic: bool = typer.Option(
        False, "--use-anthropic/--heuristic", help="Use Anthropic real for the diagnostic step."
    ),
):
    """End-to-end demo. Default is fully dry-run. Pass --execute + --seed-domain + --recipient for a real test."""
    _bootstrap()
    from app.core.settings import get_settings as _gs
    from app.db.models import Campaign, Contact, PurchasedDomain, Suppression, TargetCompany
    from app.services.seed_real_domains import seed_domains, seed_from_pool

    settings = _gs()
    if execute and not (settings.allow_cold_emails or settings.allow_demo_emails):
        console.print(
            "[yellow]warning:[/yellow] --execute is on but ALLOW_COLD_EMAILS/ALLOW_DEMO_EMAILS are off. "
            "Mailgun sends will stay in dry-run."
        )
    if use_anthropic and not settings.anthropic_api_key:
        console.print("[red]error:[/red] --use-anthropic requires ANTHROPIC_API_KEY in .env")
        raise typer.Exit(1)

    with _session() as session:
        _step("1. Analyzing company", {"use_anthropic": use_anthropic})
        payload = _load_input(input)
        company = analyze_company(session, payload, force_heuristic=not use_anthropic)
        session.commit()
        _step(
            "✓ Diagnostic saved",
            {"company_id": company.id, "name": company.name, "target": company.target_company_count},
        )

        _step("2. Simulating user confirmation")
        company = confirm_company(session, company.id, CompanyConfirmRequest())
        session.commit()
        _step("✓ Company confirmed", {"id": company.id, "status": company.confirmation_status})

        seeded_ids: list[str] = []
        seeded: list = []
        if seed_domain:
            _step("3. Seeding externally-owned domains (skipping purchase)", {"domains": list(seed_domain)})
            seeded = seed_domains(session, company.id, list(seed_domain))
        elif not skip_pool:
            seeded = seed_from_pool(session, company.id, limit=pool_limit)
            if seeded:
                _step(
                    "3. Seeding from owned_domain_pool (skipping purchase)",
                    {"domains": [d.domain for d in seeded]},
                )
        if seeded:
            session.commit()
            seeded_ids = [d.id for d in seeded]
            _step("✓ Seeded", [{"id": d.id, "domain": d.domain, "status": d.status} for d in seeded])
            _step("4. Purchase step skipped (pre-owned domains in use)")
        else:
            _step("3. Planning domains")
            plan = plan_domains(session, company.id)
            _step("✓ Plan", plan.model_dump())
            _step("4. Purchase step")
            purchased = purchase_domains(session, company.id, execute=execute)
            session.commit()
            _step(
                "✓ Purchase result",
                {
                    "decision": purchased.audit_decision,
                    "purchased": [p.domain for p in purchased.purchased],
                },
            )

        _step("5. Configuring DNS + Mailgun (Spaceship API + Mailgun create_domain)")
        if seeded_ids:
            domain_ids = seeded_ids
        else:
            domain_ids = [
                p.id
                for p in session.query(PurchasedDomain).filter_by(company_id=company.id).all()
            ]
        for did in domain_ids:
            configure_dns(session, did, execute=execute)
            verify_dns(session, did, execute=execute)
        session.commit()
        unverified = (
            session.query(PurchasedDomain)
            .filter(PurchasedDomain.company_id == company.id)
            .filter(PurchasedDomain.status != "dns_verified")
            .all()
        )
        if execute and unverified:
            console.print(
                "[yellow]Some domains are still propagating:[/yellow] "
                + ", ".join(d.domain for d in unverified)
            )
            console.print(
                "Wait a few minutes and re-run with the same flags — verification is idempotent."
            )
            raise typer.Exit(0)
        _step("✓ DNS configured & verified")

        _step("6. Running warmup lite")
        warmup = run_warmup(session, company.id, execute=execute, accelerated=True)
        session.commit()
        _step(
            "✓ Warmup",
            {
                "real_sends": execute and (settings.allow_cold_emails or settings.allow_demo_emails),
                "interactions": len(warmup.interactions),
                "promoted": warmup.promoted_domains,
                "paused": warmup.paused_domains,
            },
        )

        _step("7. Researching targets")
        if recipient:
            target = TargetCompany(
                company_id=company.id,
                name="Real Recipient Co",
                domain=recipient.split("@", 1)[-1],
                score=1.0,
                score_rationale="injected via --recipient for real send test",
                selection_status="candidate",
            )
            session.add(target)
            session.flush()
            session.add(
                Contact(
                    target_company_id=target.id,
                    full_name="Test Recipient",
                    title="VP Demo",
                    email=recipient,
                    validation_status="format_ok",
                )
            )
            existing_supp = session.query(Suppression).filter_by(email=recipient.lower()).one_or_none()
            if existing_supp is not None:
                session.delete(existing_supp)
            campaign = Campaign(company_id=company.id, name="real-test", status="ready_to_draft")
            session.add(campaign)
            session.flush()
            campaign_id = campaign.id
            _step("✓ Real-recipient target injected", {"campaign_id": campaign_id, "recipient": recipient})
        else:
            provider_path = str(csv) if csv.exists() else None
            if provider_path:
                import os

                os.environ["RESEARCH_PROVIDER"] = "csv"
                _gs.cache_clear()
            research = research_targets(session, company.id, csv_path=provider_path, limit=5)
            campaign_id = research.campaign_id
            _step(
                "✓ Research",
                {"campaign_id": campaign_id, "targets": len(research.targets), "contacts": len(research.contacts)},
            )
        session.commit()

        _step("8. Generating drafts")
        drafts = generate_drafts(session, campaign_id)
        session.commit()
        _step("✓ Drafts", {"count": len(drafts)})

        _step("9. Approving drafts")
        approved = approve_drafts(session, campaign_id, draft_ids=[], approve_all=True)
        session.commit()
        _step("✓ Approved", {"approved": approved})

        _step("10. Sending campaign" + (" (real)" if execute else " (dry-run)"))
        sent = send_campaign(session, campaign_id, execute=execute)
        session.commit()
        _step(
            "✓ Send result",
            {
                "dry_run": sent.dry_run,
                "sends": [
                    {"draft_id": s.draft_id, "status": s.status, "mailgun_message_id": s.mailgun_message_id}
                    for s in sent.sends
                ],
            },
        )

        _step("11. Demo complete")
        if execute and recipient and any(s.status == "sent" for s in sent.sends):
            console.print(
                f"[bold green]Real send completed.[/bold green] Check inbox at {recipient} (and the spam folder)."
            )
        else:
            console.print("[bold green]All steps completed.[/bold green]")


if __name__ == "__main__":
    app()
