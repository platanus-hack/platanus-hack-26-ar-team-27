/**
 * Scraper de seed de influencers vía Playwright (Chromium real) — D7.
 *
 * Es la **alternativa real** a seed-influencers.ts. El seed por default usa
 * el path sintético (LLM-generated profiles) porque IG bloquea agresivamente
 * y un demo de hackathon no puede depender de scraping en vivo.
 *
 * Cuando querés data real:
 *   1. pnpm dlx playwright install chromium
 *   2. pnpm seed:scrape           # output → scripts/seed/influencers.json
 *   3. pnpm seed:influencers      # toma ese json y genera embeddings + insert
 *
 * Pipeline:
 *  - Por handle: navega instagram.com/<handle>/.
 *  - Extrae bio (meta description), followers_count (meta name="description").
 *  - Si bloquea → fallback a tiktok.com/@<handle>.
 *  - Resume captions con GPT-4o-mini → recent_post_summary.
 *  - Output JSON que seed-influencers.ts consume.
 *
 * Anti-bloqueo: User-Agent realista, viewport desktop, delay 5-10s entre
 * perfiles, no headless por default (--headless para CI).
 */
import { config } from "dotenv";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import OpenAI from "openai";

config({ path: ".env.local" });

const ROOT = join(__dirname, "..", "..");
const CSV_PATH = join(ROOT, "scripts", "seed", "seed-handles.csv");
const JSON_PATH = join(ROOT, "scripts", "seed", "influencers.json");

type SeedHandle = {
  handle: string;
  platform: "ig" | "tt" | "yt";
  category: string;
};

type ScrapedProfile = {
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

const HEADLESS = process.argv.includes("--headless");
const MAX = Number(
  process.argv.find((a) => a.startsWith("--max="))?.slice(6) ?? "100",
);

async function main() {
  const handles = parseHandlesCsv(readFileSync(CSV_PATH, "utf-8")).slice(0, MAX);
  console.log(`[scrape] ${handles.length} handles · headless=${HEADLESS}`);

  const browser = await chromium.launch({ headless: HEADLESS });
  const ctx = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 800 },
    locale: "es-AR",
  });

  const existing: ScrapedProfile[] = existsSync(JSON_PATH)
    ? (JSON.parse(readFileSync(JSON_PATH, "utf-8")) as ScrapedProfile[])
    : [];
  const seen = new Set(existing.map((p) => `${p.handle}@${p.platform}`));

  const out: ScrapedProfile[] = [...existing];

  for (const h of handles) {
    const key = `${h.handle}@${h.platform}`;
    if (seen.has(key)) {
      console.log(`[scrape] skip ${key}`);
      continue;
    }
    try {
      const profile = await scrapeOne(ctx, h);
      if (profile) {
        out.push(profile);
        // Escribir incremental para que cortes intermedios no pierdan progreso.
        writeFileSync(JSON_PATH, JSON.stringify(out, null, 2));
        console.log(`[scrape] ✓ ${key} · ${profile.followers_count}f`);
      } else {
        console.warn(`[scrape] empty ${key}`);
      }
    } catch (err) {
      console.error(`[scrape] ✗ ${key}`, (err as Error).message);
    }
    await sleep(5000 + Math.random() * 5000);
  }

  await ctx.close();
  await browser.close();
  console.log(`[scrape] done · ${out.length} perfiles totales en ${JSON_PATH}`);
}

async function scrapeOne(
  ctx: BrowserContext,
  h: SeedHandle,
): Promise<ScrapedProfile | null> {
  const page = await ctx.newPage();
  try {
    if (h.platform === "ig") {
      const result = await scrapeInstagram(page, h);
      if (result) return result;
    }
    // Fallback / o si platform=tt: TikTok.
    return await scrapeTikTok(page, h);
  } finally {
    await page.close();
  }
}

async function scrapeInstagram(
  page: Page,
  h: SeedHandle,
): Promise<ScrapedProfile | null> {
  const url = `https://www.instagram.com/${h.handle}/`;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });

  // IG mete su data en meta tags y json blobs. Probamos meta first.
  const metaDesc = await page
    .locator('meta[name="description"]')
    .getAttribute("content")
    .catch(() => null);

  if (!metaDesc || metaDesc.includes("Page Not Found")) {
    return null;
  }

  // metaDesc patrón: "<n> Followers, <m> Following, <k> Posts - See Instagram photos and videos from <Display> (@<handle>)"
  const followersMatch = metaDesc.match(/([\d,.KMm]+)\s*Followers/i);
  const displayMatch = metaDesc.match(/from\s+(.+?)\s+\(/);

  const followers = parseFollowerCount(followersMatch?.[1] ?? "0");
  const display_name = displayMatch?.[1]?.trim() ?? h.handle;

  const bio = (await getOgBio(page)) ?? "";

  // Captions: leer 2-3 posts del grid.
  const captions = await collectCaptions(page, 3).catch(() => [] as string[]);
  const summary = await summarize(captions, h.category);

  return {
    handle: h.handle,
    platform: "ig",
    display_name,
    avatar_url: null,
    followers_count: followers,
    engagement_rate: 0.03 + Math.random() * 0.04,
    bio,
    recent_post_summary: summary,
    categories: [h.category],
    audience_demo: { age_range: "25-34", gender: "female", country: "AR" },
  };
}

async function scrapeTikTok(
  page: Page,
  h: SeedHandle,
): Promise<ScrapedProfile | null> {
  const url = `https://www.tiktok.com/@${h.handle}`;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
  const metaDesc = await page
    .locator('meta[name="description"]')
    .getAttribute("content")
    .catch(() => null);
  if (!metaDesc) return null;

  const followersMatch = metaDesc.match(/([\d,.KMm]+)\s*Followers/i);
  const followers = parseFollowerCount(followersMatch?.[1] ?? "0");
  const bio = metaDesc.split(" - ")[1] ?? "";

  return {
    handle: h.handle,
    platform: "tt",
    display_name: h.handle,
    avatar_url: null,
    followers_count: followers || 10_000,
    engagement_rate: 0.03 + Math.random() * 0.04,
    bio,
    recent_post_summary: bio,
    categories: [h.category],
    audience_demo: { age_range: "18-29", gender: "all", country: "AR" },
  };
}

async function getOgBio(page: Page): Promise<string | null> {
  return page
    .locator('meta[property="og:description"]')
    .getAttribute("content")
    .catch(() => null);
}

async function collectCaptions(page: Page, limit: number): Promise<string[]> {
  const captions: string[] = [];
  // IG no expone captions sin login en muchos casos; probamos meta tags de los
  // primeros posts navegando por sus URLs.
  const links = await page
    .locator('a[href*="/p/"]')
    .evaluateAll((els) =>
      (els as HTMLAnchorElement[])
        .map((e) => e.getAttribute("href"))
        .filter((h): h is string => !!h)
        .slice(0, 5),
    )
    .catch(() => [] as string[]);

  for (const href of links.slice(0, limit)) {
    try {
      await page.goto(`https://www.instagram.com${href}`, {
        waitUntil: "domcontentloaded",
        timeout: 20_000,
      });
      const og = await page
        .locator('meta[property="og:description"]')
        .getAttribute("content")
        .catch(() => null);
      if (og) captions.push(og);
      await sleep(2000 + Math.random() * 2000);
    } catch {
      // ignore
    }
  }
  return captions;
}

async function summarize(captions: string[], category: string): Promise<string> {
  if (!captions.length) {
    return `Contenido reciente de ${category} (resumen no disponible).`;
  }
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return captions.join(" • ").slice(0, 600);
  }
  const openai = new OpenAI({ apiKey });
  try {
    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.3,
      messages: [
        {
          role: "system",
          content:
            "Resumí los captions del creador en 2-3 oraciones (español neutro), capturando productos mencionados y temas. Sin markdown.",
        },
        {
          role: "user",
          content: `Categoría: ${category}\nCaptions:\n${captions.join("\n---\n")}`,
        },
      ],
    });
    return resp.choices[0]?.message?.content?.trim() ?? captions.join(" • ");
  } catch {
    return captions.join(" • ").slice(0, 600);
  }
}

function parseFollowerCount(s: string): number {
  const cleaned = s.replace(/,/g, "").trim().toLowerCase();
  if (cleaned.endsWith("k"))
    return Math.round(Number(cleaned.slice(0, -1)) * 1000);
  if (cleaned.endsWith("m"))
    return Math.round(Number(cleaned.slice(0, -1)) * 1_000_000);
  const n = Number(cleaned);
  return Number.isFinite(n) ? Math.round(n) : 0;
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
      return {
        handle,
        platform: platform as SeedHandle["platform"],
        category,
      };
    });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
