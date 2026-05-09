/**
 * POST /api/creatives
 * Body: { strategyId?: string }
 *
 * Si no se pasa strategyId, agarra el último de la cookie de proyecto.
 *
 * Lee hero_skus de la strategy, fetchea productos y brief, y para cada SKU
 * genera 9 creativos (3 imágenes × 3 copies). Persiste en `creatives` y
 * devuelve las filas listas para que el UI las renderee.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "crypto";
import { getSql } from "@/lib/db/pg";
import { publishEvent } from "@/lib/events/publish";
import type { AgentEvent } from "@/lib/events/types";
import { generateCreativesForSku } from "@/lib/agents/creative";
import type { BriefContext, SkuInput } from "@/lib/agents/creative";
import { getOrCreateProjectId } from "@/lib/project";

// Omit<union, key> in TS doesn't distribute — wrapper keeps full type safety.
type EventInput = AgentEvent extends infer E ? E extends AgentEvent ? Omit<E, "ts"> : never : never;
function emit(event: EventInput) {
  return publishEvent(event as Parameters<typeof publishEvent>[0]);
}

const BodySchema = z.object({
  strategyId: z.string().uuid().optional(),
});

export async function POST(req: NextRequest) {
  let body: unknown = {};
  const ct = req.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    body = await req.json().catch(() => ({}));
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_error", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const sql = getSql();

  let strategyId = parsed.data.strategyId;
  let projectId: string;

  if (strategyId) {
    const [row] = await sql<{ id: string; project_id: string }[]>`
      select id, project_id from strategies where id = ${strategyId} limit 1
    `;
    if (!row) {
      return NextResponse.json({ error: "strategy_not_found" }, { status: 404 });
    }
    projectId = row.project_id;
  } else {
    projectId = await getOrCreateProjectId();
    const [row] = await sql<{ id: string }[]>`
      select id from strategies
      where project_id = ${projectId}
      order by created_at desc
      limit 1
    `;
    if (!row) {
      return NextResponse.json(
        { error: "no_strategy_for_project" },
        { status: 404 },
      );
    }
    strategyId = row.id;
  }

  const [strategy] = await sql<
    { id: string; project_id: string; hero_skus: unknown }[]
  >`
    select id, project_id, hero_skus from strategies where id = ${strategyId} limit 1
  `;

  if (!strategy) {
    return NextResponse.json({ error: "strategy_not_found" }, { status: 404 });
  }

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

  // Devolver las filas reales para que el UI las renderee.
  // Tomamos solo los `copy` rows porque cada uno trae también el asset_url
  // de su imagen asociada (el Creative Engine los persiste con la imagen
  // referenciada). Eso da exactamente 3 styles × 3 frameworks = 9 por SKU.
  const creativeRows = await sql<
    {
      id: string;
      sku: string;
      variant_label: string | null;
      asset_url: string | null;
      copy_text: string | null;
    }[]
  >`
    select c.id, p.sku, c.variant_label, c.asset_url, c.copy_text
    from creatives c
    join products p on p.id = c.product_id
    where c.project_id = ${projectId}
      and c.type = 'copy'
      and c.status = 'ready'
      and p.sku = any(${skuValues})
    order by c.created_at desc
  `;

  // Variant labels DB: ${sku}:copy:${style}:${framework} → UI: "${style} · ${framework}"
  const creatives = creativeRows.map((row) => {
    const parts = (row.variant_label ?? "").split(":");
    const style = parts[2] ?? "lifestyle";
    const framework = parts[3] ?? "PAS";
    return {
      id: row.id,
      heroSku: row.sku,
      variant_label: `${style} · ${framework}`,
      asset_url: row.asset_url,
      copy_text: row.copy_text,
    };
  });

  return NextResponse.json({
    runId,
    projectId,
    strategyId,
    succeeded,
    failed,
    summary,
    creatives,
  });
}
