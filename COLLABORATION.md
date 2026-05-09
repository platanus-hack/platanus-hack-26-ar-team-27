# Cómo trabajar en 5 compus en paralelo sin romper nada

Esta guía es **el contrato** entre los 5 tracks. Si todos la siguen, los merges no duelen.

---

## TL;DR

1. Una persona corre el **bootstrap** (1-2 hrs). Nadie más toca el repo hasta que esto termine.
2. Cuando bootstrap merge a `main`, los 5 hacen `git pull` y crean su branch `track/N-...`.
3. Trabajan en su branch. Hacen PR a `main` cada 2-3 hrs.
4. Cada track tiene **carpetas propias** — no se cruzan.
5. Cualquier cambio a archivos compartidos (schema, types, env) se discute en el grupo antes de mergear.

---

## Fase 0 — Bootstrap (UNA persona, primero)

Lo hace quien sea más cómodo con setup. Mientras esto pasa, **los otros 4 esperan** o leen specs.

```bash
# 1. Clonar
git clone https://github.com/platanus-hack/platanus-hack-26-ar-team-27.git
cd platanus-hack-26-ar-team-27

# 2. Setup Next.js
pnpm create next-app@14 . --typescript --tailwind --app --src-dir --import-alias "@/*"
# (responder yes a las preguntas, mantener carpeta vigente)

# 3. shadcn/ui
pnpm dlx shadcn@latest init -d
pnpm dlx shadcn@latest add button card dialog tabs

# 4. Dependencias
pnpm add @supabase/supabase-js @anthropic-ai/sdk openai replicate ai zod
pnpm add @langchain/langgraph @langchain/core
pnpm add pdf-parse papaparse framer-motion
pnpm add -D @types/papaparse playwright

# 5. Crear estructura de carpetas (importante para evitar conflicts)
mkdir -p src/app/api/{catalog,brief,strategy,creatives,influencers,campaigns,stream}
mkdir -p src/components/{agents,catalog,brief,creatives,influencers,launch}
mkdir -p src/lib/{events,db,agents}
mkdir -p src/lib/agents/{strategy,creative,influencer}
mkdir -p supabase/migrations
mkdir -p scripts/seed
```

### Archivos compartidos que CREA el bootstrap

| Archivo | Quién lo edita después |
|---|---|
| `src/lib/events/types.ts` (contrato `AgentEvent` del design D6) | **Nadie** — congelado tras bootstrap |
| `supabase/migrations/001_init.sql` (schema completo del design D12) | **Append-only**: si necesitás cambio, agregá `002_*.sql` |
| `src/lib/db/schema.ts` (zod schemas que reflejan D12) | Append-only por track |
| `.env.local.example` (todas las keys que se necesitan) | Append-only |
| `package.json`, `pnpm-lock.yaml`, `tsconfig.json`, `next.config.js`, `tailwind.config.ts` | **Nadie** — discutido en grupo si hay que tocar |
| `.eslintrc.json` con reglas básicas (typecheck en CI) | Idem |

### Servicios externos que CREA el bootstrap

- Proyecto Vercel conectado al repo (deploy preview en cada PR).
- Proyecto Supabase + extensión `pgvector` habilitada + migration 001 corrida.
- API keys en Vercel project settings: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `REPLICATE_API_TOKEN`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
- Las mismas keys compartidas al equipo por canal seguro (1Password / Slack DM / archivo ephemeral).

### Cuando el bootstrap está listo

1. PR a `main` con todo lo de arriba.
2. Mergear sin tocar nada más.
3. Mensaje en el grupo: **"bootstrap mergeado, hagan pull y abran su branch"**.

---

## Fase 1 — Branches por track

Cada uno crea su branch desde `main` actualizado:

```bash
git checkout main
git pull origin main
git checkout -b track/N-nombre   # ej: track/1-frontend
```

Convención de nombres:
- `track/1-frontend`
- `track/2-agents`
- `track/3-data`
- `track/4-creative`
- `track/5-launch-devops`

Si una persona necesita hacer features en su track no relacionadas, abre **sub-branches** desde su branch:
- `track/1-frontend/onboarding`
- `track/1-frontend/agent-stage`

Y mergea a `track/1-frontend` antes de PR a `main`.

---

## Fase 2 — Quién toca qué (división por carpeta)

| Carpeta | Owner | Notas |
|---|---|---|
| `src/app/(dashboard)/`, `src/app/page.tsx`, `src/app/layout.tsx` | T1 | UI principal |
| `src/components/agents/` | T1 | `<AgentStage>`, `<LiveThinking>` |
| `src/components/catalog/`, `src/components/brief/` | T1 (UI) + T3 (lógica) | T1 hace UI, T3 hace handlers |
| `src/components/creatives/`, `src/components/influencers/` | T1 | UI de outputs |
| `src/components/launch/` | T1 (UI) + T5 (lógica) | Mismo patrón |
| `src/app/api/catalog/`, `src/app/api/brief/` | T3 | |
| `src/app/api/strategy/`, `src/app/api/influencers/`, `src/app/api/stream/` | T2 | |
| `src/app/api/creatives/` | T4 | |
| `src/app/api/campaigns/` | T5 | |
| `src/lib/agents/strategy/` | T2 | |
| `src/lib/agents/creative/` | T4 | |
| `src/lib/agents/influencer/` | T2 | (matching + DM) |
| `src/lib/events/` | **NADIE** después del bootstrap | Si hay que cambiar, conversación grupal |
| `src/lib/db/` | append-only por todos | Cada track agrega queries; nadie edita queries de otros |
| `scripts/seed/` | T3 | scraping + demo catalog |
| `supabase/migrations/` | append-only | `002_*.sql`, `003_*.sql`, etc. |

**Regla de oro:** si tocás un archivo que NO es de tu carpeta, avisá en el grupo antes del PR.

---

## Fase 3 — Cómo evitar romper en runtime

### A. Contratos primero, implementación después

Si T1 necesita un endpoint que T2 todavía no escribió:
- T2 crea el handler con un **mock** que devuelve un payload que cumple el contrato (zod schema).
- T1 desarrolla contra el mock.
- T2 reemplaza el mock por la implementación real cuando esté lista.

### B. Mocks de agentes

Mientras los agentes reales no están listos, cada track puede testear con flags:
- `MOCK_IMAGE_GEN=true` → Creative Engine devuelve placeholders
- `MOCK_STRATEGY=true` → Strategy Agent devuelve un output canned
- `MOCK_INFLUENCER=true` → Influencer Matching devuelve los primeros 5 del seed

Estos flags ya están en el plan (`design.md`). Cualquier track puede agregar uno.

### C. Migrations append-only

**NUNCA** editar `supabase/migrations/001_init.sql` después del bootstrap.

Si necesitás:
- una columna nueva → `002_add_<columna>.sql` con `ALTER TABLE`
- una tabla nueva → `003_create_<tabla>.sql`
- cambiar tipo de columna → `004_*.sql` con `ALTER COLUMN`

Aplicar en local con:
```bash
psql $SUPABASE_DB_URL -f supabase/migrations/00X_*.sql
```

Y avisar al grupo: **"corran 002 antes de pullear mi rama"**.

### D. Variables de entorno

`.env.local.example` lista todas las keys requeridas. Cuando alguien agrega una nueva:
1. Agregar a `.env.local.example` con valor placeholder.
2. Agregar también a Vercel project settings.
3. Avisar al grupo para que actualicen su `.env.local`.

### E. Lock file y versión de Node

Todos usan **pnpm** y la misma versión de Node (20+). Commitear `pnpm-lock.yaml`. Si alguien instala una dependencia, hace PR del lock junto con el código.

---

## Fase 4 — Workflow de PRs

### Ritmo

- PR a `main` cada **2-3 horas** si tenés algo verde.
- No esperar al final del día para abrir PR — los merges grandes son los que rompen.

### Checklist antes de abrir PR

- [ ] `pnpm typecheck` pasa
- [ ] `pnpm build` pasa (si tocaste algo de Next.js)
- [ ] El deploy preview de Vercel arranca sin error
- [ ] Si tocaste archivo compartido (lib/events, lib/db, env, migrations) → avisar en grupo

### Quién mergea

- Cualquier persona del equipo puede mergear su propio PR si CI pasa, **excepto**:
- PRs que tocan archivos compartidos → 1 review obligatoria de otro track antes de mergear.

### Conflict resolution

- `git pull --rebase origin main` antes del PR para minimizar conflicts.
- Si hay conflict en archivo de tu carpeta → resolvés vos.
- Si hay conflict en archivo compartido → conversación con el otro track antes de resolver.

---

## Fase 5 — Smoke tests de integración

Cada **3-4 horas**, una persona corre un smoke test del flujo completo en el deploy de Vercel:

```
1. Crear proyecto nuevo (cookie nueva)
2. Subir scripts/seed/demo-catalog.csv
3. Pegar un brief de prueba
4. Disparar Strategy
5. Confirmar Strategy completa, Creative arranca
6. Confirmar Creative genera al menos 1 ad
7. Confirmar Influencer Matching genera 5 cards con DMs
8. Click "Launch to Meta", confirmar animación + persistencia
```

Si rompe en algún paso → issue en el grupo, el track responsable lo arregla.

---

## Roles para cada compu (resumen)

| Compu | Track | Carpetas principales |
|---|---|---|
| 1 | Frontend + Agent UX | `src/app/(dashboard)/`, `src/components/agents/`, `src/components/{catalog,brief,creatives,influencers,launch}/` |
| 2 | Backend orq + Strategy + Influencer agents + Event bus | `src/app/api/{strategy,influencers,stream}/`, `src/lib/agents/{strategy,influencer}/`, `src/lib/events/` (solo bootstrap) |
| 3 | Data: catalog, brief, scraping seed | `src/app/api/{catalog,brief}/`, `scripts/seed/` |
| 4 | Creative Engine | `src/app/api/creatives/`, `src/lib/agents/creative/` |
| 5 | DM finishing + Launch mock + DevOps | `src/app/api/campaigns/`, `src/components/launch/`, deploy + Vercel + smoke tests |

---

## Si algo se rompe en `main`

1. La persona que hizo el último merge revierte: `git revert <sha> && git push`.
2. Lo arregla en una rama nueva.
3. Re-PR cuando esté verde.
4. **No** hacer force push a `main`. Nunca.

---

## Si tenés dudas

Antes de tocar algo compartido, preguntá en el grupo. Es más barato preguntar que mergear y romper la rama de los otros 4.
