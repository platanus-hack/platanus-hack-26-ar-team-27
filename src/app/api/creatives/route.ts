/**
 * POST /api/creatives
 * Body: { strategyId: string }
 *
 * Reads hero_skus from the strategy, fetches product rows, fetches brand brief,
 * then for each hero SKU generates 9 creatives (3 images × 3 copies) in parallel
 * across SKUs (images within each SKU also run in parallel).
 * Emits artifact.created per output. Persists in `creatives`.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "crypto";
import { getSql } from "@/lib/db/pg";
import { publishEvent } from "@/lib/events/publish";
import type { AgentEvent } from "@/lib/events/types";
import { generateCreativesForSku } from "@/lib/agents/creative";
import type { BriefContext, SkuInput } from "@/lib/agents/creative";

// Omit<union, key> in TS doesn't distribute — wrapper keeps full type safety.
type EventInput = AgentEvent extends infer E ? E extends AgentEvent ? Omit<E, "ts"> : never : never;
function emit(event: EventInput) {
  return publishEvent(event as Parameters<typeof publishEvent>[0]);
}

const BodySchema = z.object({
  strategyId: z.string().uuid(),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_error", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { strategyId } = parsed.data;
  const sql = getSql();

  // Load strategy
  const [strategy] = await sql<
    { id: string; project_id: string; hero_skus: unknown }[]
  >`
    select id, project_id, hero_skus from strategies where id = ${strategyId} limit 1
  `;

  if (!strategy) {
    return NextResponse.json({ error: "strategy_not_found" }, { status: 404 });
  }

  const projectId: string = strategy.project_id;
  const runId = randomUUID();

  // hero_skus is an array of { sku, reason, priority_score }
  const heroSkus = strategy.hero_skus as { sku: string; reason: string; priority_score: number }[];

  // Load products for this project matching hero SKUs
  const skuValues = heroSkus.map((h) => h.sku);
  const products = await sql<
    {
      id: string;
      sku: string;
      name: string;
      description: string | null;
      primary_image_url: string | null;
      category: string | null;
    }[]
  >`
    select id, sku, name, description, primary_image_url, category
    from products
    where project_id = ${projectId}
      and sku = any(${skuValues})
  `;

  // Load brand brief
  const [brief] = await sql<
    {
      brand_name: string | null;
      tone_of_voice: string | null;
      target_description: string | null;
      do_not_say: string[] | null;
    }[]
  >`
    select brand_name, tone_of_voice, target_description, do_not_say
    from brand_briefs
    where project_id = ${projectId}
    order by created_at desc
    limit 1
  `;

  const briefCtx: BriefContext = {
    brandName: brief?.brand_name ?? null,
    toneOfVoice: brief?.tone_of_voice ?? null,
    targetDescription: brief?.target_description ?? null,
    doNotSay: brief?.do_not_say ?? [],
  };

  await emit({
    kind: "agent.started",
    agent: "creative",
    runId,
    projectId,
  });

  // Build SKU inputs, warn on missing products
  const skuInputs: SkuInput[] = heroSkus.flatMap((hero) => {
    const product = products.find((p) => p.sku === hero.sku);
    if (!product) {
      console.warn(`[creatives] SKU ${hero.sku} not found in products table — skipping`);
      return [];
    }
    return [
      {
        productId: product.id,
        sku: product.sku,
        productName: product.name,
        productDescription: product.description,
        primaryImageUrl: product.primary_image_url,
        category: product.category,
      },
    ];
  });

  if (skuInputs.length === 0) {
    await emit({
      kind: "agent.failed",
      agent: "creative",
      runId,
      projectId,
      error: "No matching products found for hero SKUs",
    });
    return NextResponse.json({ error: "no_matching_products" }, { status: 422 });
  }

  // Run all SKUs in parallel (images within each SKU also parallel — see index.ts)
  const allResults = await Promise.allSettled(
    skuInputs.map((sku) =>
      generateCreativesForSku({ projectId, runId, sku, brief: briefCtx }),
    ),
  );

  const succeeded: string[] = [];
  const failed: string[] = [];

  for (let i = 0; i < allResults.length; i++) {
    const result = allResults[i]!;
    const sku = skuInputs[i]!;
    if (result.status === "fulfilled") {
      succeeded.push(sku.sku);
    } else {
      failed.push(sku.sku);
      console.error(`[creatives] SKU ${sku.sku} failed:`, result.reason);
    }
  }

  const summary = `Generated creatives for ${succeeded.length}/${skuInputs.length} SKUs. ${
    failed.length > 0 ? `Failed: ${failed.join(", ")}.` : ""
  }`;

  await emit({
    kind: "agent.completed",
    agent: "creative",
    runId,
    projectId,
    summary,
  });

  return NextResponse.json({
    runId,
    projectId,
    succeeded,
    failed,
    summary,
  });
}
