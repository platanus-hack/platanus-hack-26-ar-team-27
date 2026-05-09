/**
 * OWNER: Track 3 (Data — catalog + brief).
 * Endpoint: POST /api/brief
 *
 * Body: { source: 'form' | 'upload', text?: string, file?: File }
 *
 * Implementar:
 *  - aceptar texto libre (form) o archivo TXT/MD/PDF (upload)
 *  - extraer texto raw (pdf-parse para .pdf)
 *  - parsear con GPT-4o-mini → BrandBriefParsed
 *  - persistir en brand_briefs
 */
import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { error: "not_implemented", track: "T3" },
    { status: 501 },
  );
}
