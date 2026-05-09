/**
 * Strategy Agent — analiza catálogo + brief y devuelve hero SKUs + ICP +
 * detected_categories + reasoning (D6, spec strategy-agent).
 *
 * Modelo: Claude Sonnet 4.5 (D3) con streaming de tokens al bus.
 *
 * Pipeline:
 *  1. Emitir agent.started.
 *  2. Tool call get_brand_brief → emit tool.called/result.
 *  3. Tool call get_products → emit tool.called/result.
 *  4. Stream Claude → emit agent.thinking con cada delta.
 *  5. Parsear JSON de la respuesta + validar con StrategyOutputSchema.
 *  6. Persistir en `strategies` → emit artifact.created (sku) + agent.completed.
 *
 * Modo mock: MOCK_STRATEGY=true devuelve MOCK_STRATEGY_OUTPUT sin llamar LLM.
 */
import Anthropic from "@anthropic-ai/sdk";
import { publishEvent } from "@/lib/events/publish";
import { getSql } from "@/lib/db/pg";
import {
  StrategyOutputSchema,
  type StrategyOutput,
} from "@/lib/db/schema";
import { MOCK_STRATEGY_OUTPUT } from "@/lib/mocks/strategy";
import { getBrandBrief, getProducts } from "./tools";

const MODEL = "claude-sonnet-4-5";

export async function runStrategy(args: {
  projectId: string;
  runId: string;
}): Promise<{ strategyId: string; output: StrategyOutput }> {
  const { projectId, runId } = args;

  await publishEvent({
    kind: "agent.started",
    agent: "strategy",
    runId,
    projectId,
  });

  // Tool 1: brand brief.
  await publishEvent({
    kind: "tool.called",
    agent: "strategy",
    runId,
    projectId,
    tool: "get_brand_brief",
    input: { project_id: projectId },
  });
  const brief = await getBrandBrief(projectId);
  await publishEvent({
    kind: "tool.result",
    agent: "strategy",
    runId,
    projectId,
    tool: "get_brand_brief",
    output: brief
      ? {
          brand_name: brief.brand_name,
          tone_of_voice: brief.tone_of_voice,
          values: brief.values,
        }
      : null,
  });

  // Tool 2: products.
  await publishEvent({
    kind: "tool.called",
    agent: "strategy",
    runId,
    projectId,
    tool: "get_products",
    input: { project_id: projectId },
  });
  const products = await getProducts(projectId);
  await publishEvent({
    kind: "tool.result",
    agent: "strategy",
    runId,
    projectId,
    tool: "get_products",
    output: { count: products.length },
  });

  if (products.length === 0) {
    const err = "No hay productos cargados todavía.";
    await publishEvent({
      kind: "agent.failed",
      agent: "strategy",
      runId,
      projectId,
      error: err,
    });
    throw new Error(err);
  }

  let output: StrategyOutput;

  if (process.env.MOCK_STRATEGY === "true") {
    for (const chunk of chunkText(MOCK_STRATEGY_OUTPUT.reasoning, 40)) {
      await publishEvent({
        kind: "agent.thinking",
        agent: "strategy",
        runId,
        projectId,
        tokens: chunk,
      });
    }
    output = MOCK_STRATEGY_OUTPUT;
  } else {
    output = await callClaudeStreaming({ projectId, runId, brief, products });
  }

  // Persistir.
  const sql = getSql();
  const inserted = await sql<{ id: string }[]>`
    insert into strategies (project_id, hero_skus, icp, detected_categories, reasoning)
    values (
      ${projectId},
      ${sql.json(JSON.parse(JSON.stringify(output.hero_skus)))},
      ${sql.json(JSON.parse(JSON.stringify(output.icp)))},
      ${sql.json(JSON.parse(JSON.stringify(output.detected_categories)))},
      ${output.reasoning}
    )
    returning id
  `;
  const strategyId = inserted[0]?.id;
  if (!strategyId) {
    throw new Error("strategy_insert_failed");
  }

  for (const hero of output.hero_skus) {
    await publishEvent({
      kind: "artifact.created",
      agent: "strategy",
      runId,
      projectId,
      type: "sku",
      ref: hero.sku,
    });
  }

  await publishEvent({
    kind: "agent.completed",
    agent: "strategy",
    runId,
    projectId,
    summary: `${output.hero_skus.length} hero SKUs · ICP ${output.icp.age_range} ${output.icp.gender} · cats: ${output.detected_categories.join(", ")}`,
  });

  return { strategyId, output };
}

async function callClaudeStreaming(args: {
  projectId: string;
  runId: string;
  brief: Awaited<ReturnType<typeof getBrandBrief>>;
  products: Awaited<ReturnType<typeof getProducts>>;
}): Promise<StrategyOutput> {
  const { projectId, runId, brief, products } = args;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY missing");
  }
  const client = new Anthropic({ apiKey });

  const system = buildSystemPrompt(brief);
  const user = buildUserPrompt(products);

  let raw = "";

  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 2048,
    system,
    messages: [{ role: "user", content: user }],
  });

  for await (const event of stream) {
    if (
      event.type === "content_block_delta" &&
      event.delta.type === "text_delta"
    ) {
      const tokens = event.delta.text;
      raw += tokens;
      await publishEvent({
        kind: "agent.thinking",
        agent: "strategy",
        runId,
        projectId,
        tokens,
      });
    }
  }

  const json = extractJson(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    console.error("[strategy] JSON parse failed", { raw });
    throw new Error("strategy_invalid_json");
  }

  if (parsed && typeof parsed === "object") {
    const o = parsed as Record<string, unknown>;
    if (Array.isArray(o.hero_skus)) {
      o.hero_skus = o.hero_skus.map((h) => normalizeHeroSku(h));
    }
  }

  const validated = StrategyOutputSchema.safeParse(parsed);
  if (!validated.success) {
    console.error("[strategy] schema validation failed", validated.error);
    throw new Error("strategy_schema_invalid");
  }
  return validated.data;
}

function buildSystemPrompt(
  brief: Awaited<ReturnType<typeof getBrandBrief>>,
): string {
  const briefSection = brief
    ? `BRAND BRIEF:
- Marca: ${brief.brand_name ?? "(sin nombre)"}
- Tono de voz: ${brief.tone_of_voice ?? "(no especificado)"}
- Cliente ideal: ${brief.target_description ?? "(no especificado)"}
- Valores: ${(brief.values ?? []).join(", ") || "(ninguno)"}
- No mencionar: ${(brief.do_not_say ?? []).join(", ") || "(libre)"}`
    : "BRAND BRIEF: (no provisto, inferir todo del catálogo)";

  return `Sos el Strategy Agent de un sistema de retail growth. Recibís un catálogo + brand brief y devolvés un análisis estructurado en JSON estricto.

${briefSection}

Tu tarea:
1. Priorizar 3-5 hero SKUs del catálogo (los que el equipo debería empujar primero), considerando margen (price - cost), stock disponible, y fit con la marca.
2. Producir un ICP (Ideal Customer Profile) con age_range, gender, interests, behaviors, pain_points. Si el brief tiene target_description, expandilo. Si no, inferí del catálogo y dejá confidence: low.
3. Detectar categorías canónicas para influencer matching, eligiendo solo de: ["fashion", "beauty", "fitness", "home", "food"]. Si el catálogo cae afuera, mapeá al match más cercano y mencionalo en reasoning.
4. Explicar en reasoning (3-6 oraciones) cómo llegaste a la priorización.

FORMATO DE SALIDA (JSON puro, sin markdown, sin comentarios):
{
  "hero_skus": [
    { "sku": "string", "reason": "string", "priority_score": number_0_a_1 }
  ],
  "icp": {
    "age_range": "string",
    "gender": "male|female|all",
    "interests": ["string"],
    "behaviors": ["string"],
    "pain_points": ["string"],
    "confidence": "low|medium|high"
  },
  "detected_categories": ["fashion"|"beauty"|"fitness"|"home"|"food"],
  "reasoning": "string"
}

Reglas duras:
- 3 a 5 hero_skus, sku exactamente como aparece en el catálogo.
- detected_categories siempre con al menos 1 elemento, solo del set de 5.
- Sin texto antes ni después del JSON.
- Si el catálogo es muy chico (<3 SKUs), devolvé los que haya.`;
}

function buildUserPrompt(
  products: Awaited<ReturnType<typeof getProducts>>,
): string {
  const lines = products.map((p) => {
    const margin =
      p.price != null && p.cost != null
        ? ` margen=${(((p.price - p.cost) / p.price) * 100).toFixed(0)}%`
        : "";
    return `- ${p.sku} | ${p.name} | cat=${p.category ?? "?"} | price=${p.price ?? "?"} | cost=${p.cost ?? "?"} | stock=${p.stock ?? "?"}${margin}${p.description ? ` | ${truncate(p.description, 120)}` : ""}`;
  });

  return `CATÁLOGO (${products.length} SKUs):
${lines.join("\n")}

Devolvé el JSON ahora.`;
}

function chunkText(s: string, size: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < s.length; i += size) {
    out.push(s.slice(i, i + size));
  }
  return out;
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}

function extractJson(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("{")) return trimmed;
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first >= 0 && last > first) return trimmed.slice(first, last + 1);
  return trimmed;
}

function normalizeHeroSku(h: unknown): unknown {
  if (!h || typeof h !== "object") return h;
  const r = h as Record<string, unknown>;
  if (!("sku" in r) && "sku_id" in r) {
    r.sku = r.sku_id;
    delete r.sku_id;
  }
  return r;
}
