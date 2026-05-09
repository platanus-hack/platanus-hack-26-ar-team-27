# AGENTS.md — Cómo trabajar en paralelo en 5 computadoras

> **Si sos un agente (humano o LLM) leyendo esto: este archivo es tu runbook.
> Seguilo de arriba hacia abajo.**
>
> Si te saltás los pasos vas a romper la rama de los otros 4. La regla #1 es
> reclamar tu track públicamente **antes** de empezar a codear.

---

## TL;DR

1. Claim tu track editando la tabla **§1** y haciendo push.
2. Setup máquina (§2): clone + `pnpm install` + `.env.local`.
3. `git checkout track/N-...` y empezá tus tasks (§3).
4. Respetá los **contratos congelados** (§4) y **carpetas de tu track** (§5).
5. PR a `main` cada 2-3 hrs (§6).

---

## §1 — Claim tu track (OBLIGATORIO antes de codear)

Las 5 ramas ya están creadas en remoto. **Para reclamar una**, abrís este archivo, ponés tu nombre en la fila correspondiente, commiteás y pusheás. **El push es el lock**: el primero que pushee gana.

### Tabla de asignaciones — ¡EDITAME!

| Track | Branch | Owner | Started At (ISO) | Status |
|---|---|---|---|---|
| 1 | `track/1-frontend` | UNCLAIMED | — | open |
| 2 | `track/2-agents` | UNCLAIMED | — | open |
| 3 | `track/3-data` | UNCLAIMED | — | open |
| 4 | `track/4-creative` | UNCLAIMED | — | open |
| 5 | `track/5-launch-devops` | UNCLAIMED | — | open |

### Procedimiento de claim (copy-paste)

```bash
# 1. Pull main al día
git checkout main
git pull origin main

# 2. Editar AGENTS.md → poner tu nombre + timestamp en la fila libre que querés.
#    Cambiar Owner=UNCLAIMED por tu nombre, Started At por ISO date,
#    Status=open por Status=claimed.

# 3. Commit + push a main
git add AGENTS.md
git commit -m "claim track N (<tu-nombre>)"
git push origin main

# 4a. Si el push pasa → ganaste el lock, seguí al §2.
# 4b. Si el push es rechazado (race con otro agente):
git pull --rebase origin main
#     ver si la fila que querías sigue UNCLAIMED.
#     si sí: re-aplicar tu cambio y push de nuevo.
#     si no: elegir otra fila libre.
```

> **No empieces ningún `git checkout track/...` antes de que tu push de claim haya pasado.**

---

## §2 — Setup de tu máquina (una sola vez)

```bash
# Clone
git clone https://github.com/platanus-hack/platanus-hack-26-ar-team-27.git
cd platanus-hack-26-ar-team-27

# Node 20+ y pnpm 10+
node -v   # debe ser >= 20
pnpm -v   # debe ser >= 10

# Install
pnpm install

# Copiar env
cp .env.local.example .env.local
# Pegá las keys compartidas por el grupo (Supabase URL/keys, ANTHROPIC, OPENAI, REPLICATE).

# Smoke test
pnpm typecheck   # debe pasar limpio
pnpm dev         # debe levantar en http://localhost:3000
```

Si cualquiera de estos pasos falla en `main` recién clonado: avisalo en el grupo, **es bug del bootstrap, no tuyo**.

---

## §3 — Tus tasks por track

**Ubicación oficial:** `openspec/changes/retail-growth-engine-mvp/tasks.md`. Las tareas están agrupadas en olas. Cada track ya tiene asignación tentativa al lado del task.

### Resumen por track

#### Track 1 — Frontend + Agent UX (rama: `track/1-frontend`)

**Mision:** la UI completa, incluyendo el **stage de agentes trabajando** (design D15).

Tasks principales (ver tasks.md §2.18-2.25, §4.1-4.10, §5.5-5.7):
- Onboarding wizard (3 pasos: catálogo → brief → confirmar)
- `<AgentStage>` con 4 cards horizontales y borde gradient animado en activo
- `<LiveThinking>`: tokens streaming + tool chips
- Hook `useAgentStream(projectId)` con SSE + dedupe + reconect
- `<AdGallery>`, `<InfluencerCard>`, `<DmPanel>` (tabs initial/follow-up)
- Animaciones de artifacts emergiendo (Framer Motion `layoutId`)
- Cookie `rge_project_id` se crea automáticamente en first hit (ver `lib/project.ts`)

**Lo que ya tenés:**
- `src/components/agents/agent-stage.tsx` (stub)
- `src/components/agents/use-agent-stream.ts` (stub con TODO)
- `src/components/launch/launch-animation.tsx` (stub)
- `src/lib/utils.ts` con `cn()`
- `tailwind.config.ts` con `theme.colors.agent.{strategy,creative,influencer,launch}` y `animate-border-flow` / `animate-fade-up`

**Mocks que podés usar mientras T2/T3/T4 no terminan:**
- Endpoints devuelven 501 con `{ track: 'TN' }` — capturá ese status y mostrá placeholder.
- O setear `MOCK_*=true` en `.env.local` (ver §7).

#### Track 2 — Backend orquestación + Strategy + Influencer agents + Event bus (rama: `track/2-agents`)

**Mision:** el cerebro. Strategy Agent, Influencer Matching + DM Generator, y **el event bus** (que es bloqueante para T1).

Tasks principales (ver tasks.md §2.1-2.5, §3.1-3.7, §3.14-3.22):
- **PRIMERO Y MÁS URGENTE:** event bus funcional. T1 te espera para integrar.
  - `lib/events/publish.ts` (ya existe, solo úsalo).
  - `app/api/stream/[projectId]/route.ts` con SSE + Postgres LISTEN.
  - Replay por `?since=<event_id>` desde tabla `agent_events`.
- Strategy Agent (LangGraph + Claude Sonnet 4.5):
  - Tools: `get_products`, `get_brand_brief`.
  - Streaming de tokens via Vercel AI SDK → publishEvent('agent.thinking').
  - Output validado con `StrategyOutputSchema` antes de persistir.
- Influencer Matching:
  - Embedding del ICP → cosine sim contra `influencers.embedding` (pgvector).
  - Top 5 con `match_reasoning`.
  - DM Generator: **initial + follow_up** (D14) anclados a `bio` + `recent_post_summary`.
  - Validador anti-alucinación post-LLM.

**Lo que ya tenés:**
- `src/lib/events/types.ts` (CONTRATO CONGELADO — no editar).
- `src/lib/events/publish.ts` (publisher listo).
- `src/lib/agents/{strategy,influencer}/index.ts` (stubs con TODO).
- `src/app/api/{strategy,influencers,stream/[projectId]}/route.ts` (devuelven 501).
- Migration 001 ya tiene `agent_events` + trigger `notify_agent_event`.

#### Track 3 — Data: catalog + brief + scraping seed (rama: `track/3-data`)

**Mision:** todo lo que entra al sistema. CSV de catálogo, brand brief (form + upload), y los 100 creadores seed.

Tasks principales (ver tasks.md §2.6-2.10, §2.11-2.17):
- `POST /api/catalog` parser CSV con papaparse.
- `POST /api/brief` con TXT/MD/PDF (pdf-parse) + parsing semántico GPT-4o-mini.
- **Día 1 mañana — bloqueante para T2 (matching):**
  - Curar `scripts/seed/seed-handles.csv` (100 handles, 20 × 5 categorías).
  - Implementar `scripts/seed/scrape-influencers.ts` con Playwright.
  - Generar embeddings y batch insert en Supabase.

**Lo que ya tenés:**
- `src/app/api/{catalog,brief}/route.ts` (stubs 501).
- `scripts/seed/scrape-influencers.ts` (stub con TODO).
- `scripts/seed/seed-handles.csv` (header con criterios documentados).
- `scripts/seed/demo-catalog.csv` (12 SKUs ficticios para probar parser ahora).
- `src/lib/db/schema.ts` con `BrandBriefParsedSchema`.

**Importante:** sin tu seed de influencers, T2 no puede correr matching real. **Bloqueá tiempo el día 1 mañana para esto.**

#### Track 4 — Creative Engine (rama: `track/4-creative`)

**Mision:** generar 9 ads por hero SKU (3 imágenes × 3 copys).

Tasks principales (ver tasks.md §2.26-2.28, §3.8-3.13):
- Wrapper de Replicate Flux Kontext con timeout y retry simple.
- 3 estilos de imagen por SKU: `lifestyle | context | comparative`.
- 3 frameworks de copy: `PAS | AIDA | curiosity` con GPT-4o-mini.
- Manejo de SKU sin imagen: skip image-gen, copy-only.
- Emitir `artifact.created` por cada output (NO batch al final).
- Respetar `MOCK_IMAGE_GEN=true` con `pickMockImage()` de `lib/mocks/images.ts`.

**Lo que ya tenés:**
- `src/lib/agents/creative/index.ts` (stub).
- `src/app/api/creatives/route.ts` (stub 501).
- `src/lib/mocks/images.ts` con 6 placeholders Unsplash.
- Schemas: `CreativeSchema`, `CopyFrameworkEnum`, `ImageStyleEnum`.

#### Track 5 — DM finishing + Launch mock + DevOps + demo seed (rama: `track/5-launch-devops`)

**Mision:** el último paso del flujo (launch a Meta mockeado), polish de DMs, deploy y plan B de demo.

Tasks principales (ver tasks.md §2.29-2.33, §3.18 colab, §5.1-5.12):
- `POST /api/campaigns` con animación de 4 pasos (3-5s c/u).
- **NO** llamar a `graph.facebook.com` (verificable con request inspector).
- Vercel deploy + cron warm-up cada 5min.
- Smoke tests cada 3-4 hrs.
- Pre-cache de demo: correr el flujo completo sobre seed y snapshot de `agent_events` para replay determinista.
- Plan B: video pre-grabado de la demo guardado offline.
- Asistir a T2 con DM Generator follow-up (D14) y validador anti-alucinación.

**Lo que ya tenés:**
- `src/app/api/campaigns/route.ts` (stub 501).
- `src/components/launch/launch-animation.tsx` (stub).

---

## §4 — Contratos CONGELADOS (no editar nunca)

Estos archivos definen el ABI compartido entre tracks. Si tenés que cambiar uno, **conversación grupal antes**:

| Archivo | Por qué congelado |
|---|---|
| `src/lib/events/types.ts` | Contrato `AgentEvent` que usan T1 (consume) y T2/T4/T5 (publish). |
| `supabase/migrations/001_init.sql` | Schema base. Cambios = `002_*.sql`, `003_*.sql` (append-only). |
| `src/lib/db/schema.ts` | Append-only: agregá tu schema sin tocar los existentes. |
| `package.json` versions | Si necesitás bumpear, avisá al grupo. |
| `tsconfig.json`, `next.config.mjs`, `tailwind.config.ts` | Cambios discutidos. |
| `.env.local.example` | Append-only. Si agregás key, sumala acá + Vercel + avisá. |

Las **dependencias** se agregan vía `pnpm add <pkg>` — eso modifica `package.json` y `pnpm-lock.yaml`. **Commiteá ambos juntos** y avisá.

---

## §5 — Carpetas por track (no cruzarse)

```
src/app/(dashboard)/                  T1
src/app/page.tsx, layout.tsx          T1
src/app/api/catalog/                  T3
src/app/api/brief/                    T3
src/app/api/strategy/                 T2
src/app/api/influencers/              T2
src/app/api/creatives/                T4
src/app/api/campaigns/                T5
src/app/api/stream/[projectId]/       T2

src/components/agents/                T1
src/components/{catalog,brief}/       T1 (UI) + T3 (handlers)
src/components/{creatives,influencers}/  T1
src/components/launch/                T1 + T5
src/components/ui/                    cualquiera (shadcn)

src/lib/agents/strategy/              T2
src/lib/agents/creative/              T4
src/lib/agents/influencer/            T2 (+ T5 colab DM)

src/lib/events/                       BOOTSTRAP — congelado
src/lib/db/                           append-only por track
src/lib/supabase/                     bootstrap — toques mínimos
src/lib/mocks/                        cualquiera (sumar mocks)
src/lib/project.ts                    bootstrap — toques mínimos

scripts/seed/                         T3
supabase/migrations/                  append-only por track
```

**Si tenés que tocar carpeta de otro track:** avisalo en el grupo, no abras PR sorpresa.

---

## §6 — Workflow de PRs

### Ritmo

- PR a `main` cada **2-3 horas** si tenés algo verde.
- No esperar al final del día. Merges chicos = conflicts chicos.

### Checklist antes de abrir PR

```bash
git pull --rebase origin main
pnpm typecheck   # debe pasar
pnpm build       # si tocaste algo de Next.js
pnpm dev         # smoke check local
```

### Quién mergea

- Tu propio PR si CI verde.
- **Excepción:** PRs que tocan archivos de §4 (congelados) requieren 1 review de otro track.

### Si rompés `main`

```bash
git revert <sha>
git push origin main
```

Después arreglás en una rama nueva. **Nunca** force push a `main`.

---

## §7 — Mocks para no bloquearte

Mientras un track upstream no terminó, podés desbloquearte con flags:

| Flag | Efecto | Owner del mock |
|---|---|---|
| `MOCK_IMAGE_GEN=true` | Replicate no se llama, devuelve placeholder | T4 |
| `MOCK_STRATEGY=true` | Strategy devuelve `MOCK_STRATEGY_OUTPUT` | T2 |
| `MOCK_INFLUENCER=true` | Matching devuelve primeros 5 del seed | T2 |

Setealos en tu `.env.local` local. Para deploy de Vercel: solo el sysadmin del proyecto los toca.

Si necesitás un mock nuevo: agregalo a `src/lib/mocks/` y documentalo en este AGENTS.md §7.

---

## §8 — Smoke test del flujo end-to-end

Cada **3-4 horas** una persona (tip: T5) corre esto en deploy de Vercel:

1. Abrir URL del deploy en navegador limpio (incognito).
2. Subir `scripts/seed/demo-catalog.csv`.
3. Pegar un brief de prueba.
4. Disparar Strategy → confirmar tokens streaming en pantalla.
5. Strategy completa → Creative arranca automático.
6. Confirmar al menos 1 ad aparece en galería en menos de 2 min.
7. Influencer Matching genera 5 cards con DMs (initial + follow-up).
8. Click "Launch to Meta" → animación + persistencia.
9. Verificar en network: **cero requests a `graph.facebook.com`**.

Si algo rompe: issue en el grupo, track responsable lo arregla en hot branch.

---

## §9 — Comandos de referencia rápida

```bash
# Empezar tu día
git checkout track/N-...
git pull --rebase origin main

# Mientras codeás
pnpm dev
pnpm typecheck

# Antes de PR
git pull --rebase origin main
pnpm typecheck && pnpm build

# Migration nueva (append-only)
echo "alter table ..." > supabase/migrations/00X_describe_change.sql
psql $SUPABASE_DB_URL -f supabase/migrations/00X_describe_change.sql

# Agregar dependencia
pnpm add <pkg>
# ⇒ commit package.json + pnpm-lock.yaml + avisar grupo
```

---

## §10 — Si te trabás

1. **Bloqueado por otro track**: setea el `MOCK_*` correspondiente y seguí.
2. **Conflict en archivo congelado**: `git pull --rebase` + conversación grupal.
3. **Pre-commit hook falla**: arregla la causa, NO uses `--no-verify`.
4. **No entendés un task**: leé el spec correspondiente en `openspec/changes/retail-growth-engine-mvp/specs/<capability>/spec.md`.
5. **Falta una decisión técnica**: leé `openspec/changes/retail-growth-engine-mvp/design.md` (D1-D15).

Si nada de eso ayuda: pregunta en el grupo. Tu hora resolviendo solo cuesta más que 5 minutos del grupo.
