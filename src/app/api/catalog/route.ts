/**
 * OWNER: Track 3 (Data — catalog + brief).
 * Endpoint: POST /api/catalog (subir CSV)
 *
 * Implementar:
 *  - validar archivo .csv (max 5MB)
 *  - parsear con papaparse, columnas: sku, name, description, price, cost, stock, category, image_url
 *  - rechazar si faltan obligatorias (sku, name)
 *  - upsert por (project_id, sku)
 *  - devolver { inserted, warnings[] }
 */
import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { error: "not_implemented", track: "T3" },
    { status: 501 },
  );
}
