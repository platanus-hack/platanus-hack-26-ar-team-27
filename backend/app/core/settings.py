"""Application settings.

Loads from environment / .env using pydantic-settings. The
hard caps for domain count and price ceiling are clamped here so that
even a misconfigured environment cannot exceed the MVP-safe limits.
"""
from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    app_env: str = "local"
    log_level: str = "INFO"
    demo_mode: bool = True
    database_url: str = "sqlite:///./gtm_mvp.db"

    # Auth + CORS for the deployed backend.
    backend_api_key: str = ""
    cors_origins: str = "http://localhost:3000,http://localhost:5173"
    stream_token_ttl_seconds: int = 60

    anthropic_api_key: str = ""
    anthropic_model: str = "claude-sonnet-4-5"
    anthropic_max_tokens: int = 4096
    anthropic_temperature: float = 0.2

    porkbun_api_key: str = ""
    porkbun_secret_api_key: str = ""
    porkbun_base_url: str = "https://api.porkbun.com/api/json/v3"

    spaceship_api_key: str = ""
    spaceship_api_secret: str = ""
    spaceship_base_url: str = "https://spaceship.dev/api/v1"
    dns_provider: str = "spaceship"  # one of: porkbun, spaceship
    allow_domain_purchases: bool = False
    domain_purchase_max_count: int = 2
    domain_purchase_max_price_usd: float = 4.00
    domain_purchase_domains_per_25_companies: int = 1

    # Demo override: when non-empty, plan/purchase short-circuit and every
    # company is seeded with this domain instead of buying or generating
    # candidates. Used by mail + blog flows alike.
    demo_fixed_domain: str = "mt2-gtm.xyz"

    mailgun_api_key: str = ""
    mailgun_base_url: str = "https://api.mailgun.net"
    mailgun_region: Literal["US", "EU"] = "US"
    mailgun_webhook_signing_key: str = ""
    allow_cold_emails: bool = False
    allow_demo_emails: bool = False
    default_from_local_part: str = "warmup"

    vercel_token: str = ""
    vercel_team_id: str = ""
    vercel_api_base: str = "https://api.vercel.com"
    vercel_dns_target: str = "cname.vercel-dns.com"
    allow_blog_publish: bool = False

    research_provider: str = "anthropic_web"
    serpapi_api_key: str = ""
    tavily_api_key: str = ""
    apollo_api_key: str = ""
    peopledatalabs_api_key: str = ""

    max_tool_iterations: int = 8
    agent_total_timeout_seconds: int = 120
    min_target_score: float = 0.4
    warmup_daily_cap: int = 6
    warmup_daily_floor: int = 2

    HARD_DOMAIN_COUNT_CEILING: int = Field(default=2, frozen=True)
    HARD_DOMAIN_PRICE_CEILING_USD: float = Field(default=4.00, frozen=True)

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in (self.cors_origins or "").split(",") if o.strip()]

    @model_validator(mode="after")
    def _clamp_hard_caps(self) -> Settings:
        if self.domain_purchase_max_count > self.HARD_DOMAIN_COUNT_CEILING:
            object.__setattr__(self, "domain_purchase_max_count", self.HARD_DOMAIN_COUNT_CEILING)
        if self.domain_purchase_max_price_usd > self.HARD_DOMAIN_PRICE_CEILING_USD:
            object.__setattr__(
                self,
                "domain_purchase_max_price_usd",
                self.HARD_DOMAIN_PRICE_CEILING_USD,
            )
        return self


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
