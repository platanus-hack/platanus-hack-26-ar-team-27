# AGENTS.md — Cómo trabajar en paralelo en 3 computadoras

> **Si sos un agente (humano o LLM) leyendo esto: este archivo es tu runbook.
> Seguilo de arriba hacia abajo.**
>
> Si te saltás los pasos vas a romper la rama de los otros 2. La regla #1 es
> reclamar tu track públicamente **antes** de empezar a codear.
>
> El proyecto se reparte en **3 tracks** que agrupan los 5 sub-tracks del plan
> original (T1-T5) según afinidad de dominio. Ver §3.

---

## TL;DR

1. Claim tu track editando la tabla **§1** y haciendo push.
2. Setup máquina (§2): clone + `pnpm install` + `vercel env pull`.
3. `git checkout track/N-...`.
4. **Ejecutar `/opsx:apply`** (§3) — único workflow autorizado para implementar tasks.
   No codees ad-hoc; el plan vive en `openspec/changes/retail-growth-engine-mvp/`.
5. Respetá los **contratos congelados** (§4) y **carpetas de tu track** (§5).
6. PR a `main` cada 2-3 hrs (§6).

---

## §1 — Claim tu track (OBLIGATORIO antes de codear)

Las 3 ramas ya están creadas en remoto. **Para reclamar una**, abrís este archivo, ponés tu nombre en la fila correspondiente, commiteás y pusheás. **El push es el lock**: el primero que pushee gana.

### Tabla de asignaciones — ¡EDITAME!

| Track | Branch | Cubre | Owner | Started At (ISO) | Status |
|---|---|---|---|---|---|
| 1 | `track/1-agents-data` | T2 + T3 (event bus, agents, catalog, brief, scraping seed) | UNCLAIMED | — | open |
| 2 | `track/2-frontend-launch` | T1 + T5 (UI completa, agent stage, launch mock, devops, demo polish) | UNCLAIMED | — | open |
| 3 | `track/3-creative` | T4 (Creative Engine: image-gen wrapper + copy gen) | UNCLAIMED | — | open |

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

# Sincronizar env desde Vercel (recomendado — no copies/pegues secrets manualmente)
pnpm dlx vercel@latest login          # primera vez: login con la cuenta agregada al proyecto
pnpm dlx vercel@latest link --yes \
    --project retail-growth-engine \
    --scope fardenghis-projects
pnpm dlx vercel@latest env pull .env.local

# Alternativa si NO tenés acceso al Vercel: cp .env.local.example .env.local
# y pedile las keys al admin del proyecto por canal seguro.

# Smoke test
pnpm typecheck   # debe pasar limpio
pnpm dev         # debe levantar en http://localhost:3000
```

Si cualquiera de estos pasos falla en `main` recién clonado: avisalo en el grupo, **es bug del bootstrap, no tuyo**.

---

## §3 — Implementar tus tasks (OBLIGATORIO usar `/opsx:apply`)

**Ubicación oficial del plan:** `openspec/changes/retail-growth-engine-mvp/`.

### Regla dura

**No codees a mano.** El único workflow autorizado para implementar tareas en este proyecto es el comando `/opsx:apply` (OpenSpec Apply), que:

1. Lee `proposal.md`, `design.md`, los `specs/*/spec.md` y `tasks.md` de la change activa.
2. Toma el siguiente task pendiente (`- [ ]`) y lo implementa respetando los contratos.
3. Marca el checkbox como `- [x]` cuando el task está hecho y verificado.
4. Hace commit con un mensaje que cita el task aplicado.

**Por qué es obligatorio:**
- Mantiene `tasks.md` como única fuente de verdad del estado del proyecto.
- Garantiza que cada feature implementada está cubierta por un spec testeable.
- Previene drift entre lo que documentamos y lo que está en el código.
- Permite al resto del equipo ver progreso real al pull `main` (los `[x]` son visibles).

### Cómo correrlo

```bash
# 1. Asegurate de estar en tu rama y al día con main
git checkout track/N-...
git pull --rebase origin main

# 2. Disparar el workflow OpenSpec apply
/opsx:apply
```

Cuando se te pregunte qué tasks aplicar, **scope a los de tu track** (los códigos `T1...T5` en `tasks.md` mapean según la tabla de §1):

- `track/1-agents-data` → tasks marcados como **T2** o **T3**.
- `track/2-frontend-launch` → tasks marcados como **T1** o **T5**.
- `track/3-creative` → tasks marcados como **T4**.

### Si encontrás algo que no está en tasks.md

No lo agregues por tu cuenta:
1. Si es un task chico que descubriste haciendo otro: agregalo a `tasks.md` con `- [ ] X.Y descripción` en la sección que corresponda y commiteá ese cambio aparte antes de implementarlo.
2. Si es algo grande (cambia un spec, un contrato, una decisión de design): conversación grupal — **no podés correr `/opsx:apply` para implementar algo que no esté en specs/design**.

### Resumen funcional por track

### Resumen por track

> Cada track agrupa varios sub-tracks del plan original (T1-T5 en `tasks.md`).
> Los códigos T1/T2/T3/T4/T5 se mantienen en `tasks.md` para no reescribirlo;
> mapeá tu rama a esos códigos:
>
> - `track/1-agents-data` → **T2 + T3**
> - `track/2-frontend-launch` → **T1 + T5**
> - `track/3-creative` → **T4**

#### Track 1 — Agents + Data (rama: `track/1-agents-data`)

**Misión:** el cerebro + todo lo que entra al sistema. Event bus, Strategy Agent, Influencer Matching + DM Generator, parsing de catálogo y brief, y scraping de seed de influencers.

**Tasks consolidados** (referencia a `openspec/changes/retail-growth-engine-mvp/tasks.md`):

Del bloque T2 (agentes + bus): §2.1-2.5, §3.1-3.7, §3.14-3.22.
Del bloque T3 (data + seed): §2.6-2.10, §2.11-2.17.

**Orden recomendado de ataque:**

1. **PRIMERO Y BLOQUEANTE PARA OTROS TRACKS:** event bus funcional.
   - `lib/events/publish.ts` (ya existe).
   - `app/api/stream/[projectId]/route.ts` con SSE + Postgres LISTEN (usar `getDirectSql()` de `lib/db/pg.ts`).
   - Replay por `?since=<event_id>` desde `agent_events`.
2. **Día 1 mañana en paralelo (corre solo, larga corrida ~1hr):** scraping seed.
   - Curar `scripts/seed/seed-handles.csv` (100 handles, 20 × 5 categorías).
   - Implementar `scripts/seed/scrape-influencers.ts` con Playwright.
   - Generar embeddings + batch insert.
3. Catalog parser (`POST /api/catalog`) y brief parser (`POST /api/brief` con TXT/MD/PDF + GPT-4o-mini).
4. Strategy Agent (LangGraph + Claude Sonnet 4.5):
   - Tools: `get_products`, `get_brand_brief`.
   - Streaming via Vercel AI SDK → `publishEvent('agent.thinking')`.
   - Output validado con `StrategyOutputSchema`.
5. Influencer Matching + DM Generator:
   - Cosine sim ICP↔embedding (pgvector).
   - DMs initial + follow_up anclados a `bio`/`recent_post_summary`.
   - Validador anti-alucinación.

**Lo que ya tenés scaffolded:**
- `src/lib/events/{types,publish}.ts` (CONTRATO CONGELADO — no editar `types.ts`).
- `src/lib/db/pg.ts` (postgres clients pooled + direct para LISTEN).
- `src/lib/agents/{strategy,influencer,creative}/index.ts` (stubs con TODO — solo edita strategy/influencer).
- `src/app/api/{catalog,brief,strategy,influencers,stream/[projectId]}/route.ts` (todos devuelven 501).
- `scripts/seed/scrape-influencers.ts` (stub Playwright con TODO).
- `scripts/seed/{seed-handles,demo-catalog}.csv`.
- Migration 001 ya tiene `agent_events` + trigger `notify_agent_event` aplicada en Supabase.
- `src/lib/db/schema.ts` con todos los zod schemas.

#### Track 2 — Frontend + Launch + DevOps (rama: `track/2-frontend-launch`)

**Misión:** todo lo que el jurado ve. UI completa con el stage de agentes trabajando, dashboard de outputs, launch mock, deploys y demo polish.

**Tasks consolidados:**

Del bloque T1 (frontend): §2.18-2.25, §4.1-4.10, §5.5-5.7.
Del bloque T5 (launch + devops + demo): §2.29-2.33, §5.1-5.12.

**Orden recomendado de ataque:**

1. UI shell + onboarding wizard (3 pasos: catálogo → brief → confirmar). Mientras Track 1 termina event bus, podés mockear el SSE devolviendo eventos canned.
2. `<AgentStage>` con 4 cards horizontales + borde gradient animado en activo (D15).
3. Hook `useAgentStream(projectId)` con SSE + dedupe + reconnect.
4. `<LiveThinking>` con tokens streaming + tool chips.
5. `<AdGallery>`, `<InfluencerCard>`, `<DmPanel>` (tabs Initial/Follow-up).
6. Animaciones de artifacts emergiendo (Framer Motion `layoutId`).
7. `<LaunchAnimation>` con 4 pasos (3-5s c/u, accent emerald) + `POST /api/campaigns` (mock, NO llamar a `graph.facebook.com`).
8. Vercel deploy + cron warm-up + smoke tests cada 3-4 hrs.
9. Demo polish: pre-cache snapshot de `agent_events` para replay determinista; plan B video.

**Lo que ya tenés scaffolded:**
- `src/app/{layout,page,globals.css}.tsx` (root stubs).
- `src/components/{agents/agent-stage,agents/use-agent-stream,launch/launch-animation,ui/button}.tsx` (stubs con TODO).
- `src/lib/utils.ts` con `cn()`, `src/lib/project.ts` con cookie session.
- `tailwind.config.ts` con `theme.colors.agent.{strategy,creative,influencer,launch}` + animations `border-flow` y `fade-up`.
- `components.json` configurado para shadcn — agregá lo que necesites con `pnpm dlx shadcn@latest add <component>`.
- `src/app/api/campaigns/route.ts` (stub 501 — implementalo vos).

**Mocks para no bloquearte mientras Track 1/Track 3 no terminan:**
- Endpoints upstream devuelven 501 con `{ track: 'TN' }` — capturá ese status y mostrá placeholder.
- Setear `MOCK_STRATEGY=true` y `MOCK_INFLUENCER=true` en `.env.local`.

#### Track 3 — Creative Engine (rama: `track/3-creative`)

**Misión:** pipeline de generación de ads. 9 ads por hero SKU (3 imágenes × 3 copys).

**Tasks consolidados:**

Del bloque T4: §2.26-2.28, §2.28a, §3.8-3.13.

**Orden recomendado:**

1. Implementar wrapper `generateImage()` en `src/lib/agents/creative/image-gen.ts` (ya existe el archivo). Default `MOCK_IMAGE_GEN=true` ya devuelve placeholders Unsplash — empezá probando que la pipeline corre end-to-end con mocks.
2. Generador de prompts: 3 estilos por SKU (`lifestyle | context | comparative`) usando brief + producto.
3. Generador de copy: GPT-4o-mini, 3 frameworks (`PAS | AIDA | curiosity`) por imagen.
4. `POST /api/creatives`: por cada hero SKU recibido, generar 9 ads en paralelo (las 3 imgs en paralelo dentro de un mismo SKU).
5. Emitir `artifact.created` al bus por cada output (NO batch al final) usando `publishEvent()`.
6. Persistir cada output en `creatives` con `status='ready'` o `'failed'`.
7. Manejo de SKU sin imagen: skip image-gen, copy-only.
8. **(Post-MVP / cuando se decida)** integrar modelo NVIDIA gratis en `generateImage()` reemplazando el TODO. El resto de la pipeline NO debe cambiar.

**Lo que ya tenés scaffolded:**
- `src/lib/agents/creative/{index,image-gen}.ts` (image-gen tiene mock funcional + TODO para NVIDIA).
- `src/app/api/creatives/route.ts` (stub 501).
- `src/lib/mocks/images.ts` con 6 placeholders Unsplash + `pickMockImage(seed)`.
- Schemas: `CreativeSchema`, `CopyFrameworkEnum`, `ImageStyleEnum`.

**Mocks para no bloquearte:** dejá `MOCK_IMAGE_GEN=true` (default) — pipeline corre completa sin créditos. Disable solo cuando el modelo NVIDIA esté integrado.

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
src/app/page.tsx, layout.tsx, globals.css   track/2-frontend-launch
src/app/(dashboard)/                         track/2-frontend-launch
src/app/api/catalog/                         track/1-agents-data
src/app/api/brief/                           track/1-agents-data
src/app/api/strategy/                        track/1-agents-data
src/app/api/influencers/                     track/1-agents-data
src/app/api/stream/[projectId]/              track/1-agents-data
src/app/api/creatives/                       track/3-creative
src/app/api/campaigns/                       track/2-frontend-launch

src/components/agents/                       track/2-frontend-launch
src/components/{catalog,brief}/              track/2-frontend-launch (UI) + track/1-agents-data (handlers)
src/components/{creatives,influencers}/      track/2-frontend-launch
src/components/launch/                       track/2-frontend-launch
src/components/ui/                           cualquier track (shadcn primitives)

src/lib/agents/strategy/                     track/1-agents-data
src/lib/agents/influencer/                   track/1-agents-data
src/lib/agents/creative/                     track/3-creative

src/lib/events/                              BOOTSTRAP — congelado
src/lib/db/                                  append-only (cualquier track puede sumar queries; nadie edita queries de otros)
src/lib/supabase/                            bootstrap — toques mínimos
src/lib/mocks/                               cualquier track (sumar mocks)
src/lib/project.ts                           bootstrap — toques mínimos

scripts/seed/                                track/1-agents-data
supabase/migrations/                         append-only por track
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
| `MOCK_IMAGE_GEN=true` (default) | No se llama a ningún modelo de imagen; devuelve placeholder Unsplash | `track/3-creative` |
| `MOCK_STRATEGY=true` | Strategy devuelve `MOCK_STRATEGY_OUTPUT` (canned) | `track/1-agents-data` |
| `MOCK_INFLUENCER=true` | Matching devuelve primeros 5 del seed | `track/1-agents-data` |

Setealos en tu `.env.local` local. Para deploy de Vercel: solo el sysadmin del proyecto los toca.

Si necesitás un mock nuevo: agregalo a `src/lib/mocks/` y documentalo en este AGENTS.md §7.

---

## §8 — Smoke test del flujo end-to-end

Cada **3-4 horas** una persona (tip: `track/2-frontend-launch`) corre esto en deploy de Vercel:

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
