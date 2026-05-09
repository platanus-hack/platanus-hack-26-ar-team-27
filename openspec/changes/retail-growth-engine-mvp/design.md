## Context

Greenfield repo para hackathon de 48hs (categoría Vertical AI, nicho retail B2C). Equipo de 5 personas equivalentes en skill, paralelizando trabajo. Demo final es **precocinada con teatro pero el sistema debe ser lo más funcional posible**: lo que se mockea son las salidas a sistemas externos riesgosos (Meta Marketing API). Lo que se ejecuta de verdad es la cadena de agentes y la generación de outputs.

Stakeholders:
- **Equipo (5)**: 1 frontend, 1 backend/orquestación, 1 data/ingest, 1 creative, 1 influencer/launch-mock/devops.
- **Jurado del hackathon**: ve un demo de ~3 minutos donde un retailer sube catálogo + brief y obtiene ads + lista de creadores con DMs personalizados.

Constraints:
- 48 horas reloj.
- No hay tiempo para infra custom (queues, brokers, microservicios).
- Image-to-image (Replicate Flux Kontext) es lento (~30-90s/img) y caro: hay que pre-cachear para demo y permitir streaming incremental.
- Meta Business Manager + app aprobada toma 1-3 días → no se puede depender de Marketing API real.

## Goals / Non-Goals

**Goals:**
- Un solo repo, un solo deploy (Vercel), un solo lenguaje (TypeScript) para minimizar overhead.
- Flujo end-to-end real desde upload hasta DMs por creador, con un único punto mockeado (launch a Meta).
- "Agentes trabajando" debe ser **streaming real** de tokens y eventos, no animaciones falsas con setTimeout.
- DMs por creador anclados a data scrapeada real — cero tolerancia a alucinación de actividad de creadores.
- Sistema parametrizable por marca: brand brief debe propagarse a todos los prompts de agentes.

**Non-Goals:**
- Optimizer agent (cortado del scope).
- Métricas reales / polling de Meta Insights.
- Multi-canal (Google, TikTok, Meta), solo Meta como concepto.
- Generación de video.
- Conector Shopify u otros (solo CSV en MVP).
- Multi-tenant production-grade (auth Supabase básica, pero no roles/permisos).
- Rate limiting, observabilidad robusta, tests exhaustivos. Smoke test del happy path es suficiente.
- Soporte de catálogos arbitrariamente grandes (asumimos < 200 SKUs en demo).

## Decisions

### D1. Stack: Next.js 14 (App Router) + TypeScript full-stack
**Decisión:** Frontend + API en un solo repo Next.js, deploy Vercel.
**Por qué:** En 48hs, mover entre dos lenguajes/repos cuesta horas que no tenemos. TypeScript tiene SDKs first-class de Anthropic, OpenAI, Replicate, Vercel AI SDK, LangGraph-TS, Supabase JS.
**Alternativa rechazada:** Python + FastAPI para agentes. Más maduro para AI, pero rompe el repo único y agrega un deploy más.

### D2. Orquestación: Vercel AI SDK + LangGraph-TS
**Decisión:** Vercel AI SDK para tool calling y streaming primitive, LangGraph-TS para orquestación de cadena multi-agent.
**Por qué:** Streaming de tokens es nativo en AI SDK; LangGraph aporta el grafo Strategy → Creative → Influencer con checkpoints.
**Alternativa rechazada:** Solo AI SDK (orquestación a mano). Funciona pero LangGraph nos da pause/resume gratis si lo necesitamos.

### D3. Modelos
- **Strategy Agent + DM Generator + cualquier razonamiento ambiguo:** Claude Sonnet 4.5 (`claude-sonnet-4-5`).
- **Brand brief parsing + copy gen + tareas baratas:** GPT-4o-mini.
- **Imágenes:** Replicate Flux Kontext (image-to-image) para mantener fidelidad del producto.
**Por qué:** Sonnet 4.5 da el mejor razonamiento estructurado para hero SKU prioritization y matching reasoning. GPT-4o-mini es 10x más barato para tareas estructuradas. Flux Kontext es el único modelo accesible que mantiene producto + cambia contexto.

### D4. Persistencia: Supabase (Postgres + Storage + Auth + pgvector)
**Decisión:** Una sola plataforma para DB, storage de imágenes, auth, y embeddings.
**Por qué:** Setup en minutos, una sola env var, free tier generoso.
**Detalle:** `pgvector` se usa **solo** en `influencers.embedding` (matching ICP↔creador). NO se usa en `products` — Strategy Agent recibe el catálogo entero. Esto es un cambio vs. el plan original que tenía embeddings en products sin caso de uso claro.

### D5. Agent Event Bus via SSE (no Redis pub/sub, no Inngest)
**Decisión:** Cada agente emite eventos a un canal SSE por proyecto, expuesto en `GET /api/stream/:projectId`. Backed por una tabla `agent_events` en Postgres como cola simple + LISTEN/NOTIFY de Postgres para fan-out.
**Por qué:** Necesitamos streaming en vivo y persistencia para reconectar. Redis o Inngest agregan deploy y env. Postgres LISTEN/NOTIFY + SSE es suficiente para un proyecto y un cliente.
**Alternativa rechazada:** Inngest (plan original). Bueno para jobs async serios pero overkill aquí — agregamos otra cuenta y otra dashboard que mantener.
**Trade-off:** Si dos navegadores miran el mismo proyecto, ambos reciben los eventos correctamente vía LISTEN/NOTIFY. Si la conexión SSE se cae, el cliente puede reconectar y replay desde `agent_events` por timestamp.

### D6. Eventos del bus (contrato)
```ts
type AgentEvent =
  | { kind: 'agent.started';   agent: AgentName; runId: string }
  | { kind: 'agent.thinking';  agent: AgentName; runId: string; tokens: string } // delta de stream
  | { kind: 'tool.called';     agent: AgentName; runId: string; tool: string; input: unknown }
  | { kind: 'tool.result';     agent: AgentName; runId: string; tool: string; output: unknown }
  | { kind: 'artifact.created'; agent: AgentName; runId: string; type: 'sku'|'creative'|'match'|'dm'; ref: string }
  | { kind: 'agent.completed'; agent: AgentName; runId: string; summary: string }
  | { kind: 'agent.failed';    agent: AgentName; runId: string; error: string }
```
**Por qué:** Contrato compartido entre Frontend (Track 1) y Backend (Track 2). Si esto se acuerda el día 1, ambos tracks paralelizan sin bloquearse.

### D7. Influencer seed data: 5 categorías × 20 creadores reales, scraping con Playwright
**Decisión:** Pre-poblar `influencers` con 100 creadores reales scrapeados (moda, beauty, fitness/wellness, hogar/deco, food/bebida) antes del demo, usando un **script Node standalone con Playwright** (Chromium real) — NO Scrapling ni Apify.
**Por qué:** Benchmark hecho contra IG público (Nike): `Scrapling.get` devolvió vacío, `Scrapling.stealthy_fetch` recibió "Something went wrong" (IG detecta browsers stealth headless), **Playwright con Chromium real pasa** y trae perfil completo (bio, followers, post URLs, location). Apify pre-built scrapers funcionan pero cuestan $5-30/run y agregan cuenta extra; con 100 perfiles one-shot, Playwright local es gratis y suficiente.
**Cómo se scrapea (out-of-band, NO en runtime de la app):**
1. CSV `seed-handles.csv` con `handle, platform, category` curado a mano.
2. Script Node: por cada handle, navega `instagram.com/<handle>/`, extrae bio + followers + post URLs (de los 12 visibles), abre 2-3 posts y captura captions.
3. GPT-4o-mini resume captions → `recent_post_summary`.
4. OpenAI `text-embedding-3-small` sobre `bio + recent_post_summary + categories` → `embedding`.
5. Insert batch en Supabase `influencers`.
**Anti-bloqueo:** delays aleatorios 5-10s entre perfiles, rotación de user-agents, total ~1hr de corrida.
**Plan B:** mismo script contra TikTok cambiando selectores; perfil 100% manual si IG bloquea ese día.
**Alternativa rechazada:** Scrapling (bloqueado por IG), Apify ($$$ + cuenta extra), scraping on-demand (lento + riesgo en demo), mocks puros (se nota mucho).

### D8. DM generation: solo data real, contrato anti-alucinación
**Decisión:** El prompt del DM Generator solo recibe campos reales del row del influencer (bio, recent_post_summary, categories) y restringe explícitamente a no inventar referencias.
**Por qué:** El "wow" del DM personalizado se cae si el modelo se inventa que el creador habló de algo. Demo en vivo con un creador inventado = pitch destruido.
**Implementación:** Prompt skeleton incluye reglas duras: "SOLO referenciá datos del bio/contenido reciente arriba. Si no hay info suficiente, hacé un mensaje genérico breve. No inventes nombres de videos/posts."

### D9. Brand brief: form de texto + upload TXT/MD/PDF, parsing por LLM
**Decisión:** Aceptar form libre + upload. Parsear con GPT-4o-mini a estructura definida (`brand_name`, `tone_of_voice`, `target_description`, `values`, `do_not_say`). DOCX queda fuera.
**Por qué:** Los retailers reales tienen brand books en PDF. TXT/MD cubre casos rápidos. Parsing determinista (regex) es frágil vs. parsing con LLM que extrae estructura semántica.

### D10. Launch mock: UI realista, sin Marketing API
**Decisión:** Botón "Launch to Meta" abre modal con animación de "Creating campaign... Creating ad set... Uploading creatives... Live ✓" con timings realistas (10-15s total) y output `mock_meta_id`.
**Por qué:** Meta Marketing API requiere app review. Mock visual + storage del estado en `campaigns` table mantiene la sensación de end-to-end sin el riesgo.

### D11. Pre-cache de demo seed
**Decisión:** Antes del demo, correr el flujo completo sobre el catálogo de demo y cachear todos los outputs (creatives, matches, DMs) en DB. La UI puede correr "en vivo" sobre datos cacheados con replays de eventos del bus.
**Por qué:** Imágenes tardan 90s × 9 ads × 3 hero SKUs = potencialmente 30+ min. En demo de 3 min eso no entra en vivo. Cachear permite "regenerar" con replay rápido.
**Trade-off honesto:** Si querés generar para un catálogo NUEVO en vivo, esperás los tiempos reales. La demo del jurado es sobre el catálogo seed pre-cocinado.

### D12. Schema de DB final
```sql
projects (id, name, owner_id, created_at)

brand_briefs (
  id, project_id, raw_text, source ('form'|'upload'),
  brand_name, tone_of_voice, target_description,
  values jsonb, do_not_say jsonb, created_at
)

products (
  id, project_id, sku, name, description,
  price, cost, stock, category,
  primary_image_url, created_at
)

strategies (
  id, project_id, hero_skus jsonb, icp jsonb,
  detected_categories jsonb, reasoning text, created_at
)

creatives (
  id, project_id, product_id,
  type ('image'|'copy'|'pair'),
  asset_url, copy_text, prompt_used,
  variant_label, status, created_at
)

influencers (  -- pre-poblado, no se modifica desde la app
  id, handle, platform, display_name, avatar_url,
  followers_count, engagement_rate,
  bio, recent_post_summary,
  categories jsonb, audience_demo jsonb,
  embedding vector(1536), scraped_at
)

influencer_matches (
  id, project_id, influencer_id,
  match_score float, match_reasoning text,
  draft_messages jsonb,  -- { initial: "...", follow_up: "..." }
  recommended_skus jsonb,
  status ('proposed'|'sent'|'replied'), created_at
)

campaigns (  -- mock launch
  id, project_id, mock_meta_id,
  status ('preparing'|'live'|'paused'),
  creative_ids jsonb, created_at
)

agent_events (  -- event bus persistencia
  id bigserial, project_id, run_id,
  agent text, kind text, payload jsonb,
  created_at timestamptz default now()
)
```

### D13. Sin auth en MVP
**Decisión:** Sin login. Un único `project_id` implícito por sesión (cookie con UUID). Cualquiera con la URL accede al dashboard.
**Por qué:** Hackathon. Auth mata 4-6h y no aporta a la demo. Si querés "multi-proyecto", basta con cambiar la cookie.
**Trade-off:** No hay multi-tenancy, no hay roles. Aceptable para demo. RLS de Supabase queda abierta para `anon` con filtro por `project_id` en queries.

### D14. DMs con follow-up
**Decisión:** El DM Generator produce dos mensajes por creador: `initial_message` (primer contacto) y `follow_up_message` (a enviar 3-5 días después si no responde). Ambos persisten en `influencer_matches` (campo `draft_messages jsonb` en lugar de `draft_message text`).
**Por qué:** El follow-up bien hecho duplica la tasa de respuesta en outreach a creadores. Mostrarlo en demo refuerza el "no es solo un primer mensaje, es una secuencia".
**Reglas anti-alucinación:** mismas que el initial. El follow-up referencia el initial implícitamente ("hace unos días te escribí sobre...") pero NO inventa contexto nuevo.
**UX:** card del influencer con dos tabs/botones: "Initial DM" / "Follow-up". Por default abre Initial.

### D15. Visual identity de "agentes trabajando"
**Decisión:** Stage central tipo cockpit con cards horizontales para cada agente (Strategy / Creative / Influencer / Launch). El agente activo se ilumina con borde gradient animado, los completados quedan con check, los pendientes en gris claro. Debajo del agente activo, una zona de "live thinking" muestra:
- tokens del LLM apareciendo letra por letra (Vercel AI SDK `useChat` style),
- chips de tools llamadas con su input (ej. `→ get_products(project_id)`),
- artifacts emergentes flotando hacia las secciones correspondientes del dashboard (Framer Motion `layoutId` para la animación).

Aesthetic: oscuro elegante (slate-950 background), accent color por agente (Strategy=violet, Creative=fuchsia, Influencer=cyan, Launch=emerald), tipografía mono para los tokens de razonamiento, sans para todo lo demás. Inspiración: V0/Vercel AI Playground, Linear's command palette, Cursor's agent panel.
**Por qué simple:** todo lo visual sale de shadcn + Tailwind + Framer Motion. Cero ilustraciones custom.
**Por qué llamativo:** la animación de tokens streaming + artifacts flotando hacia su lugar es lo que distingue una demo "AI" memorable de un dashboard cualquiera.

## Risks / Trade-offs

- **[Tiempo de imagen >> tiempo de demo]** → Pre-cache de seed + streaming incremental para demos en vivo. El primer ad aparece en pantalla a los ~30s, el resto va llenando.
- **[DMs alucinados destruyen el wow]** → Prompt restrictivo + post-validation: filtrar el DM y rechazar si menciona títulos de posts no presentes en `recent_post_summary` (heurística simple, no infalible).
- **[Scraping de creadores caro/lento]** → Hacerlo el día 1 una sola vez, persistir en DB, no depender de re-scrapeo.
- **[Brand brief parsing genera estructura incompleta]** → El parser-LLM debe fallback a "extraer lo que se pueda" + dejar campos vacíos. Strategy y Creative agents deben tolerar campos vacíos sin romper.
- **[Catálogo CSV mal formateado en demo distinto]** → Schema fijo en demo (`sku, name, description, price, cost, stock, category, image_url`), parser tolera columnas faltantes con warning, no crash.
- **[SSE se cae mid-demo]** → Cliente reconecta y replay desde `agent_events` por `run_id`. Frontend debe ser idempotente al recibir eventos repetidos.
- **[Replicate sin créditos en demo]** → Tener cuenta backup + flag `MOCK_IMAGE_GEN=true` que devuelve placeholders pre-armados.
- **[Vercel cold start mata streaming]** → Deploy temprano, pingear cada 5min antes de la demo para mantener warm; o usar Edge Functions para los endpoints SSE.
- **[Race condition entre Strategy y Creative]** → LangGraph maneja secuencia. No paralelizamos Strategy con Creative; sí paralelizamos las 9 imágenes dentro de Creative para un mismo SKU.
- **[Gastar todos los créditos de Replicate en pruebas]** → Flag de mock + budget cap manual. Cada track pone el flag en true cuando no está testeando flujos de imagen.

## Migration Plan

N/A — proyecto greenfield. Steps de bootstrap (no migración):

1. Crear proyecto Vercel + Supabase + cuenta Replicate + API keys (Anthropic + OpenAI + Apify).
2. Compartir env vars en Vercel project settings.
3. Aplicar schema SQL inicial (`supabase/migrations/001_init.sql`).
4. Habilitar `pgvector` extension en Supabase.
5. Correr scraper de seed de influencers una vez (out-of-band script).
6. Smoke test de cada agente contra DB antes de wireear el frontend.

Rollback: borrar el proyecto Vercel + Supabase. Greenfield = trivial.

## Open Questions

- **CERRADAS** — auth: ninguna (D13). DMs: con follow-up (D14). Visual: cockpit oscuro con stage de agentes (D15). Scraping: Playwright (D7).
- Catálogo de demo seed real: queda como placeholder generado (`/seed/demo-catalog.csv`, 12 SKUs ficticios de moda femenina con imágenes Unsplash) hasta que el equipo lo reemplace con uno descargado.
- ¿La animación específica del Launch mock (timing exacto, sonido, microcopy)? → cae bajo Track 1, criterio simple+llamativo de D15.
- ¿Se puede regenerar el follow-up DM independientemente del initial sin re-correr todo el matching? → Sí; endpoint `POST /api/influencers/:matchId/regenerate-followup` queda en backlog.
