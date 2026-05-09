/**
 * Wrapper único para generación de imagen.
 *
 * Toda llamada a un modelo de imagen pasa por este archivo.
 * Cambiar de proveedor (mock → NVIDIA gratis → Replicate) NO debe requerir
 * tocar el resto del Creative Engine.
 *
 * OWNER: Track 4.
 *
 * Default del MVP (decision D3): MOCK_IMAGE_GEN=true.
 */

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
  source: "mock" | "nvidia" | "replicate";
}

export async function generateImage(
  params: GenerateImageParams,
): Promise<GenerateImageResult> {
  const mockEnabled = process.env.MOCK_IMAGE_GEN !== "false";

  if (mockEnabled) {
    return {
      url: pickMockImage(params.seed),
      promptUsed: params.prompt,
      source: "mock",
    };
  }

  // TODO: integrar modelo NVIDIA gratis acá (Track 4).
  //   const url = await callNvidiaModel(params);
  //   return { url, promptUsed: params.prompt, source: 'nvidia' };
  //
  // Fallback futuro a Replicate Flux Kontext si NVIDIA falla:
  //   const url = await callReplicate(params);
  //   return { url, promptUsed: params.prompt, source: 'replicate' };

  throw new Error(
    "MOCK_IMAGE_GEN=false but no real provider implemented yet. " +
      "Track 4: integrar modelo NVIDIA gratis en lib/agents/creative/image-gen.ts.",
  );
}
