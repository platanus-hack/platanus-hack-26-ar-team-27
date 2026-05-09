/**
 * Path Playwright del scraper. Se carga via dynamic import desde scrape.ts
 * SOLO cuando SCRAPE_USE_PLAYWRIGHT=true, así el bundle del deploy en Vercel
 * no incluye Playwright (que pesa 280MB y rompe el size limit serverless).
 *
 * Uso típico: dev local con Chromium para captar captions de IG. En Vercel
 * el path por defecto es fetch puro (ver scrape.ts).
 */
import OpenAI from "openai";
import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
} from "playwright";
import type { ScrapeProgress, ScrapeResult, SeedHandle } from "./scrape";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

export async function scrapeBatchPlaywright(
  handles: SeedHandle[],
  onProgress: (p: ScrapeProgress) => void,
): Promise<ScrapeResult[]> {
  if (handles.length === 0) return [];

  const headless = process.env.SCRAPE_HEADLESS !== "false";
  let browser: Browser | null = null;
  let ctx: BrowserContext | null = null;

  try {
    browser = await chromium.launch({ headless });
    ctx = await browser.newContext({
      userAgent: UA,
      viewport: { width: 1280, height: 800 },
      locale: "es-AR",
    });

    const out: ScrapeResult[] = [];
    for (const h of handles) {
      onProgress({ handle: h.handle, platform: h.platform, status: "start" });
      try {
        const profile = await scrapeOne(ctx, h);
        if (profile) {
          out.push(profile);
          onProgress({
            handle: h.handle,
            platform: profile.platform,
            status: "ok",
            message: `${profile.followers_count} followers`,
          });
        } else {
          onProgress({
            handle: h.handle,
            platform: h.platform,
            status: "fail",
            message: "sin datos",
          });
        }
      } catch (err) {
        console.error(`[scrape-pw] ✗ ${h.handle}`, err);
        onProgress({
          handle: h.handle,
          platform: h.platform,
          status: "fail",
          message: (err as Error).message?.slice(0, 80),
        });
      }
      await sleep(2000 + Math.random() * 2000);
    }
    return out;
  } finally {
    try {
      await ctx?.close();
    } catch {}
    try {
      await browser?.close();
    } catch {}
  }
}

async function scrapeOne(
  ctx: BrowserContext,
  h: SeedHandle,
): Promise<ScrapeResult | null> {
  const page = await ctx.newPage();
  try {
    if (h.platform === "ig") {
      const result = await scrapeInstagram(page, h);
      if (result) return result;
    }
    return await scrapeTikTok(page, h);
  } finally {
    await page.close();
  }
}

async function scrapeInstagram(
  page: Page,
  h: SeedHandle,
): Promise<ScrapeResult | null> {
  const url = `https://www.instagram.com/${h.handle}/`;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });

  const metaDesc = await page
    .locator('meta[name="description"]')
    .getAttribute("content")
    .catch(() => null);

  if (!metaDesc || /Page Not Found/i.test(metaDesc)) return null;
  if (!/followers/i.test(metaDesc)) return null;

  const followersMatch = metaDesc.match(/([\d,.KMm]+)\s*Followers/i);
  const displayMatch = metaDesc.match(/from\s+(.+?)\s+\(/);

  const followers = parseFollowerCount(followersMatch?.[1] ?? "0");
  const display_name = (displayMatch?.[1]?.trim() ?? h.handle).slice(0, 80);

  const ogBio = (await getOgBio(page)) ?? "";
  const captions = await collectCaptions(page, 3).catch(() => [] as string[]);
  const summary = await summarize(captions, ogBio, h.category);

  return {
    handle: h.handle,
    platform: "ig",
    display_name,
    avatar_url: null,
    followers_count: followers,
    engagement_rate: 0.03 + Math.random() * 0.04,
    bio: ogBio.slice(0, 280),
    recent_post_summary: summary.slice(0, 1000),
    categories: [h.category],
    audience_demo: { age_range: "25-34", gender: "female", country: "AR" },
  };
}

async function scrapeTikTok(
  page: Page,
  h: SeedHandle,
): Promise<ScrapeResult | null> {
  const url = `https://www.tiktok.com/@${h.handle}`;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
  const metaDesc = await page
    .locator('meta[name="description"]')
    .getAttribute("content")
    .catch(() => null);
  if (!metaDesc) return null;

  const followersMatch = metaDesc.match(/([\d,.KMm]+)\s*Followers/i);
  const followers = parseFollowerCount(followersMatch?.[1] ?? "0");
  const bio = (metaDesc.split(" - ")[1] ?? "").slice(0, 280);

  if (!followers && !bio) return null;

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
      await sleep(1500 + Math.random() * 1500);
    } catch {
      // ignore
    }
  }
  return captions;
}

async function summarize(
  captions: string[],
  fallbackBio: string,
  category: string,
): Promise<string> {
  if (!captions.length) {
    return (
      fallbackBio || `Contenido reciente de ${category} (resumen no disponible).`
    );
  }
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return captions.join(" • ").slice(0, 600);
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

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
