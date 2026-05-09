/**
 * Creative Engine — Track 4.
 *
 * generateCreativesForSku(): 3 images × 3 copies = 9 ads per hero SKU.
 * Images run in parallel within the same SKU.
 * Emits artifact.created per output (not batch).
 * Persists each output in `creatives` with status='ready' or 'failed'.
 * SKUs without image: skip image-gen, copy-only with placeholder.
 */

import { getSql } from "@/lib/db/pg";
import { publishEvent } from "@/lib/events/publish";
import type { AgentEvent } from "@/lib/events/types";
import { generateImage } from "./image-gen";
import { buildImagePrompts } from "./prompt-builder";
import { generateCopy } from "./copy-gen";
import type { ImageStyle, CopyFramework } from "@/lib/db/schema";

// Omit<union, key> in TS doesn't distribute — use this wrapper to keep full type safety.
type EventInput = AgentEvent extends infer E ? E extends AgentEvent ? Omit<E, "ts"> : never : never;
function emit(event: EventInput) {
  return publishEvent(event as Parameters<typeof publishEvent>[0]);
}

const COPY_FRAMEWORKS: CopyFramework[] = ["PAS", "AIDA", "curiosity"];

export interface SkuInput {
  productId: string;
  sku: string;
  productName: string;
  productDescription: string | null;
  primaryImageUrl: string | null;
  category: string | null;
}

export interface BriefContext {
  brandName: string | null;
  toneOfVoice: string | null;
  targetDescription: string | null;
  doNotSay: string[];
}

export interface GenerateCreativesParams {
  projectId: string;
  runId: string;
  sku: SkuInput;
  brief: BriefContext;
}

interface CreativeRow {
  id: string;
  status: "ready" | "failed";
  variant_label: string;
}

export async function generateCreativesForSku(
  params: GenerateCreativesParams,
): Promise<CreativeRow[]> {
  const { projectId, runId, sku, brief } = params;
  const sql = getSql();
  const results: CreativeRow[] = [];

  const imagePrompts = buildImagePrompts({
    productName: sku.productName,
    productDescription: sku.productDescription,
    category: sku.category,
    brandName: brief.brandName,
    toneOfVoice: brief.toneOfVoice,
    targetDescription: brief.targetDescription,
  });

  // Generate all 3 images in parallel within this SKU. generateImage tiene
  // fallback graceful: si gpt-image-1 falla o falta API key, devuelve un mock
  // de Unsplash con seed por variante (3 imágenes distintas por SKU).
  const imageResults = await Promise.all(
    imagePrompts.map(async ({ style, prompt }) => {
      const variantLabel = `${sku.sku}:image:${style}`;

      try {
        const result = await generateImage({
          productImageUrl: sku.primaryImageUrl,
          prompt,
          seed: variantLabel,
        });
        return {
          style,
          prompt,
          imageUrl: result.url,
          source: result.source,
          isCopyOnly: false,
        };
      } catch (err) {
        console.error(`[creative] image failed for ${variantLabel}`, err);

        // Persist failed image record
        const [row] = await sql<{ id: string }[]>`
          insert into creatives (project_id, product_id, type, asset_url, prompt_used, variant_label, status)
          values (
            ${projectId},
            ${sku.productId},
            'image',
            null,
            ${prompt},
            ${variantLabel},
            'failed'
          )
          returning id
        `;
        if (row) {
          results.push({ id: row.id, status: "failed", variant_label: variantLabel });
          await emit({
            kind: "artifact.created",
            agent: "creative",
            runId,
            projectId,
            type: "creative",
            ref: row.id,
          });
        }
        return null;
      }
    }),
  );

  // For each successful image, persist image record then generate 3 copies
  for (const imgResult of imageResults) {
    if (!imgResult) continue;

    const { style, prompt, imageUrl } = imgResult;
    const imageVariantLabel = `${sku.sku}:image:${style}`;

    // Persist image (or placeholder for copy-only)
    const [imageRow] = await sql<{ id: string }[]>`
      insert into creatives (project_id, product_id, type, asset_url, prompt_used, variant_label, status)
      values (
        ${projectId},
        ${sku.productId},
        'image',
        ${imageUrl},
        ${prompt},
        ${imageVariantLabel},
        'ready'
      )
      returning id
    `;

    if (imageRow) {
      results.push({ id: imageRow.id, status: "ready", variant_label: imageVariantLabel });
      await emit({
        kind: "artifact.created",
        agent: "creative",
        runId,
        projectId,
        type: "creative",
        ref: imageRow.id,
      });
    }

    // Generate 3 copies per image (sequential is fine; they're cheap/fast)
    for (const framework of COPY_FRAMEWORKS) {
      const copyVariantLabel = `${sku.sku}:copy:${style as ImageStyle}:${framework}`;

      try {
        const copyResult = await generateCopy({
          productName: sku.productName,
          productDescription: sku.productDescription,
          imagePrompt: prompt,
          framework,
          brandName: brief.brandName,
          toneOfVoice: brief.toneOfVoice,
          doNotSay: brief.doNotSay,
        });

        const [copyRow] = await sql<{ id: string }[]>`
          insert into creatives (project_id, product_id, type, asset_url, copy_text, prompt_used, variant_label, status)
          values (
            ${projectId},
            ${sku.productId},
            'copy',
            ${imageUrl},
            ${copyResult.copyText},
            ${prompt},
            ${copyVariantLabel},
            'ready'
          )
          returning id
        `;

        if (copyRow) {
          results.push({ id: copyRow.id, status: "ready", variant_label: copyVariantLabel });
          await emit({
            kind: "artifact.created",
            agent: "creative",
            runId,
            projectId,
            type: "creative",
            ref: copyRow.id,
          });
        }
      } catch (err) {
        console.error(`[creative] copy failed for ${copyVariantLabel}`, err);

        const [copyRow] = await sql<{ id: string }[]>`
          insert into creatives (project_id, product_id, type, asset_url, copy_text, prompt_used, variant_label, status)
          values (
            ${projectId},
            ${sku.productId},
            'copy',
            ${imageUrl},
            null,
            ${prompt},
            ${copyVariantLabel},
            'failed'
          )
          returning id
        `;

        if (copyRow) {
          results.push({ id: copyRow.id, status: "failed", variant_label: copyVariantLabel });
          await emit({
            kind: "artifact.created",
            agent: "creative",
            runId,
            projectId,
            type: "creative",
            ref: copyRow.id,
          });
        }
      }
    }
  }

  return results;
}
