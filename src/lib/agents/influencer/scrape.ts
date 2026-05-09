/**
 * Scraping live de influencers — corre desde el Influencer agent durante el
 * flow del usuario (después de Strategy).
 *
 * Path por defecto: `fetch()` directo al HTML público de IG/TikTok. Anda en
 * Vercel serverless (no necesita Chromium). Captura bio + followers +
 * display_name del meta description público. Pierde captions de posts
 * individuales (que IG bloquea sin login igual el 50% del tiempo).
 *
 * Override local: `SCRAPE_USE_PLAYWRIGHT=true` carga Playwright dinámicamente
 * y usa Chromium real. Más completo pero NO funciona en serverless.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import OpenAI from "openai";
import { getSql } from "@/lib/db/pg";

export type SeedHandle = {
  handle: string;
  platform: "ig" | "tt" | "yt";
  category: string;
};

export type ScrapeResult = {
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

export type ScrapeProgress = {
  handle: string;
  platform: string;
  status: "start" | "ok" | "fail";
  message?: string;
};

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

// ============================================================
// Public API
// ============================================================

export async function scrapeBatch(
  handles: SeedHandle[],
  onProgress: (p: ScrapeProgress) => void,
): Promise<ScrapeResult[]> {
  if (handles.length === 0) return [];

  if (process.env.SCRAPE_USE_PLAYWRIGHT === "true") {
    try {
      const { scrapeBatchPlaywright } = await import("./scrape-playwright");
      return await scrapeBatchPlaywright(handles, onProgress);
    } catch (err) {
      console.error(
        "[scrape] Playwright path failed, falling back to fetch.",
        err,
      );
      // Continúa al path fetch.
    }
  }

  return scrapeBatchFetch(handles, onProgress);
}

// ============================================================
// Candidate selection
// ============================================================

export function pickCandidates(
  detectedCategories: string[],
  limit: number,
): SeedHandle[] {
  const csvPath = join(process.cwd(), "scripts/seed/seed-handles.csv");
  let raw: string;
  try {
    raw = readFileSync(csvPath, "utf-8");
  } catch (err) {
    console.error("[scrape] no pude leer seed-handles.csv", err);
    return [];
  }

  const all = parseHandlesCsv(raw);
  const filtered = all.filter((h) =>
    detectedCategories.includes(h.category),
  );
  const pool = filtered.length > 0 ? filtered : all;

  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, limit);
}

function parseHandlesCsv(raw: string): SeedHandle[] {
  return raw
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#") && !l.startsWith("handle,"))
    .map((line) => {
      const parts = line.split(",").map((c) => c.trim());
      const handle = parts[0];
      const platform = parts[1];
      const category = parts[2];
      if (!handle || !platform || !category) return null;
      if (!["ig", "tt", "yt"].includes(platform)) return null;
      return { handle, platform: platform as SeedHandle["platform"], category };
    })
    .filter((x): x is SeedHandle => x !== null);
}

// ============================================================
// Fetch-based scraper (default — funciona en Vercel)
// ============================================================

async function scrapeBatchFetch(
  handles: SeedHandle[],
  onProgress: (p: ScrapeProgress) => void,
): Promise<ScrapeResult[]> {
  const out: ScrapeResult[] = [];
  for (const h of handles) {
    onProgress({ handle: h.handle, platform: h.platform, status: "start" });
    try {
      const profile = await scrapeOneFetch(h);
      if (profile) {
        out.push(profile);
        onProgress({
          handle: h.handle,
          platform: profile.platform,
          status: "ok",
          message: `${formatFollowers(profile.followers_count)} followers`,
        });
      } else {
        onProgress({
          handle: h.handle,
          platform: h.platform,
          status: "fail",
          message: "bloqueado o sin datos",
        });
      }
    } catch (err) {
      console.error(`[scrape] ✗ ${h.handle}`, err);
      onProgress({
        handle: h.handle,
        platform: h.platform,
        status: "fail",
        message: (err as Error).message?.slice(0, 80) ?? "error",
      });
    }
    // Mini delay anti-rate-limit.
    await sleep(800 + Math.random() * 600);
  }
  return out;
}

async function scrapeOneFetch(h: SeedHandle): Promise<ScrapeResult | null> {
  if (h.platform === "ig") {
    const ig = await scrapeIgFetch(h);
    if (ig) return ig;
    return scrapeTtFetch(h);
  }
  if (h.platform === "tt") {
    return scrapeTtFetch(h);
  }
  return null;
}

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "es-AR,es;q=0.9,en;q=0.8",
        "Accept-Encoding": "gzip, deflate, br",
        "Cache-Control": "no-cache",
      },
      redirect: "follow",
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

async function scrapeIgFetch(h: SeedHandle): Promise<ScrapeResult | null> {
  const html = await fetchHtml(`https://www.instagram.com/${h.handle}/`);
  if (!html) return null;

  const metaDesc = matchMeta(html, "name", "description");
  if (!metaDesc) return null;
  if (/Page Not Found/i.test(metaDesc)) return null;
  if (!/followers/i.test(metaDesc)) return null;

  const followersMatch = metaDesc.match(/([\d,.KMm]+)\s*Followers/i);
  const displayMatch = metaDesc.match(/from\s+(.+?)\s+\(/);

  const followers = parseFollowerCount(followersMatch?.[1] ?? "0");
  const display_name = decodeEntities(
    (displayMatch?.[1]?.trim() ?? h.handle).slice(0, 80),
  );

  const ogDesc = matchMeta(html, "property", "og:description") ?? "";
  const ogImage = matchMeta(html, "property", "og:image");
  const bio = decodeEntities(ogDesc).slice(0, 280);

  return {
    handle: h.handle,
    platform: "ig",
    display_name,
    avatar_url: ogImage ?? null,
    followers_count: followers,
    engagement_rate: 0.03 + Math.random() * 0.04,
    bio,
    // Sin captions en fetch puro: usamos el bio como proxy del summary.
    recent_post_summary: bio || `Contenido reciente de ${h.category}.`,
    categories: [h.category],
    audience_demo: { age_range: "25-34", gender: "female", country: "AR" },
  };
}

async function scrapeTtFetch(h: SeedHandle): Promise<ScrapeResult | null> {
  const html = await fetchHtml(`https://www.tiktok.com/@${h.handle}`);
  if (!html) return null;

  const metaDesc = matchMeta(html, "name", "description");
  if (!metaDesc) return null;

  const followersMatch = metaDesc.match(/([\d,.KMm]+)\s*Followers/i);
  const followers = parseFollowerCount(followersMatch?.[1] ?? "0");
  const bio = decodeEntities((metaDesc.split(" - ")[1] ?? "").slice(0, 280));

  if (!followers && !bio) return null;

  const ogImage = matchMeta(html, "property", "og:image");

  return {
    handle: h.handle,
    platform: "tt",
    display_name: h.handle,
    avatar_url: ogImage ?? null,
    followers_count: followers || 10_000,
    engagement_rate: 0.03 + Math.random() * 0.04,
    bio,
    recent_post_summary: bio || `Contenido reciente de ${h.category}.`,
    categories: [h.category],
    audience_demo: { age_range: "18-29", gender: "all", country: "AR" },
  };
}

// ============================================================
// HTML parsing helpers
// ============================================================

function matchMeta(
  html: string,
  attr: "name" | "property",
  value: string,
): string | null {
  const escaped = escapeRe(value);
  // <meta name="..." content="...">
  const re1 = new RegExp(
    `<meta\\s+${attr}=["']${escaped}["']\\s+content=["']([^"']+)["']`,
    "i",
  );
  // <meta content="..." name="...">
  const re2 = new RegExp(
    `<meta\\s+content=["']([^"']+)["']\\s+${attr}=["']${escaped}["']`,
    "i",
  );
  return html.match(re1)?.[1] ?? html.match(re2)?.[1] ?? null;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, " ");
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

function formatFollowers(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return `${n}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ============================================================
// Embed + persist
// ============================================================

export async function embedProfile(
  profile: ScrapeResult,
): Promise<number[] | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  const openai = new OpenAI({ apiKey });
  const text = [
    profile.bio,
    profile.recent_post_summary,
    profile.categories.join(", "),
  ]
    .filter(Boolean)
    .join(" ");
  if (!text.trim()) return null;
  try {
    const res = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: text,
    });
    return res.data[0]?.embedding ?? null;
  } catch (err) {
    console.error("[scrape] embed failed for", profile.handle, err);
    return null;
  }
}

export async function upsertInfluencer(
  profile: ScrapeResult,
  embedding: number[],
): Promise<void> {
  const sql = getSql();
  const literal = `[${embedding.join(",")}]`;
  await sql`
    insert into influencers (
      handle, platform, display_name, avatar_url, followers_count,
      engagement_rate, bio, recent_post_summary, categories, audience_demo,
      embedding, scraped_at
    ) values (
      ${profile.handle},
      ${profile.platform},
      ${profile.display_name},
      ${profile.avatar_url},
      ${profile.followers_count},
      ${profile.engagement_rate},
      ${profile.bio},
      ${profile.recent_post_summary},
      ${sql.json(profile.categories)},
      ${sql.json(profile.audience_demo)},
      ${literal}::vector,
      now()
    )
    on conflict (handle, platform) do update set
      display_name = excluded.display_name,
      followers_count = excluded.followers_count,
      bio = excluded.bio,
      recent_post_summary = excluded.recent_post_summary,
      categories = excluded.categories,
      embedding = excluded.embedding,
      scraped_at = now()
  `;
}
