# AI Retail Growth Engine — Implementation Plan (Hackathon MVP)

> **Contexto:** Sistema autónomo que ingiere un catálogo de retail B2C, genera ads personalizados por SKU, los lanza en Meta y los optimiza solo.
La categoria de la hackathon es Vertical AI y la idea es atacar el nicho del go to market de empresas B2C Retail.

---

## 1. Decisiones Técnicas

### Stack elegido

| Capa | Tecnología | Por qué |
|---|---|---|
| Frontend | **Next.js 14 (App Router) + TypeScript** | SSR, deploy 1-click en Vercel, ecosistema enorme |
| UI | **Tailwind + shadcn/ui** | Velocidad, look profesional sin diseñar |
| Backend / API | **Next.js API Routes + Server Actions** | Un solo repo, menos overhead |
| Agent orchestration | **Vercel AI SDK + LangGraph (TS)** | Tool calling nativo, streaming, multi-agent |
| LLM | **Claude Sonnet 4.5** (razonamiento) + **GPT-4o mini** (tareas baratas) | Mejor balance calidad/costo |
| Image gen | **Replicate API (Flux Kontext / Nano Banana)** | Image-to-image manteniendo fidelidad del producto |
| Vector DB | **Supabase + pgvector** | Postgres + auth + storage + vectores en una |
| DB | **Supabase (Postgres)** | Mismo motivo |
| Queue / async | **Inngest** | Jobs async sin levantar Redis, free tier generoso |
| Auth | **Supabase Auth** | Listo en 5 min |
| Ads API | **Meta Marketing API (Graph API v21)** | Único canal para MVP |
| Deploy | **Vercel** | Push → live |

> **Por qué Next.js full-stack y no Python:** en 48hs un solo repo, un solo deploy, un solo lenguaje gana. Si después necesitás Python para algo pesado lo metés como microservicio.

---

## 2. División del Equipo (5 compus/agentes trbajando tasks independientes, paralelizable)

| # | Rol | Owner | Tracks |
|---|---|---|---|
| 1 | **Frontend Lead** | TBD | UI, dashboard, demo flow, onboarding |
| 2 | **Backend / Agents Lead** | TBD | Orquestación de agentes, prompts, tool calling |
| 3 | **Catalog & Data** | TBD | CSV parser, Shopify connector, DB schema |
| 4 | **Creative Engine** | TBD | Image gen pipeline, copy gen, asset storage |
| 5 | **Ads Integration & DevOps** | TBD | Meta Ads API, deploy, observabilidad, demo data |

---

## 3. Roadmap
- [ ] Deploy inicial en Vercel, env vars compartidas
- [ ] Supabase project + schema base (ver §4)
- [ ] Cuenta de Meta Business + app + token de prueba
- [ ] Cuenta de Replicate + key
- [ ] Definir 1 vertical fake para demo: **moda femenina** (10 SKUs reales con fotos)


- [ ] **Catalog**: CSV parser + UI de upload + storage de imágenes
- [ ] **Frontend**: dashboard skeleton + onboarding + lista de SKUs
- [ ] **Agents**: Strategy Agent (recibe catálogo, devuelve hero SKUs + ICP)
- [ ] **Creative**: pipeline image-to-image funcional (1 SKU → 3 variantes)
- [ ] **Ads**: hello-world contra Meta Ads API (crear ad set en sandbox)


- [ ] Conectar Strategy → Creative → Launch en un flujo real
- [ ] Generar copy variantes con LLM (3 hooks por ad)
- [ ] Crear campaña + ad set + ads reales en cuenta de Meta
- [ ] Optimizer Agent (mock primero: lee métricas fake, decide acción)
- [ ] Dashboard mostrando SKUs + ads generados + estado


- [ ] Animaciones de "agentes trabajando" (UX clave para impresionar)
- [ ] Stream de progreso en vivo (SSE/streaming)
- [ ] Datos seed listos para demo (catálogo + ads pre-generados como fallback)
- [ ] Script de demo de 3 minutos
- [ ] Slides finales (problema, demo, arquitectura, vision)


- [ ] Ensayar pitch 3 veces
- [ ] Plan B si Meta API falla en vivo (video pre-grabado de la demo)
- [ ] Smoke test del flujo completo

---

## 4. Schema de Base de Datos (mínimo viable)

```sql
-- Tenant / proyecto
projects (id, name, created_at, owner_id)

-- Catálogo
products (
  id, project_id, sku, name, description,
  price, cost, stock, category,
  primary_image_url, embedding vector(1536),
  created_at
)

-- Estrategia generada
strategies (
  id, project_id, hero_skus jsonb, icp jsonb,
  channels jsonb, created_at
)

-- Assets generados
creatives (
  id, project_id, product_id,
  type ('image'|'video'|'copy'),
  asset_url, copy_text, prompt_used,
  variant_label, status, created_at
)

-- Campañas lanzadas
campaigns (
  id, project_id, meta_campaign_id,
  meta_adset_id, meta_ad_ids jsonb,
  status, budget, created_at
)

-- Métricas (poll cada X min)
metrics (
  id, campaign_id, creative_id,
  impressions, clicks, ctr, spend, conversions,
  fetched_at
)

-- Decisiones del optimizer
optimizer_actions (
  id, project_id, creative_id,
  action ('pause'|'scale'|'duplicate'|'mutate'),
  reason text, executed_at
)
```

---

## 5. Agentes — Especificación Funcional

### 5.1 Strategy Agent
**Input:** catálogo completo (productos + metadata)
**Tools:** `get_products`, `analyze_margins`, `calc_velocity`
**Output:** JSON con `hero_skus[]`, `icp{age, interests, behaviors}`, `channels[]`
**Modelo:** Claude Sonnet 4.5
**Prompt key:** "Eres un growth strategist de retail B2C. Analiza el catálogo y prioriza SKUs por margen × velocidad × stock."

### 5.2 Creative Engine
**Input:** SKU específico + estrategia + ICP
**Pipeline:**
1. LLM genera 3 prompts de imagen distintos (lifestyle, contexto, comparativa)
2. Replicate (Flux Kontext) hace image-to-image manteniendo el producto
3. LLM genera 3 variantes de copy por imagen (PAS / AIDA / curiosity hook)
4. Resultado: **9 ads por SKU** (3 imágenes × 3 copys)

**Tools:** `generate_image`, `generate_copy`, `save_creative`
**Modelos:** GPT-4o mini para copy (barato), Flux Kontext para imagen

### 5.3 Launch Agent
**Input:** lista de creatives aprobados + budget
**Tools:** `meta_create_campaign`, `meta_create_adset`, `meta_create_ad`, `meta_upload_image`
**Output:** campaign_id + ad_ids
**Detalle:** 1 campaign por proyecto, 1 ad set por hero SKU, N ads por ad set (los 9 creatives)

### 5.4 Optimizer Agent
**Input:** métricas de las últimas 24h por ad
**Reglas duras:**
- CTR < 0.5% después de 1000 impresiones → `pause`
- ROAS > 2x → `scale` (duplicar budget)
- Top 3 ads → `mutate` (generar nuevas variantes basadas en estos)
**Tools:** `get_metrics`, `pause_ad`, `scale_adset`, `trigger_creative_mutation`
**Modelo:** Claude Sonnet 4.5 para casos ambiguos

---

## 6. Endpoints / Server Actions Clave

```
POST /api/projects                      → crear proyecto
POST /api/catalog/upload                → subir CSV, parsear, embeddings
POST /api/strategy/generate             → corre Strategy Agent
POST /api/creatives/generate            → corre Creative Engine para 1 SKU
POST /api/creatives/generate-batch      → corre Creative Engine para hero SKUs
POST /api/campaigns/launch              → corre Launch Agent
POST /api/optimizer/run                 → corre Optimizer manual (cron en post-MVP)
GET  /api/dashboard/:projectId          → estado completo del proyecto
GET  /api/stream/:projectId             → SSE con eventos en vivo
```

---


---

## 8. Riesgos y Plan B

| Riesgo | Probabilidad | Plan B |
|---|---|---|
| Meta API rechaza la cuenta o pide verificación | Alta | Usar Meta sandbox + screencast pre-grabado |
| Image gen tarda mucho (>5min por imagen) | Media | Pre-generar para los SKUs de demo, mostrar como "cache" |
| Replicate sin créditos | Baja | Tener cuenta backup + flag para mockear |
| El optimizer no da tiempo | Alta | Hardcodear lógica simple + animación que "parezca" inteligente |
| Catálogo CSV mal formateado | Media | Schema fijo en demo, parser tolerante después |

---

## 9. Out of Scope (para roadmap post-hackathon) pero intentar meterlos, proponer tasks finales

Estos features se mencionan en el pitch pero **NO se implementan** en 48hs:
- Shopify connector real (solo CSV)
- TikTok / Google Ads
- Generación de video
- Lifecycle emails / retention
- Marketplaces (ML, Amazon)
- Influencer matching
- Seasonal calendar
- Multi-touch attribution server-side

---

