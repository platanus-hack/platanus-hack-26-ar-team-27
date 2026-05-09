/**
 * OWNER: Track 4 (Creative Engine).
 *
 * Implementar acá:
 *   - generateCreativesForSku({ projectId, runId, productId }): Promise<Creative[]>
 *     - 3 prompts de imagen × image-to-image (vía generateImage wrapper)
 *     - 3 copys por imagen (PAS / AIDA / curiosity) con GPT-4o-mini
 *     - emite artifact.created por cada output (no batch)
 *
 * Default del MVP: MOCK_IMAGE_GEN=true (no se llama a Replicate ni a ningún
 * modelo externo). Cuando esté integrado el modelo NVIDIA gratis, se reemplaza
 * el caller dentro de generateImage() — el resto del pipeline NO cambia.
 *
 * Persistir cada output con CreativeSchema. Status 'ready' o 'failed'.
 */
export {};
