"""Research provider backed by Anthropic's web_search + web_fetch server tools.

The agent receives a description of the seller (the company using our
system) and finds real prospects (companies that would buy the seller's
service). It uses ``web_search`` to discover candidates and ``web_fetch``
to verify them against their public sites.

Why this is its own provider, not a regular Agent + Runner:

  * ``web_search_*`` and ``web_fetch_*`` are *server tools*: Anthropic
    executes them inside the API and feeds the results back to the model
    automatically. Our generic ``AgentRunner`` is built around the
    client-executed ``tool_use`` loop, which would make this awkward.
  * The provider therefore makes its own ``messages.create`` call,
    handles ``stop_reason == "pause_turn"`` to let the server-side loop
    continue, and parses the final JSON response.

Output contract: every account in the response carries an ``evidence_url``
pointing at the page the model used to ground it. Anything the model
cannot ground is dropped (rather than fabricated).
"""
from __future__ import annotations

import json
import re
from typing import Any

from app.core.logging import get_logger
from app.core.settings import Settings, get_settings
from app.services.research.provider import ContactDraft, SellerContext, TargetAccount

logger = get_logger(__name__)


_TARGET_SYSTEM_PROMPT = """\
Sos un research analyst B2B con acceso a búsqueda web en vivo.

Tu objetivo: encontrar empresas REALES que serían clientes naturales de
la empresa del usuario. Es decir, prospects para una campaña outbound.

Reglas duras:
- Empezá con `web_search` con queries amplias derivadas del ICP.
- Después seleccioná candidatas y usá `web_fetch` sobre sus sitios para
  verificar industria, tamaño aproximado y ubicación.
- Cada empresa devuelta DEBE tener `evidence_url` apuntando a la página
  pública (sitio corporativo, perfil de LinkedIn, etc.) de donde sacaste
  la información.
- Si no podés verificar industria/tamaño/ubicación de una empresa, no la
  incluyas. Es preferible devolver menos empresas pero con datos sólidos.
- No inventes datos. Si un campo no está en la fuente, marcalo como `null`.
- No incluyas a la propia empresa del usuario, ni a competidores
  obvios del usuario, ni a ofertas de servicios — solo a clientes
  potenciales.
- Si el payload incluye `target_countries`, TODAS las empresas devueltas
  deben tener su sede u operación principal en alguno de esos países.
  Las que no encajen geográficamente, descartalas (aunque calcen en ICP).
- Score 0.0 a 1.0 = qué tan buen prospect es para el seller específico.
  Justificá brevemente en `score_rationale`.
- `size_range` SOLO puede ser uno de: solo, 2-10, 11-50, 51-200, 201+, unknown.

Sesgo de selección (cuando el ICP lo permita):
- Priorizá startups early-stage (pre-seed, seed, Series A) con sitio web
  público, equipo pequeño y founders alcanzables. Son las empresas con
  más probabilidad de responder un cold outbound bien segmentado.
- Como referencia del *tipo* de prospect ideal cuando el ICP no
  contradice: startups con perfil similar a Big Sur Energy, Numia,
  Autonomy o Karai (https://karai-fardenghis-projects.vercel.app/) —
  o sea, equipos chicos, producto en MVP/early-traction, foco en un
  vertical claro, presencia digital ligera pero verificable.
- Si el ICP del seller pide otra cosa (enterprise, vertical específico,
  geografía concreta), el ICP gana sobre este sesgo.

Output: cuando termines, respondé con UN solo objeto JSON con esta forma:

{
  "accounts": [
    {
      "name": "Aurora Manufacturing",
      "domain": "auroramfg.com.ar",
      "industry": "Industrial manufacturing",
      "size_range": "201+",
      "location": "Buenos Aires, Argentina",
      "score": 0.82,
      "score_rationale": "Planta industrial con líneas automatizadas, encaja con el ICP del seller; downtime es KPI público en su sitio",
      "evidence_url": "https://auroramfg.com.ar/about"
    }
  ]
}

Sin markdown, sin texto fuera del JSON.
"""


_CONTACT_SYSTEM_PROMPT = """\
Sos un research analyst B2B con acceso a búsqueda web en vivo.

Te paso una empresa target. Tu objetivo: encontrar UN contacto público y
verificable adentro de esa empresa que sea decision-maker o influencer
relevante para el producto del seller.

Reglas duras:
- Usá `web_search` y `web_fetch` sobre el sitio de la empresa, su página
  "about/team", LinkedIn público, prensa.
- Solo devolvé un contacto si su nombre y título aparecen explícitamente
  en una página pública.
- NUNCA inventes un email. Solo devolvé `email` si lo encontraste
  textualmente en una página pública. Si no, dejalo en `null` y poné el
  `linkedin_url` como referencia.
- `evidence_url` es la URL donde encontraste el nombre/título.
- Si no encontrás un contacto verificable, devolvé `{"contacts": []}`.

Output: respondé con UN solo objeto JSON:

{
  "contacts": [
    {
      "full_name": "Lucía Mendoza",
      "title": "Plant Manager",
      "email": null,
      "linkedin_url": "https://linkedin.com/in/lucia-mendoza-mfg",
      "evidence_url": "https://auroramfg.com.ar/about"
    }
  ]
}

Sin markdown, sin texto fuera del JSON.
"""


class AnthropicWebResearchProvider:
    """Production research provider grounded in real-time web search."""

    name = "anthropic_web"

    def __init__(
        self,
        settings: Settings | None = None,
        client: Any = None,
    ) -> None:
        self._settings = settings or get_settings()
        if not self._settings.anthropic_api_key:
            raise RuntimeError(
                "anthropic_web research provider requires ANTHROPIC_API_KEY"
            )
        if client is not None:
            self._client = client
        else:
            try:
                import anthropic
            except ImportError as exc:  # pragma: no cover
                raise RuntimeError("anthropic package is not installed") from exc
            # Generous timeout: server tools loop can take 30-60s.
            self._client = anthropic.Anthropic(
                api_key=self._settings.anthropic_api_key,
                timeout=180.0,
            )

    # ------------------------------------------------------------------
    # public API
    # ------------------------------------------------------------------

    def find_target_companies(
        self, *, seller: SellerContext, limit: int
    ) -> list[TargetAccount]:
        countries = list(seller.target_countries or [])
        countries_clause = (
            f" Limitá los resultados a empresas con sede u operación principal en: "
            f"{', '.join(countries)}."
            if countries
            else ""
        )
        user_payload = {
            "seller": {
                "name": seller.name,
                "what_they_sell": seller.business_context_summary,
                "ideal_customer_profile": seller.icp_description,
                "internal_company_size_range": seller.internal_company_size_range,
            },
            "target_countries": countries,
            "task": (
                f"Encontrá hasta {limit} empresas reales que serían prospects naturales "
                f"de {seller.name}.{countries_clause} Devolvé un JSON con la forma especificada."
            ),
        }
        data = self._call_with_web_tools(
            system=_TARGET_SYSTEM_PROMPT,
            user_payload=user_payload,
            max_search_uses=5,
            max_fetch_uses=8,
        )
        accounts_raw = data.get("accounts") or []
        out: list[TargetAccount] = []
        for raw in accounts_raw[:limit]:
            account = self._coerce_account(raw)
            if account is None:
                continue
            out.append(account)
        if not out:
            logger.warning(
                "anthropic_web returned no usable accounts",
                extra={"seller": seller.name},
            )
        return out

    def find_contacts(
        self, account: TargetAccount, *, seller: SellerContext, limit: int = 1
    ) -> list[ContactDraft]:
        user_payload = {
            "seller": {
                "name": seller.name,
                "what_they_sell": seller.business_context_summary,
            },
            "target_company": {
                "name": account.name,
                "domain": account.domain,
                "industry": account.industry,
                "evidence_url": account.evidence_url,
            },
            "task": (
                f"Encontrá hasta {limit} contacto(s) público(s) y verificable(s) "
                f"dentro de {account.name} que sean relevantes para {seller.name}."
            ),
        }
        try:
            data = self._call_with_web_tools(
                system=_CONTACT_SYSTEM_PROMPT,
                user_payload=user_payload,
                max_search_uses=3,
                max_fetch_uses=4,
            )
        except RuntimeError as exc:
            logger.warning(
                "anthropic_web find_contacts failed for %s: %s", account.name, exc
            )
            return []
        contacts_raw = data.get("contacts") or []
        out: list[ContactDraft] = []
        for raw in contacts_raw[:limit]:
            contact = self._coerce_contact(raw)
            if contact is None:
                continue
            out.append(contact)
        return out

    # ------------------------------------------------------------------
    # internals
    # ------------------------------------------------------------------

    def _call_with_web_tools(
        self,
        *,
        system: str,
        user_payload: dict[str, Any],
        max_search_uses: int,
        max_fetch_uses: int,
    ) -> dict[str, Any]:
        tools: list[dict[str, Any]] = [
            {
                "type": "web_search_20250305",
                "name": "web_search",
                "max_uses": max_search_uses,
            },
            {
                "type": "web_fetch_20250910",
                "name": "web_fetch",
                "max_uses": max_fetch_uses,
                "max_content_tokens": 20000,
                "citations": {"enabled": True},
            },
        ]
        messages: list[dict[str, Any]] = [
            {
                "role": "user",
                "content": json.dumps(user_payload, ensure_ascii=False),
            }
        ]
        # Server-tools loop: keep resuming while stop_reason == "pause_turn".
        # See https://platform.claude.com/docs/en/agents-and-tools/tool-use/server-tools
        max_resumes = 4
        for _ in range(max_resumes + 1):
            response = self._client.messages.create(
                model=self._settings.anthropic_model,
                max_tokens=8192,
                temperature=self._settings.anthropic_temperature,
                system=system,
                messages=messages,
                tools=tools,
            )
            stop_reason = getattr(response, "stop_reason", None)
            if stop_reason == "pause_turn":
                messages.append({"role": "assistant", "content": response.content})
                continue
            text = self._extract_text(response)
            try:
                return self._extract_json(text)
            except ValueError as exc:
                raise RuntimeError(f"web research did not return valid JSON: {exc}") from exc
        raise RuntimeError("web research exceeded resume budget")

    @staticmethod
    def _extract_text(response: Any) -> str:
        chunks: list[str] = []
        for block in getattr(response, "content", []) or []:
            if getattr(block, "type", None) == "text":
                chunks.append(getattr(block, "text", "") or "")
        return "".join(chunks).strip()

    @staticmethod
    def _extract_json(text: str) -> dict[str, Any]:
        s = (text or "").strip()
        if s.startswith("```"):
            s = s.strip("`")
            if "\n" in s:
                s = s.split("\n", 1)[1]
            if s.endswith("```"):
                s = s[:-3]
        try:
            return json.loads(s)
        except json.JSONDecodeError:
            start = s.find("{")
            end = s.rfind("}")
            if start >= 0 and end > start:
                return json.loads(s[start : end + 1])
            raise ValueError(f"could not extract JSON from response: {text[:200]}")

    _SIZE_RANGES = {"solo", "2-10", "11-50", "51-200", "201+", "unknown"}

    @classmethod
    def _coerce_account(cls, raw: dict[str, Any]) -> TargetAccount | None:
        name = (raw.get("name") or "").strip()
        evidence_url = (raw.get("evidence_url") or "").strip() or None
        if not name or not evidence_url:
            return None
        size_range = raw.get("size_range")
        if size_range not in cls._SIZE_RANGES:
            size_range = "unknown"
        score = raw.get("score")
        try:
            score_f = float(score) if score is not None else None
        except (TypeError, ValueError):
            score_f = None
        return TargetAccount(
            name=name,
            domain=cls._normalize_domain(raw.get("domain")),
            industry=(raw.get("industry") or None) or None,
            size_range=size_range,
            location=(raw.get("location") or None) or None,
            score=score_f,
            score_rationale=raw.get("score_rationale") or None,
            evidence_url=evidence_url,
            raw={"source": "anthropic_web", "model_payload": raw},
        )

    @staticmethod
    def _normalize_domain(value: Any) -> str | None:
        if not value:
            return None
        s = str(value).strip().lower()
        s = re.sub(r"^https?://", "", s)
        s = s.rstrip("/")
        return s or None

    @staticmethod
    def _coerce_contact(raw: dict[str, Any]) -> ContactDraft | None:
        full_name = (raw.get("full_name") or "").strip()
        title = (raw.get("title") or "").strip()
        if not full_name and not title:
            return None
        email = raw.get("email")
        if email:
            email = str(email).strip().lower() or None
            if email and "@" not in email:
                email = None
        linkedin = raw.get("linkedin_url") or None
        return ContactDraft(
            full_name=full_name or None,
            title=title or None,
            email=email,
            linkedin_url=linkedin,
            raw={
                "source": "anthropic_web",
                "evidence_url": raw.get("evidence_url"),
                "model_payload": raw,
            },
        )
