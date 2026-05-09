/**
 * OWNER: Track 4 (Creative Engine).
 * Endpoint: POST /api/creatives  (generate-batch)
 *
 * Body: { strategyId: string }  (lee hero_skus de la strategy)
 *
 * Implementar:
 *  - por cada hero SKU: 3 imágenes × 3 copys = 9 creatives
 *  - paralelizar imágenes dentro de UN MISMO SKU
 *  - emitir artifact.created por cada output (no batch)
 *  - persistir en creatives
 */
import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { error: "not_implemented", track: "T4" },
    { status: 501 },
  );
}
