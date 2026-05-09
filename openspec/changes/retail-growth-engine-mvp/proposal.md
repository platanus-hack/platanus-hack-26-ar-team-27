## Why

Retailers B2C que quieren correr ads pagos en Meta hoy tienen que pasar por agencias caras o herramientas genéricas (AdCreative.ai, Pencil, Smartly) que no entienden ni el catálogo ni la marca: producen creatividades genéricas y no resuelven el último kilómetro (creator outreach). El MVP de hackathon (48hs) construye un sistema end-to-end donde el usuario carga su catálogo + brief de marca y ve agentes trabajando en vivo: priorizan SKUs, generan ads (imagen + copy) específicos para esa marca, y arman una lista curada de creadores con DMs personalizados listos para enviar.

El valor demoable está en el flujo end-to-end visible y en la combinación catálogo+marca produciendo outputs únicos — no en lanzar ads reales en producción.

## What Changes

- Crea desde cero el repo del producto (Next.js 14 + Supabase + Vercel AI SDK + Replicate).
- Onboarding que acepta CSV de catálogo + brand brief (form de texto o upload de archivo TXT/MD/PDF).
- **Strategy Agent** (Claude Sonnet 4.5) que analiza catálogo + brief y devuelve hero SKUs, ICP, y categorías detectadas.
- **Creative Engine** que genera 9 ads por hero SKU (3 imágenes via Replicate Flux Kontext × 3 copys via GPT-4o-mini).
- **Influencer Matching Agent** que consulta una base seed de ~100 creadores reales pre-curados (5 categorías × 20), rankea match contra ICP, y genera DM personalizado por creador usando data scrapeada real (bio + último post).
- **Agent Event Bus** con SSE: cada agente emite eventos (started, tool-called, token, artifact-created, completed) que el frontend renderiza como UI de "agentes trabajando".
- **Launch a Meta** mockeado (UI bonita con animación, sin Marketing API real).
- Dashboard final con galería de ads + cards de influencers con DMs.
- **No incluido (cortado del plan original):** Optimizer agent, métricas reales, integración Meta Ads API, conector Shopify, generación de video, multi-canal.

## Capabilities

### New Capabilities
- `catalog`: Ingesta de catálogo CSV, parsing tolerante, almacenamiento de productos con foto, precio, stock, categoría.
- `brand-brief`: Captura del contexto de marca via form o archivo (TXT/MD/PDF), extracción estructurada de tono, target, valores y reglas con LLM.
- `strategy-agent`: Agente que analiza catálogo + brief y produce hero SKUs priorizados, ICP estructurado, y categorías detectadas que alimentan el matching de influencers.
- `creative-engine`: Pipeline de generación de creatividades por SKU — 3 prompts de imagen × image-to-image en Replicate × 3 variantes de copy = 9 ads por SKU.
- `influencer-matching`: Base seed de creadores reales scrapeados, agente de matching contra ICP por similaridad semántica + filtros, y generación de DMs personalizados anclados solo en data real del creador.
- `agent-event-bus`: Sistema de eventos en vivo (SSE) que cada agente publica y el frontend consume para renderizar la UX de "agentes trabajando".
- `launch-mock`: Pantalla y flujo simulado de lanzamiento a Meta con animación realista, sin llamadas a Marketing API.
- `dashboard`: Vista consolidada del proyecto — ads generados, influencers matched con DMs, estado de "campaña lanzada" mock.

### Modified Capabilities
<!-- Ninguna: este es un proyecto greenfield; no hay specs previas. -->

## Impact

- **Código nuevo:** repo completo (`app/`, `lib/`, `agents/`, `db/`). Greenfield, sin código existente que romper.
- **Stack y dependencias nuevas:** Next.js 14, TypeScript, Tailwind, shadcn/ui, Vercel AI SDK, LangGraph (TS), Supabase JS, Replicate JS SDK, pdf-parse, Anthropic SDK, OpenAI SDK.
- **Servicios externos a aprovisionar:** proyecto Supabase (Postgres + Storage + pgvector), cuenta Replicate con créditos, API keys Anthropic + OpenAI, Vercel project, Apify (o método elegido) para scraping seed de influencers.
- **Datos seed:** ~100 creadores reales scrapeados pre-demo (5 categorías × 20: moda, beauty, fitness/wellness, hogar/deco, food/bebida) con bio, último post resumido, engagement, embedding.
- **Riesgos asumidos:** generación de imagen lenta (mitigado con stream incremental + pre-cache para demo), DMs alucinados (mitigado con prompt que restringe referencias a campos reales), scraping de creadores caro o lento (mitigado pre-cargando antes del demo).
- **Equipo:** 5 tracks paralelos. Ver `tasks.md` para asignación.
- **Deadline:** demo del hackathon — 48 horas desde kickoff.
