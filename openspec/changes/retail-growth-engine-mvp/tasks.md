> **Cómo usar este archivo:** las tareas están agrupadas por orden de dependencia, pero al lado de cada grupo hay una asignación tentativa a uno de los 5 tracks paralelos. Trabajar de a olas: ola 0 (setup compartido) → ola 1 (foundations en paralelo) → ola 2 (agentes) → ola 3 (UI viva + integración) → ola 4 (demo polish).
>
> **Tracks:**
> - **T1**: Frontend + Agent UX
> - **T2**: Backend orquestación + Strategy + Influencer agents + Event bus
> - **T3**: Data: catalog, brand brief, scraping seed influencers
> - **T4**: Creative Engine
> - **T5**: DM finishing + Launch mock + DevOps + demo seed

## 1. Ola 0 — Setup compartido (todos, primeras 2hs)

- [ ] 1.1 Crear repo, init Next.js 14 (App Router) + TypeScript + Tailwind + shadcn/ui
- [ ] 1.2 Crear proyecto Supabase (Postgres + Storage), habilitar extensión `pgvector`
- [ ] 1.3 Crear proyecto Vercel y conectar al repo (deploy preview activo)
- [ ] 1.4 Crear cuentas y obtener API keys: Anthropic, OpenAI, Replicate, Apify
- [ ] 1.5 Compartir env vars en Vercel project settings y `.env.local.example`
- [ ] 1.6 Instalar dependencias core: `@supabase/supabase-js`, `@anthropic-ai/sdk`, `openai`, `replicate`, `ai` (Vercel AI SDK), `@langchain/langgraph`, `pdf-parse`
- [ ] 1.7 Aplicar migration `supabase/migrations/001_init.sql` con todas las tablas del design (D12)
- [ ] 1.8 Acordar y commitear el contrato `AgentEvent` en `lib/events/types.ts` (D6) — desbloquea T1 y T2 paralelos

## 2. Ola 1 — Foundations paralelas

### T2 — Agent event bus (CRÍTICO, primero del día 1)
- [x] 2.1 Crear tabla `agent_events` y trigger de `pg_notify` en migration
- [x] 2.2 Implementar publisher `lib/events/publish.ts` (insert + notify)
- [x] 2.3 Implementar endpoint `GET /api/stream/:projectId` con SSE + LISTEN
- [x] 2.4 Implementar replay de eventos previos por `runId` y `last_event_id`
- [x] 2.5 Smoke test: publicar evento desde script y recibirlo en cliente curl

### T3 — Catalog + brand brief
- [x] 2.6 Implementar `POST /api/catalog` con parser CSV tolerante (papaparse) — endpoint scaffold es `/api/catalog`, no `/upload`
- [ ] 2.7 UI de upload de CSV con drag-drop, validación 5MB, feedback de filas cargadas (track/2-frontend-launch)
- [x] 2.8 Implementar `POST /api/brief` con TXT/MD/PDF (pdf-parse)
- [x] 2.9 Implementar parser semántico de brief con GPT-4o-mini → estructura `brand_briefs`
- [ ] 2.10 UI de form de brief (textarea + alternativa upload) (track/2-frontend-launch)

### T3 — Seed de influencers con Playwright (paralelo, día 1 mañana)
- [ ] 2.11 Definir las 5 categorías y los criterios de selección (followers > 10k, engagement > 2%)
- [ ] 2.12 Curar manualmente 100 handles (20 × 5 categorías) y dump a `scripts/seed/seed-handles.csv`
- [ ] 2.13 Script `scripts/seed/scrape-influencers.ts` con Playwright (Chromium real headful) que por handle: navega `instagram.com/<handle>/`, extrae bio, followers, post URLs, abre 2-3 posts y captura captions; delay aleatorio 5-10s entre perfiles
- [ ] 2.14 Fallback: si IG bloquea, mismo script contra TikTok (`tiktok.com/@<handle>`) cambiando selectores
- [ ] 2.15 Resumir captions con GPT-4o-mini → `recent_post_summary`
- [ ] 2.16 Generar embeddings (`text-embedding-3-small`) sobre `bio + recent_post_summary + categories`
- [ ] 2.17 Cargar batch en `influencers` table (insert único)

### T1 — UI shell + visual identity
- [ ] 2.18 Layout principal stage-style (slate-950 fondo, header minimalista, sin sidebar — un solo proyecto activo por sesión)
- [ ] 2.19 Pantalla de onboarding (3 pasos: catálogo → brief → confirmar)
- [ ] 2.20 Hook `useAgentStream(projectId)` que consume SSE y mantiene state local
- [ ] 2.21 Componente `<AgentStage>`: 4 cards horizontales (Strategy/Creative/Influencer/Launch) con accent colors (violet/fuchsia/cyan/emerald) y borde gradient animado para el activo
- [ ] 2.22 Componente `<LiveThinking>` debajo del agente activo: tokens streaming letra por letra (mono font) + chips de tools llamadas
- [ ] 2.23 Animación de artifacts emergiendo del stage hacia las secciones del dashboard (Framer Motion `layoutId`)
- [ ] 2.24 Stub del dashboard con slots vacíos (hero SKUs, ad gallery, influencer cards)
- [ ] 2.25 Sin login: el primer hit del root crea cookie `project_id` con UUID y redirige al dashboard

### T4 — Pipeline de imagen (mockeada por default; NVIDIA después)
- [x] 2.26 Wrapper único `generateImage()` en `lib/agents/creative/image-gen.ts` (ya scaffoldeado) — todo caller pasa por acá
- [x] 2.27 Flag `MOCK_IMAGE_GEN=true` por **default**: devuelve placeholders Unsplash de `lib/mocks/images.ts` sin llamar a ningún modelo externo
- [x] 2.28 Helpers de copy gen con GPT-4o-mini (3 frameworks: PAS / AIDA / curiosity)
- [ ] 2.28a (Post-MVP / cuando se decida) Integrar modelo NVIDIA gratis dentro de `generateImage()` — identificar modelo concreto (NIM, edify, SD via NGC) y wrapearlo

### T5 — DevOps + scaffolding launch mock + demo catalog
- [ ] 2.29 CI básica: typecheck en push, deploy preview en PR
- [ ] 2.30 Configurar Vercel para mantener Edge Functions warm (cron ping cada 5min)
- [ ] 2.31 Componente `<LaunchAnimation>` con los 4 pasos y timings (3-5s c/u, accent emerald)
- [ ] 2.32 Endpoint `POST /api/campaigns/launch-mock` que persiste y emite eventos al bus
- [ ] 2.33 Generar catálogo de prueba placeholder en `scripts/seed/demo-catalog.csv` (12 SKUs ficticios moda femenina con imágenes Unsplash) — para validar parser; el equipo lo reemplaza después con uno descargado real

## 3. Ola 2 — Agentes (depende de bus + DB ready)

### T2 — Strategy Agent
- [x] 3.1 Setup grafo LangGraph base con un nodo Strategy — simplificado: pipeline lineal con 2 tool-calls determinísticos antes del LLM (no requiere LangGraph para 1 nodo, evita overhead)
- [x] 3.2 Tools: `get_products(project_id)`, `get_brand_brief(project_id)` (lib/agents/strategy/tools.ts)
- [x] 3.3 System prompt de Strategy con campos del brief inyectados
- [x] 3.4 Streaming de tokens al bus vía Anthropic SDK (publishEvent agent.thinking por delta)
- [x] 3.5 Output schema: `hero_skus, icp, detected_categories, reasoning` validado con StrategyOutputSchema
- [x] 3.6 Endpoint `POST /api/strategy` que dispara el agente (path /strategy en lugar de /strategy/generate por consistencia con scaffold)
- [x] 3.7 Persistir output en `strategies` + emit artifact.created por hero SKU + agent.completed

### T4 — Creative Engine
- [x] 3.8 Generador de 3 prompts de imagen por SKU (lifestyle / contexto / comparativa) usando brief + SKU
- [x] 3.9 Pipeline: por cada SKU → 3 imágenes en paralelo en Replicate → emitir `artifact.created` por imagen
- [x] 3.10 Por cada imagen → 3 copys (PAS / AIDA / curiosity) → emitir `artifact.created` por copy
- [x] 3.11 Persistir cada output en `creatives` con `status='ready'` o `'failed'`
- [x] 3.12 Endpoint `POST /api/creatives/generate-batch` que toma `hero_skus` y dispara generación
- [x] 3.13 Manejo de SKU sin imagen: skip image-gen, copy-only con placeholder

### T2/T5 — Influencer Matching + DM Generator
- [ ] 3.14 Calcular embedding del ICP (concat de campos relevantes) en runtime
- [ ] 3.15 Tool `match_influencers(icp, detected_categories)`: query a `influencers` con cosine similarity + filtro categoría + filtro audiencia
- [ ] 3.16 Top 5 matches con `match_score` + `match_reasoning` (LLM explica por qué)
- [ ] 3.17 DM Generator initial: prompt skeleton de design D8 con reglas anti-alucinación
- [ ] 3.18 DM Generator follow-up: segundo prompt que produce mensaje 3-5 días después, con valor agregado y mismas reglas anti-alucinación (D14)
- [ ] 3.19 Generar `recommended_skus` por match (LLM elige 1-3 del catálogo)
- [ ] 3.20 Validador post-LLM: si initial o follow-up mencionan títulos no presentes en `recent_post_summary`, regenerar una vez
- [ ] 3.21 Persistir cada match en `influencer_matches` con `draft_messages = { initial, follow_up }` y emitir `artifact.created` por match
- [ ] 3.22 Endpoint `POST /api/influencers/match` que dispara el agente

## 4. Ola 3 — UI viva e integración end-to-end

### T1 — UI de outputs
- [ ] 4.1 Componente `<HeroSkusSection>` con tags por SKU prioritario
- [ ] 4.2 Componente `<AdGallery>` agrupado por hero SKU, 9 ads con `variant_label` visible, lazy load
- [ ] 4.3 Componente `<InfluencerCard>` con avatar, handle, métricas, match_score, botón "Ver DMs"
- [ ] 4.4 `<DmPanel>` expandible con dos tabs (Initial / Follow-up), cada uno con su mensaje + botón "Copiar"; tab Follow-up con nota "Enviar 3-5 días después si no responde"
- [ ] 4.5 Botón "Launch to Meta" en dashboard que abre `<LaunchAnimation>`
- [ ] 4.6 Estado vacío y estados de loading por sección

### T1+T2 — Orquestación end-to-end
- [ ] 4.7 Wizard de onboarding dispara: catalog upload → brief parse → Strategy automáticamente
- [ ] 4.8 Strategy completado dispara automáticamente: Creative Engine + Influencer Matching en paralelo
- [ ] 4.9 Reconexión SSE robusta: cliente recupera el run activo al recargar
- [ ] 4.10 Indicador global de "X agentes trabajando" en el header

## 5. Ola 4 — Demo polish y plan B

### T5 — Pre-cache de demo
- [ ] 5.1 Definir el catálogo de demo (10-15 SKUs reales con fotos buenas) y el brief de demo
- [ ] 5.2 Correr el flujo completo end-to-end sobre el seed y verificar todos los outputs
- [ ] 5.3 Snapshot de los `agent_events` de la corrida para replay determinista en demo
- [ ] 5.4 Modo "demo replay" que reproduce los eventos snapshot con timing original

### T1 — Polish visual
- [ ] 5.5 Animaciones de aparición de cards (Framer Motion o equivalente)
- [ ] 5.6 Microcopy en español pulido en todos los empty states y labels
- [ ] 5.7 Estados de error visibles pero no asustadores

### Todos — Smoke test final
- [ ] 5.8 Correr el flujo completo en deploy de Vercel con el catálogo de demo
- [ ] 5.9 Validar que no hay requests salientes a Meta
- [ ] 5.10 Validar que el bus replay funciona si SSE se cae mid-demo
- [ ] 5.11 Plan B: video pre-grabado de la demo guardado offline
- [ ] 5.12 Backup de DB con seed completo (catálogo + brief + influencers)
