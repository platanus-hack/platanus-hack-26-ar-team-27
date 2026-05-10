# GTM B2B MVP — team-27 · Platanus Hack 26 Buenos Aires

<img src="./project-logo.png" alt="Project Logo" width="200" />

**Track:** 🗼 Vertical AI

**Equipo:**
- Santiago Bassi ([@santiagoBassi](https://github.com/santiagoBassi))
- Filipo Ardenghi ([@fardenghi](https://github.com/fardenghi))
- Ignacio Maruottolo ([@riboplant](https://github.com/riboplant))
- Conrado Hillar ([@conradohillar](https://github.com/conradohillar))
- Ezequiel Testoni ([@EzequielTestoni](https://github.com/EzequielTestoni))

---

## ¿Qué problema resuelve?

Lanzar outbound B2B desde cero requiere semanas de trabajo manual: comprar dominios, configurar DNS y Mailgun, calentar los dominios para no caer en spam, investigar prospects y redactar emails personalizados. La mayoría de las startups en etapa temprana no tienen ni el tiempo ni el expertise para hacerlo bien, y las agencias que lo hacen cobran miles de dólares al mes.

**GTM B2B MVP automatiza ese pipeline completo** — desde el diagnóstico del negocio hasta el email enviado — con un sistema multi-agente que toma decisiones autónomas en cada etapa y requiere aprobación humana solo donde importa.

---

## ¿Por qué es diferente?

Las herramientas existentes (Apollo, Instantly, Lemlist) automatizan partes del proceso: prospecting, o envío, o warming. **Ninguna cierra el loop completo** desde infraestructura de dominio hasta campaña enviada dentro de un único sistema agentivo.

Este proyecto es distinto en cuatro aspectos:
1. **Pipeline unificado**: 5 agentes encadenados cubren todo el ciclo de vida GTM sin intervención manual entre etapas.
2. **Seguridad by default**: cada acción real (compra de dominio, envío de email, deploy de blog) requiere un flag de entorno explícito + `execute=true` en el request. Sin eso, todo corre en dry-run y es 100% auditable.
3. **Ownership de infraestructura**: configura DNS y Mailgun sobre dominios propios (pool de dominios pre-cargados), sin depender de plataformas de terceros que pueden suspender la cuenta.
4. **Content marketing incluido**: además del outbound, el sistema genera un blog editorial personalizado para la empresa (con Anthropic) y lo despliega automáticamente en Vercel bajo `blog.<dominio>`, creando un activo de contenido desde el primer día sin trabajo manual.

---

## Arquitectura

```
              ┌───────────────────────────────┐
              │  Next.js Frontend (Vercel)    │
              │  landing · onboarding · stage │
              │  dashboard · email preview    │
              └──────────────┬────────────────┘
                             │ HTTP / SSE
                      ┌──────▼───────────────────┐
                      │  FastAPI / Typer CLI      │
                      └─────────────┬────────────┘
                                    │
                   ┌────────────────▼──────────────────┐
                   │             services/             │
                   │  diagnostic · domain · dns        │
                   │  warmup · campaign · blog         │
                   │  webhook · attachment             │
                   └─────────┬──────────────┬──────────┘
                             │              │
                             ▼              ▼
                   ┌──────────────┐   ┌──────────────┐
                   │ AgentRunner  │   │ Safety service│
                   │ + ToolRegistry│  │ (flags, caps, │
                   └──────┬───────┘   │  audit log)  │
                          │           └──────────────┘
        ┌─────────────────┼──────────────────────────────────┐
        ▼                 ▼                 ▼                 ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ Anthropic    │  │ Porkbun /    │  │ Mailgun REST │  │ Vercel REST  │
│ Messages API │  │ Spaceship    │  │ (email infra)│  │ (blog deploy)│
│ + web_search │  │ (DNS/reg)    │  └──────────────┘  └──────────────┘
└──────────────┘  └──────────────┘
                        persistence
                   ┌──────────────────┐
                   │ Supabase Postgres│
                   └──────────────────┘
```

### Los 5 agentes

| Agente | Qué hace | Output |
|--------|----------|--------|
| **GTM Diagnostic** | Analiza el negocio, ICP, propuesta de valor | `GtmDiagnostic` |
| **Domain Purchase** | Evalúa disponibilidad y registra dominios (Porkbun / Spaceship) | `DomainPurchaseSummary` |
| **DNS Configuration** | Crea el dominio en Mailgun y configura registros MX/SPF/DKIM/DMARC | `DnsSummary` |
| **Warmup Lite** | Simula intercambio de emails entre dominios para reputación | `WarmupSummary` |
| **Research & Send** | Descubre prospects vía Anthropic `web_search` en tiempo real, puntúa por fit score + señal web, redacta y envía emails personalizados con URL de evidencia | `ResearchSendSummary` |

Todos los agentes corren sobre un `AgentRunner` genérico con Anthropic SDK (tool use estructurado). El `SafetyService` intercepta cada tool call que tenga efecto externo real y valida feature flags, caps y supresión antes de ejecutar.

Además del pipeline de 5 agentes, el sistema incluye un **Blog Service** post-pipeline que genera HTML editorial personalizado para la empresa usando Anthropic, lo despliega en Vercel y apunta `blog.<dominio>` con un CNAME en Spaceship — todo desde el dashboard en un clic.

### Lifecycle de dominio

```
dry_run_planned → purchased → dns_pending → dns_verified → active_for_demo → active
                                                                                │
                                                                           paused / burned
```

### Lifecycle de campaña

```
researching → ready_to_draft → drafts_pending → approved → sent / dry_run_sent
```

---

## Stack técnico

| Capa | Tecnología |
|------|------------|
| Frontend | Next.js + TypeScript + Tailwind (deploy: Vercel) |
| API | FastAPI + Pydantic v2 |
| CLI | Typer (mismo código que la API) |
| Agentes | Anthropic SDK (tool use + `web_search` / `web_fetch`) |
| ORM / migraciones | SQLAlchemy + Alembic |
| Base de datos | Supabase Postgres (SQLite en tests) |
| Registradores DNS | Porkbun REST API · Spaceship REST API |
| Email infra | Mailgun (dominios, warming, envío, webhooks HMAC) |
| Blog deploy | Vercel REST API (deploy + dominio custom) |
| Tests | pytest + respx mocks (sin hits a APIs reales) |
| Deploy backend | Render (Python Web Service, `render.yaml` Blueprint) |

---

## Impacto potencial

- **Mercado objetivo**: startups B2B en etapa seed/early que necesitan outbound pero no tienen SDRs ni budget para agencias
- **Tiempo ahorrado**: la configuración manual del pipeline completo (dominio → DNS → warming → campaña → blog) toma entre 1 y 3 semanas; el sistema lo hace en minutos
- **Democratización**: hace accesible una práctica GTM profesional a equipos de 2-5 personas sin experiencia en infraestructura de email — incluyendo content marketing con blog propio en producción desde el día 1
- **Targeting preciso**: el agente de research filtra prospects por países objetivo y sesga hacia empresas en etapa temprana, maximizando la relevancia del outbound para startups que venden a otras startups

---

## Quickstart

```bash
# Backend
cd backend
python3.11 -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env       # completar keys
alembic upgrade head
uvicorn app.main:app --reload --port 8000

# Frontend (en otra terminal)
cd frontend
pnpm install
pnpm dev                   # http://localhost:3000
```

Ver [`backend/README.md`](backend/README.md) para documentación completa de instalación, CLI y deploy.

---

## Repo layout

```
backend/        FastAPI service (app, alembic, tests, docs, examples, cli)
frontend/       Next.js UI — landing, onboarding, stage (agentes en vivo), dashboard, email preview
openspec/       Historial de cambios spec-driven
context/        Briefs e instrucciones usadas para generar el MVP
render.yaml     Blueprint de deploy en Render (rootDir: backend)
```
