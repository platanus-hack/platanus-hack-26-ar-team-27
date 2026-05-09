/**
 * Wrapper único para generación de imagen.
 *
 * Toda llamada a un modelo de imagen pasa por este archivo.
 * Cambiar de proveedor (mock → OpenAI gpt-image-1 → otros) NO debe requerir
 * tocar el resto del Creative Engine.
 *
 * OWNER: Track 4.
 *
 * Default actual: OpenAI gpt-image-1 con quality=low (~$0.011/img, lo más
 * barato del catálogo). MOCK_IMAGE_GEN=true fuerza placeholders Unsplash.
 */

import OpenAI from "openai";
import { pickMockImage } from "@/lib/mocks/images";

export interface GenerateImageParams {
  /** URL pública del packshot del producto. Puede ser null si el SKU no tiene imagen. */
  productImageUrl: string | null;
  /** Prompt de la nueva escena/contexto. */
  prompt: string;
  /** Seed para reproducibilidad / dedupe (ej. `${sku}:${style}`). */
  seed: string;
}

export interface GenerateImageResult {
  url: string;
  promptUsed: string;
  /** Identificador del backend que generó la imagen. */
  source: "mock" | "openai";
}

export async function generateImage(
  params: GenerateImageParams,
): Promise<GenerateImageResult> {
  const mockEnabled = process.env.MOCK_IMAGE_GEN === "true";

  if (mockEnabled) {
    return {
      url: pickMockImage(params.seed),
      promptUsed: params.prompt,
      source: "mock",
    };
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn(
      "[image-gen] OPENAI_API_KEY missing — fallback a mock Unsplash.",
    );
    return {
      url: pickMockImage(params.seed),
      promptUsed: params.prompt,
      source: "mock",
    };
  }

  const openai = new OpenAI({ apiKey });

  try {
    const response = await openai.images.generate({
      model: "gpt-image-1",
      prompt: params.prompt,
      size: "1024x1024",
      quality: "low",
      n: 1,
    });
    const b64 = response.data?.[0]?.b64_json;
    if (!b64) throw new Error("no_image_in_response");
    return {
      url: `data:image/png;base64,${b64}`,
      promptUsed: params.prompt,
      source: "openai",
    };
  } catch (err) {
    console.error(
      "[image-gen] OpenAI gpt-image-1 falló — fallback a mock.",
      err,
    );
    return {
      url: pickMockImage(params.seed),
      promptUsed: params.prompt,
      source: "mock",
    };
  }
}
