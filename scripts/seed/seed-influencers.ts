/**
 * Seed de influencers — Track 3 §2.11-2.17.
 *
 * Pipeline pragmático para hackathon (D7):
 *  1. Lee scripts/seed/seed-handles.csv (100 handles).
 *  2. Si scripts/seed/influencers.json no existe (o --regenerate), llama a
 *     GPT-4o-mini para generar PARA CADA HANDLE un perfil plausible:
 *       - display_name, followers_count (10k-300k), engagement_rate (2-7%),
 *         bio, recent_post_summary (resumen de últimos 3-5 posts), audience_demo.
 *     Los datos son sintéticos pero realistas — la spec de matching usa
 *     embeddings sobre bio + recent_post_summary, así que la "veracidad" del
 *     dato es menos crítica que su consistencia con la categoría.
 *     Cuando sea posible correr Playwright (scrape-influencers.ts), este
 *     archivo se sobreescribe con datos reales y la pipeline no cambia.
 *  3. Genera embeddings (text-embedding-3-small, dim 1536) sobre
 *     `bio + recent_post_summary + categories`.
 *  4. Inserta batch en `influencers` con UPSERT por (handle, platform).
 *
 * Ejecutar:
 *   pnpm seed:influencers           # regenera si falta el JSON, inserta
 *   pnpm seed:influencers --regen   # fuerza regenerar el JSON
 */
import { config } from "dotenv";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import OpenAI from "openai";
import postgres from "postgres";

config({ path: ".env.local" });

const ROOT = join(__dirname, "..", "..");
const CSV_PATH = join(ROOT, "scripts", "seed", "seed-handles.csv");
const JSON_PATH = join(ROOT, "scripts", "seed", "influencers.json");

type SeedHandle = {
  handle: string;
  platform: "ig" | "tt" | "yt";
  category: string;
};

type SyntheticProfile = {
  handle: string;
  platform: "ig" | "tt" | "yt";
  display_name: string;
  avatar_url: string | null;
  followers_count: number;
  engagement_rate: number;
  bio: string;
  recent_post_summary: string;
  categories: string[];
  audience_demo: { age_range: string; gender: string; country: string };
};

type Persisted = SyntheticProfile & { embedding: number[] };

async function main() {
  const args = new Set(process.argv.slice(2));
  const regen = args.has("--regen") || args.has("--regenerate");

  const handles = parseHandlesCsv(readFileSync(CSV_PATH, "utf-8"));
  console.log(`[seed] ${handles.length} handles to process`);

  let profiles: SyntheticProfile[];
  if (regen || !existsSync(JSON_PATH)) {
    console.log(`[seed] generating profiles via LLM (this is ~$0.05)…`);
    profiles = await generateProfiles(handles);
    writeFileSync(JSON_PATH, JSON.stringify(profiles, null, 2));
    console.log(`[seed] wrote ${profiles.length} profiles to ${JSON_PATH}`);
  } else {
    console.log(`[seed] using cached profiles from ${JSON_PATH}`);
    profiles = JSON.parse(readFileSync(JSON_PATH, "utf-8")) as SyntheticProfile[];
  }

  console.log(`[seed] generating embeddings…`);
  const persisted: Persisted[] = await embedAll(profiles);

  console.log(`[seed] inserting into Supabase…`);
  await upsertAll(persisted);

  console.log(`[seed] done · ${persisted.length} influencers en DB`);
}

function parseHandlesCsv(raw: string): SeedHandle[] {
  return raw
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#") && !l.startsWith("handle,"))
    .map((line) => {
      const [handle, platform, category] = line.split(",").map((c) => c.trim());
      if (!handle || !platform || !category) {
        throw new Error(`bad row: ${line}`);
      }
      if (!["ig", "tt", "yt"].includes(platform)) {
        throw new Error(`bad platform: ${platform}`);
      }
      return {
        handle,
        platform: platform as SeedHandle["platform"],
        category,
      };
    });
}

async function generateProfiles(
  handles: SeedHandle[],
): Promise<SyntheticProfile[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY missing");
  const openai = new OpenAI({ apiKey });

  const out: SyntheticProfile[] = [];
  // Batch en grupos de 10 para que cada call sea sencillo de validar.
  for (let i = 0; i < handles.length; i += 10) {
    const batch = handles.slice(i, i + 10);
    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      temperature: 0.7,
      messages: [
        {
          role: "system",
          content: SYSTEM_PROFILE,
        },
        {
          role: "user",
          content: `Categoría: variada (ver lista). Generá un perfil por cada handle:\n${batch
            .map((h) => `- ${h.handle} | ${h.platform} | ${h.category}`)
            .join("\n")}\n\nDevolvé { "profiles": [<perfil>] }.`,
        },
      ],
    });
    const text = resp.choices[0]?.message?.content ?? "{}";
    let parsed: { profiles?: unknown[] };
    try {
      parsed = JSON.parse(text);
    } catch {
      console.error("[seed] bad JSON from LLM, batch:", batch);
      continue;
    }
    const profiles = (parsed.profiles ?? [])
      .map((p) => normalizeProfile(p, batch))
      .filter((p): p is SyntheticProfile => !!p);
    out.push(...profiles);
    process.stdout.write(`.`);
  }
  process.stdout.write(`\n`);
  return out;
}

function normalizeProfile(
  p: unknown,
  batch: SeedHandle[],
): SyntheticProfile | null {
  if (!p || typeof p !== "object") return null;
  const o = p as Record<string, unknown>;
  const handle = String(o.handle ?? "").trim();
  if (!handle) return null;
  const seed = batch.find((b) => b.handle === handle);
  if (!seed) return null;
  return {
    handle,
    platform: seed.platform,
    display_name: String(o.display_name ?? handle),
    avatar_url: typeof o.avatar_url === "string" ? o.avatar_url : null,
    followers_count: clampInt(o.followers_count, 10_000, 300_000),
    engagement_rate: clampNum(o.engagement_rate, 0.02, 0.07),
    bio: String(o.bio ?? "").slice(0, 280),
    recent_post_summary: String(o.recent_post_summary ?? "").slice(0, 1000),
    categories: Array.isArray(o.categories)
      ? (o.categories as unknown[])
          .filter((c): c is string => typeof c === "string")
          .slice(0, 4)
      : [seed.category],
    audience_demo: normalizeAudience(o.audience_demo),
  };
}

function normalizeAudience(v: unknown): {
  age_range: string;
  gender: string;
  country: string;
} {
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return {
      age_range: String(o.age_range ?? "25-34"),
      gender: String(o.gender ?? "female"),
      country: String(o.country ?? "AR"),
    };
  }
  return { age_range: "25-34", gender: "female", country: "AR" };
}

function clampInt(v: unknown, min: number, max: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return min + Math.floor(Math.random() * (max - min));
  return Math.max(min, Math.min(max, Math.trunc(n)));
}
function clampNum(v: unknown, min: number, max: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return (min + max) / 2;
  return Math.max(min, Math.min(max, n));
}

async function embedAll(profiles: SyntheticProfile[]): Promise<Persisted[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY missing");
  const openai = new OpenAI({ apiKey });

  const out: Persisted[] = [];
  for (let i = 0; i < profiles.length; i += 50) {
    const batch = profiles.slice(i, i + 50);
    const inputs = batch.map(
      (p) => `${p.bio}\n${p.recent_post_summary}\nCategorías: ${p.categories.join(", ")}`,
    );
    const resp = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: inputs,
    });
    resp.data.forEach((d, idx) => {
      const profile = batch[idx];
      if (!profile) return;
      out.push({ ...profile, embedding: d.embedding });
    });
    process.stdout.write(`.`);
  }
  process.stdout.write(`\n`);
  return out;
}

async function upsertAll(persisted: Persisted[]): Promise<void> {
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL missing");
  const sql = postgres(url, { prepare: false, max: 1 });

  try {
    for (const p of persisted) {
      const embeddingLiteral = `[${p.embedding.join(",")}]`;
      await sql`
        insert into influencers (
          handle, platform, display_name, avatar_url,
          followers_count, engagement_rate,
          bio, recent_post_summary,
          categories, audience_demo, embedding
        ) values (
          ${p.handle},
          ${p.platform},
          ${p.display_name},
          ${p.avatar_url},
          ${p.followers_count},
          ${p.engagement_rate},
          ${p.bio},
          ${p.recent_post_summary},
          ${sql.json(p.categories)},
          ${sql.json(p.audience_demo)},
          ${embeddingLiteral}::vector
        )
        on conflict (handle, platform) do update set
          display_name = excluded.display_name,
          avatar_url = excluded.avatar_url,
          followers_count = excluded.followers_count,
          engagement_rate = excluded.engagement_rate,
          bio = excluded.bio,
          recent_post_summary = excluded.recent_post_summary,
          categories = excluded.categories,
          audience_demo = excluded.audience_demo,
          embedding = excluded.embedding,
          scraped_at = now()
      `;
    }
  } finally {
    await sql.end();
  }
}

const SYSTEM_PROFILE = `Sos un generador de perfiles de creadores de contenido (influencers) para un sistema de matching de retail.
Recibís una lista de handles + categoría y devolvés perfiles plausibles.

Cada perfil debe tener:
{
  "handle": string,                       // exactamente como vino en input
  "display_name": string,                  // nombre legible (ej. "Luna Collective")
  "avatar_url": null,                      // siempre null
  "followers_count": number,               // entre 10000 y 300000
  "engagement_rate": number,               // 0.02 a 0.07
  "bio": string,                           // 1-2 líneas, en español, voz coherente con la categoría
  "recent_post_summary": string,           // 2-3 oraciones resumiendo qué publicó esta semana (productos, lifestyle, valores)
  "categories": [string, ...],             // 1-3 tags. Incluí siempre la categoría base. Pueden agregarse subcategorías plausibles.
  "audience_demo": { "age_range": string, "gender": "female"|"male"|"all", "country": string }
}

Reglas:
- Salida JSON puro (un objeto top-level con clave "profiles" como array).
- Variá tono y nicho dentro de la categoría — no todos suenan igual.
- Las menciones de productos en recent_post_summary deben ser concretas (ej. "blusa de lino oversize", "ritual nocturno con vitamina C") para que el matching tenga señal.
- No mencionar marcas reales conocidas (evitar Nike, Zara, etc).
- Bios y resúmenes en español rioplatense neutro.`;

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
