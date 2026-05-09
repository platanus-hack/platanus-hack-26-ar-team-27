/**
 * Influencer Matching Agent + DM Generator (D8, D14).
 *
 * Pipeline:
 *  1. agent.started.
 *  2. Lee la strategy más reciente del proyecto (ICP + detected_categories).
 *  3. Lee el catálogo (para recommended_skus).
 *  4. Embed del ICP → cosine sim contra influencers.embedding (pgvector),
 *     filtrado por categoría detectada (con fallback sin filtro).
 *  5. Para los top-5: Claude Sonnet 4.5 produce
 *     {match_reasoning, recommended_skus, initial DM, follow_up DM} en una
 *     sola llamada streamed (tokens al bus).
 *  6. Validador anti-alucinación: si un DM menciona videos/posts no
 *     presentes en bio + recent_post_summary, sanitizar.
 *  7. Persistir en influencer_matches con draft_messages = { initial,
 *     follow_up } y emitir artifact.created por match.
 *  8. agent.completed.
 *
 * Modo mock: MOCK_INFLUENCER=true devuelve canned (frontend dev sin LLM).
 */
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { z } from "zod";
import { getSql } from "@/lib/db/pg";
import { publishEvent } from "@/lib/events/publish";
import {
  DraftMessagesSchema,
  HeroSkuSchema,
  IcpSchema,
  InfluencerCategoryEnum,
} from "@/lib/db/schema";
import {
  embedProfile,
  pickCandidates,
  scrapeBatch,
  upsertInfluencer,
  type ScrapeProgress,
} from "./scrape";

const MODEL = "claude-sonnet-4-5";

type StrategyRow = {
  id: string;
  hero_skus: unknown;
  icp: unknown;
  detected_categories: unknown;
};

type InfluencerMatchInput = {
  influencer_id: string;
  handle: string;
  display_name: string | null;
  bio: string | null;
  recent_post_summary: string | null;
  categories: string[];
  followers_count: number | null;
  similarity: number;
};

type ProductRow = {
  id: string;
  sku: string;
  name: string;
  category: string | null;
};

type LlmMatchOutput = {
  influencer_id: string;
  match_reasoning: string;
  recommended_skus: string[];
  initial: string;
  follow_up: string;
};

const LlmBatchSchema = z.object({
  matches: z
    .array(
      z.object({
        influencer_id: z.string(),
        match_reasoning: z.string().min(10),
        recommended_skus: z.array(z.string()).min(1).max(3),
        initial: z.string().min(20),
        follow_up: z.string().min(20),
      }),
    )
    .min(1),
});

export async function matchInfluencers(args: {
  projectId: string;
  runId: string;
}): Promise<{ matchIds: string[] }> {
  const { projectId, runId } = args;

  await publishEvent({
    kind: "agent.started",
    agent: "influencer",
    runId,
    projectId,
  });

  await publishEvent({
    kind: "tool.called",
    agent: "influencer",
    runId,
    projectId,
    tool: "get_strategy",
    input: { project_id: projectId },
  });
  const strategy = await getLatestStrategy(projectId);
  if (!strategy) {
    const err = "No hay strategy generada todavía.";
    await publishEvent({
      kind: "agent.failed",
      agent: "influencer",
      runId,
      projectId,
      error: err,
    });
    throw new Error(err);
  }
  const icp = IcpSchema.parse(strategy.icp);
  const detectedCategories = z
    .array(InfluencerCategoryEnum)
    .min(1)
    .parse(strategy.detected_categories);
  const heroSkus = z.array(HeroSkuSchema).parse(strategy.hero_skus);

  await publishEvent({
    kind: "tool.result",
    agent: "influencer",
    runId,
    projectId,
    tool: "get_strategy",
    output: { categories: detectedCategories, icp_age: icp.age_range },
  });

  const products = await getProducts(projectId);

  // Scrape live: agarra N handles del seed CSV filtrados por las categorías
  // detectadas, los scrapea con Playwright y los UPSERTea con embedding fresco.
  // Si falla todo, seguimos con el pool seedeado (no rompe el flow).
  if (process.env.LIVE_SCRAPE !== "false") {
    try {
      await runScrapePhase({
        projectId,
        runId,
        detectedCategories,
      });
    } catch (err) {
      console.error("[influencer] scrape phase failed, continuing", err);
    }
  }

  await publishEvent({
    kind: "tool.called",
    agent: "influencer",
    runId,
    projectId,
    tool: "match_influencers",
    input: { categories: detectedCategories, icp_age: icp.age_range },
  });

  const candidates = await runMatch({ icp, detectedCategories });

  await publishEvent({
    kind: "tool.result",
    agent: "influencer",
    runId,
    projectId,
    tool: "match_influencers",
    output: {
      candidates: candidates.map((c) => ({
        handle: c.handle,
        similarity: Number(c.similarity.toFixed(4)),
      })),
    },
  });

  if (candidates.length === 0) {
    await publishEvent({
      kind: "agent.failed",
      agent: "influencer",
      runId,
      projectId,
      error: "no_candidates",
    });
    throw new Error("no_candidates");
  }

  let llmOutputs: LlmMatchOutput[];
  if (process.env.MOCK_INFLUENCER === "true") {
    llmOutputs = candidates.map((c) => buildMockOutput(c, products, heroSkus));
  } else {
    llmOutputs = await callClaudeForMatches({
      projectId,
      runId,
      icp,
      candidates,
      products,
      heroSkus,
    });
  }

  const sql = getSql();
  const matchIds: string[] = [];

  for (const candidate of candidates) {
    const out = llmOutputs.find(
      (o) => o.influencer_id === candidate.influencer_id,
    );
    if (!out) continue;

    const corpus = `${candidate.bio ?? ""} ${candidate.recent_post_summary ?? ""}`.toLowerCase();
    const initial = sanitizeDm(out.initial, corpus);
    const followUp = sanitizeDm(out.follow_up, corpus);

    const drafts = DraftMessagesSchema.safeParse({
      initial,
      follow_up: followUp,
    });
    if (!drafts.success) {
      console.warn("[influencer] invalid drafts for", candidate.handle);
      continue;
    }

    const productSkuSet = new Set(products.map((p) => p.sku));
    let recommended = out.recommended_skus.filter((s) => productSkuSet.has(s));
    if (recommended.length === 0) {
      recommended = heroSkus.slice(0, 2).map((h) => h.sku);
    }

    const inserted = await sql<{ id: string }[]>`
      insert into influencer_matches (
        project_id, influencer_id,
        match_score, match_reasoning,
        draft_messages, recommended_skus, status
      ) values (
        ${projectId},
        ${candidate.influencer_id},
        ${candidate.similarity},
        ${out.match_reasoning},
        ${sql.json({ initial, follow_up: followUp })},
        ${sql.json(recommended)},
        'proposed'
      )
      returning id
    `;
    const matchId = inserted[0]?.id;
    if (!matchId) continue;
    matchIds.push(matchId);

    await publishEvent({
      kind: "artifact.created",
      agent: "influencer",
      runId,
      projectId,
      type: "match",
      ref: matchId,
    });
  }

  await publishEvent({
    kind: "agent.completed",
    agent: "influencer",
    runId,
    projectId,
    summary: `${matchIds.length} matches con DMs initial+follow_up`,
  });

  return { matchIds };
}

// ============================================================
// scrape phase
// ============================================================

async function runScrapePhase(args: {
  projectId: string;
  runId: string;
  detectedCategories: string[];
}): Promise<void> {
  const { projectId, runId, detectedCategories } = args;
  const limit = Number(process.env.SCRAPE_LIMIT ?? 5);

  await publishEvent({
    kind: "tool.called",
    agent: "influencer",
    runId,
    projectId,
    tool: "pick_candidates",
    input: { categories: detectedCategories, limit },
  });

  const candidates = pickCandidates(detectedCategories, limit);

  await publishEvent({
    kind: "tool.result",
    agent: "influencer",
    runId,
    projectId,
    tool: "pick_candidates",
    output: {
      count: candidates.length,
      handles: candidates.map((c) => `@${c.handle}`),
    },
  });

  if (candidates.length === 0) return;

  await publishEvent({
    kind: "tool.called",
    agent: "influencer",
    runId,
    projectId,
    tool: "scrape_profiles",
    input: { count: candidates.length },
  });

  const onProgress = (p: ScrapeProgress) => {
    const tokens =
      p.status === "start"
        ? `Scrapeando @${p.handle} (${p.platform})…\n`
        : p.status === "ok"
          ? `✓ @${p.handle}${p.message ? ` · ${p.message}` : ""}\n`
          : `× @${p.handle}${p.message ? ` · ${p.message}` : ""}\n`;
    void publishEvent({
      kind: "agent.thinking",
      agent: "influencer",
      runId,
      projectId,
      tokens,
    });
  };

  const scraped = await scrapeBatch(candidates, onProgress);

  let persisted = 0;
  for (const profile of scraped) {
    const embedding = await embedProfile(profile);
    if (!embedding) continue;
    try {
      await upsertInfluencer(profile, embedding);
      persisted++;
    } catch (err) {
      console.error("[scrape] upsert failed for", profile.handle, err);
    }
  }

  await publishEvent({
    kind: "tool.result",
    agent: "influencer",
    runId,
    projectId,
    tool: "scrape_profiles",
    output: {
      requested: candidates.length,
      scraped: scraped.length,
      persisted,
    },
  });
}

// ============================================================
// queries
// ============================================================

async function getLatestStrategy(
  projectId: string,
): Promise<StrategyRow | null> {
  const sql = getSql();
  const rows = await sql<StrategyRow[]>`
    select id, hero_skus, icp, detected_categories
    from strategies
    where project_id = ${projectId}
    order by created_at desc
    limit 1
  `;
  return (rows[0] as unknown as StrategyRow) ?? null;
}

async function getProducts(projectId: string): Promise<ProductRow[]> {
  const sql = getSql();
  const rows = await sql<ProductRow[]>`
    select id, sku, name, category
    from products
    where project_id = ${projectId}
  `;
  return rows as unknown as ProductRow[];
}

async function runMatch(args: {
  icp: z.infer<typeof IcpSchema>;
  detectedCategories: string[];
}): Promise<InfluencerMatchInput[]> {
  const { icp, detectedCategories } = args;

  const icpText = [
    `Demografía: ${icp.age_range}, ${icp.gender}.`,
    `Intereses: ${icp.interests.join(", ")}.`,
    `Comportamientos: ${icp.behaviors.join(", ")}.`,
    `Pain points: ${icp.pain_points.join(", ")}.`,
  ].join(" ");

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY missing");
  const openai = new OpenAI({ apiKey });
  const embed = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: icpText,
  });
  const vec = embed.data[0]?.embedding;
  if (!vec) throw new Error("embedding failed");

  const sql = getSql();
  const literal = `[${vec.join(",")}]`;

  // pgvector `<=>` es cosine distance: 0 idéntico, 2 opuesto.
  // 1 - distance ≈ cosine similarity ∈ [-1, 1].
  const filtered = await sql<InfluencerMatchInput[]>`
    select id as influencer_id, handle, display_name, bio, recent_post_summary,
           categories, followers_count,
           1 - (embedding <=> ${literal}::vector) as similarity
    from influencers
    where embedding is not null
      and categories ?| ${detectedCategories as unknown as string[]}
    order by embedding <=> ${literal}::vector
    limit 5
  `;

  if (filtered.length >= 5) {
    return filtered as unknown as InfluencerMatchInput[];
  }

  const fallback = await sql<InfluencerMatchInput[]>`
    select id as influencer_id, handle, display_name, bio, recent_post_summary,
           categories, followers_count,
           1 - (embedding <=> ${literal}::vector) as similarity
    from influencers
    where embedding is not null
    order by embedding <=> ${literal}::vector
    limit 5
  `;
  return fallback as unknown as InfluencerMatchInput[];
}

// ============================================================
// LLM call: 5 matches en 1 sola call streamed
// ============================================================

async function callClaudeForMatches(args: {
  projectId: string;
  runId: string;
  icp: z.infer<typeof IcpSchema>;
  candidates: InfluencerMatchInput[];
  products: ProductRow[];
  heroSkus: z.infer<typeof HeroSkuSchema>[];
}): Promise<LlmMatchOutput[]> {
  const { projectId, runId, icp, candidates, products, heroSkus } = args;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY missing");
  const client = new Anthropic({ apiKey });

  const systemPrompt = `Sos el Influencer Matching Agent + DM Generator.
Recibís un ICP, una lista de creadores candidatos (con bio + recent_post_summary REALES) y un catálogo. Devolvés JSON estricto.

Para CADA creador, generás:
  - match_reasoning: 2-3 oraciones explicando por qué este creador encaja con el ICP, anclado a su bio/recent_post_summary.
  - recommended_skus: 1-3 SKUs del catálogo que podrías ofrecerle, priorizando los hero SKUs si encajan.
  - initial: DM inicial 80-150 palabras, voz cercana, en español rioplatense neutro. SOLO referenciá info real del bio o del recent_post_summary del creador. NO inventes nombres de posts/videos. Si la info es escasa, mensaje genérico breve.
  - follow_up: segundo DM (3-5 días después si no responde) que reconozca el contacto previo ("hace unos días te escribí..."), agregue valor (otro SKU, sample, pregunta concreta) y NO repita el initial. Mismas reglas anti-alucinación.

REGLAS DURAS:
- Salida JSON puro: { "matches": [<un objeto por creador>] }
- influencer_id debe ser exactamente el id que viene en input.
- Sin markdown, sin texto antes/después.
- Si el creador tiene bio escasa, hacé el mensaje genérico — NO inventes contexto.`;

  const userPrompt = `ICP:
- Edad: ${icp.age_range}, género: ${icp.gender}
- Intereses: ${icp.interests.join(", ")}
- Comportamientos: ${icp.behaviors.join(", ")}
- Pain points: ${icp.pain_points.join(", ")}

CATÁLOGO (subset):
${products
  .slice(0, 30)
  .map((p) => `- ${p.sku}: ${p.name} [${p.category ?? "?"}]`)
  .join("\n")}

HERO SKUs prioritarios:
${heroSkus.map((h) => `- ${h.sku}: ${h.reason}`).join("\n")}

CREADORES CANDIDATOS:
${candidates
  .map(
    (c, i) =>
      `${i + 1}. id=${c.influencer_id} | @${c.handle}\n   bio: ${c.bio ?? "(vacía)"}\n   recent: ${c.recent_post_summary ?? "(vacía)"}\n   categorías: ${c.categories.join(", ")}\n   followers: ${c.followers_count ?? "?"}`,
  )
  .join("\n\n")}

Devolvé el JSON ahora con un objeto por creador (mismo orden):`;

  let raw = "";
  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
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
        agent: "influencer",
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
    console.error("[influencer] bad JSON", { raw: raw.slice(0, 300) });
    throw new Error("influencer_invalid_json");
  }

  // Normalizar field aliases que Claude a veces emite
  // (initial_message, follow_up_message, dm_initial, etc.).
  if (parsed && typeof parsed === "object") {
    const o = parsed as Record<string, unknown>;
    if (Array.isArray(o.matches)) {
      o.matches = o.matches.map(normalizeMatch);
    }
  }

  const validated = LlmBatchSchema.safeParse(parsed);
  if (!validated.success) {
    console.error(
      "[influencer] schema fail",
      JSON.stringify(validated.error.issues.slice(0, 5), null, 2),
      "raw:",
      raw.slice(0, 600),
    );
    throw new Error("influencer_schema_invalid");
  }
  return validated.data.matches;
}

function normalizeMatch(m: unknown): unknown {
  if (!m || typeof m !== "object") return m;
  const o = m as Record<string, unknown>;
  // Aliases comunes que Claude puede usar.
  const aliasMap: Record<string, string[]> = {
    initial: [
      "initial_message",
      "initial_dm",
      "dm_initial",
      "first_message",
      "message_initial",
    ],
    follow_up: [
      "follow_up_message",
      "follow_up_dm",
      "followup",
      "followup_dm",
      "dm_follow_up",
      "message_follow_up",
    ],
    match_reasoning: ["reasoning", "rationale"],
    recommended_skus: ["skus", "recommended_products", "products_recommended"],
    influencer_id: ["id", "creator_id"],
  };
  for (const [canonical, aliases] of Object.entries(aliasMap)) {
    if (o[canonical] != null) continue;
    for (const a of aliases) {
      if (o[a] != null) {
        o[canonical] = o[a];
        delete o[a];
        break;
      }
    }
  }
  // Si recommended_skus viene como string CSV, normalizar a array.
  if (typeof o.recommended_skus === "string") {
    o.recommended_skus = (o.recommended_skus as string)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return o;
}

// ============================================================
// Anti-alucinación + sanitización
// ============================================================

const PROHIBITED_HALLUCINATION_HINTS: RegExp[] = [
  /tu video sobre [^.,;\n]*/i,
  /tu post sobre [^.,;\n]*/i,
  /tu reel sobre [^.,;\n]*/i,
  /vi tu reel [^.,;\n]*/i,
  /vi tu video [^.,;\n]*/i,
];

function sanitizeDm(text: string, corpus: string): string {
  let out = text.trim();
  for (const re of PROHIBITED_HALLUCINATION_HINTS) {
    if (re.test(out)) {
      const corpusHasMedia =
        corpus.includes("video") ||
        corpus.includes("reel") ||
        corpus.includes("post");
      if (!corpusHasMedia) {
        out = out.replace(re, "leí lo que compartís");
      }
    }
  }
  return out;
}

function extractJson(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("{")) return trimmed;
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first >= 0 && last > first) return trimmed.slice(first, last + 1);
  return trimmed;
}

// ============================================================
// MOCK_INFLUENCER=true
// ============================================================

function buildMockOutput(
  c: InfluencerMatchInput,
  products: ProductRow[],
  heroSkus: z.infer<typeof HeroSkuSchema>[],
): LlmMatchOutput {
  const sku = heroSkus[0]?.sku ?? products[0]?.sku ?? "";
  return {
    influencer_id: c.influencer_id,
    match_reasoning: `@${c.handle} alinea con el ICP por categorías ${c.categories.join(", ")} y bio que conecta con los valores de la marca.`,
    recommended_skus: sku ? [sku] : [],
    initial: `Hola @${c.handle}! Te escribo de la marca, vimos lo que compartís y nos pareció súper alineado con lo que estamos haciendo. ¿Te interesaría que te mandemos una pieza para que la pruebes? Sin compromiso, solo para que veas la calidad. Te leemos.`,
    follow_up: `Hola @${c.handle}! Hace unos días te escribí sobre una colab. Quedó la propuesta abierta — incluso podemos coordinar una pieza específica si tenés alguna en mente. ¿Te suma seguir?`,
  };
}
