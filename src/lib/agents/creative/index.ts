/**
 * OWNER: Track 4 (Creative Engine).
 *
 * Implementar acá:
 *   - generateCreativesForSku({ projectId, runId, productId }): Promise<Creative[]>
 *     - 3 prompts de imagen × image-to-image en Replicate Flux Kontext
 *     - 3 copys por imagen (PAS / AIDA / curiosity) con GPT-4o-mini
 *     - emite artifact.created por cada output (no batch)
 *
 * Si MOCK_IMAGE_GEN=true, usar pickMockImage() de @/lib/mocks/images.
 *
 * Persistir cada output con CreativeSchema. Status 'ready' o 'failed'.
 */
export {};
