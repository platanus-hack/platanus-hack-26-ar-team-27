/**
 * POST /api/catalog — sube CSV de productos.
 *
 * Acepta multipart/form-data con field `file` (.csv, ≤5MB).
 * Campos canónicos:
 *   obligatorios: sku, name
 *   opcionales:   description, price, cost, stock, category, image_url
 *
 * Si los headers del CSV no coinciden con los canónicos (por ejemplo
 * "nombre", "código", "precio_venta", "img"), un LLM mapea cada header
 * disponible al campo canónico correspondiente. Si el LLM falla o no se
 * puede resolver `sku`/`name`, se rechaza con un error explícito.
 *
 * - tolera columnas opcionales faltantes con warning.
 * - reemplaza catálogo del proyecto (delete-then-insert).
 * - image_url se guarda tal cual en primary_image_url (sin re-upload).
 */
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import Papa from "papaparse";
import { getOrCreateProjectId } from "@/lib/project";
import { getSql } from "@/lib/db/pg";

export const runtime = "nodejs";

const MAX_BYTES = 5 * 1024 * 1024;

const REQUIRED = ["sku", "name"] as const;
const OPTIONAL = [
  "description",
  "price",
  "cost",
  "stock",
  "category",
  "image_url",
] as const;
type Canonical = (typeof REQUIRED)[number] | (typeof OPTIONAL)[number];

type CsvRow = Record<string, string>;

/** Mapping canonical → header del CSV (lowercased). null = no mapeado. */
type ColumnMap = Record<Canonical, string | null>;

export async function POST(req: NextRequest) {
  const ct = req.headers.get("content-type") ?? "";
  if (!ct.includes("multipart/form-data")) {
    return NextResponse.json(
      { error: "expected multipart/form-data" },
      { status: 400 },
    );
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "missing 'file' field" },
      { status: 400 },
    );
  }

  if (!file.name.toLowerCase().endsWith(".csv")) {
    return NextResponse.json(
      { error: "only .csv files accepted" },
      { status: 400 },
    );
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "file too large (max 5MB)" },
      { status: 400 },
    );
  }

  const text = await file.text();

  const parsed = Papa.parse<CsvRow>(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim().toLowerCase(),
  });

  if (parsed.errors.length > 0) {
    const fatal = parsed.errors.find((e) => e.type === "Quotes");
    if (fatal) {
      return NextResponse.json(
        { error: "csv_parse_error", details: parsed.errors.slice(0, 3) },
        { status: 400 },
      );
    }
  }

  const headers = parsed.meta.fields ?? [];
  if (headers.length === 0) {
    return NextResponse.json(
      { error: "empty_csv", message: "El CSV no tiene headers." },
      { status: 400 },
    );
  }

  // Resolver columnas: primero literal, después LLM si faltan obligatorias.
  let columnMap = literalColumnMap(headers);
  let mappingSource: "literal" | "llm" | "mixed" = "literal";
  const literalMissing = REQUIRED.filter((c) => columnMap[c] === null);

  if (literalMissing.length > 0) {
    const llmMap = await mapColumnsWithLlm(headers, parsed.data.slice(0, 3));
    if (llmMap) {
      // Mergear: el literal tiene prioridad; el LLM rellena lo faltante.
      const merged: ColumnMap = { ...columnMap };
      let usedLlm = false;
      for (const c of [...REQUIRED, ...OPTIONAL] as Canonical[]) {
        if (merged[c] === null && llmMap[c] && headers.includes(llmMap[c]!)) {
          merged[c] = llmMap[c];
          usedLlm = true;
        }
      }
      columnMap = merged;
      mappingSource = usedLlm ? "llm" : "literal";
      // Si había literales válidos y el LLM agregó otros, marcar mixed.
      if (
        usedLlm &&
        REQUIRED.some(
          (c) => columnMap[c] !== null && headers.includes(c),
        )
      ) {
        mappingSource = "mixed";
      }
    }
  }

  const stillMissing = REQUIRED.filter((c) => columnMap[c] === null);
  if (stillMissing.length > 0) {
    return NextResponse.json(
      {
        error: "missing_required_columns",
        missing: stillMissing,
        headers,
        message: `No pudimos identificar columnas para: ${stillMissing.join(", ")}. Headers detectados: ${headers.join(", ")}.`,
      },
      { status: 400 },
    );
  }

  const missingOptional = OPTIONAL.filter((c) => columnMap[c] === null);

  const projectId = await getOrCreateProjectId();
  const sql = getSql();

  const seenSkus = new Map<string, NormalizedRow>();
  const skipped: Array<{ row: number; reason: string }> = [];

  parsed.data.forEach((row, idx) => {
    const normalized = applyMapping(row, columnMap);
    if (!normalized.sku || !normalized.name) {
      skipped.push({ row: idx + 2, reason: "missing sku or name" });
      return;
    }
    seenSkus.set(normalized.sku, normalized);
  });

  // Reemplazar el catálogo del proyecto: una nueva subida = catálogo nuevo.
  // El cascade en `creatives.product_id` limpia creativos viejos asociados.
  await sql`delete from products where project_id = ${projectId}`;

  let inserted = 0;
  for (const row of seenSkus.values()) {
    try {
      await sql`
        insert into products (
          project_id, sku, name, description, price, cost, stock, category, primary_image_url
        ) values (
          ${projectId},
          ${row.sku},
          ${row.name},
          ${row.description},
          ${row.price},
          ${row.cost},
          ${row.stock},
          ${row.category},
          ${row.image_url}
        )
      `;
      inserted++;
    } catch (err) {
      console.error("[catalog] insert failed", err, row);
      skipped.push({ row: -1, reason: `db error for sku=${row.sku}` });
    }
  }

  return NextResponse.json({
    project_id: projectId,
    inserted,
    skipped,
    column_map: columnMap,
    mapping_source: mappingSource,
    warnings:
      missingOptional.length > 0
        ? [
            `Columnas opcionales no detectadas: ${missingOptional.join(", ")}`,
          ]
        : [],
    duplicates_collapsed: parsed.data.length - seenSkus.size - skipped.length,
  });
}

// ============================================================
// Mapping helpers
// ============================================================

function literalColumnMap(headers: string[]): ColumnMap {
  const set = new Set(headers);
  const map = {} as ColumnMap;
  for (const c of [...REQUIRED, ...OPTIONAL] as Canonical[]) {
    map[c] = set.has(c) ? c : null;
  }
  return map;
}

type NormalizedRow = {
  sku: string;
  name: string;
  description: string | null;
  price: number | null;
  cost: number | null;
  stock: number | null;
  category: string | null;
  image_url: string | null;
};

function applyMapping(row: CsvRow, map: ColumnMap): NormalizedRow {
  const get = (c: Canonical): string | undefined => {
    const header = map[c];
    if (!header) return undefined;
    return row[header];
  };
  return {
    sku: (get("sku") ?? "").trim(),
    name: (get("name") ?? "").trim(),
    description: strOrNull(get("description")),
    price: numOrNull(get("price")),
    cost: numOrNull(get("cost")),
    stock: intOrNull(get("stock")),
    category: strOrNull(get("category")),
    image_url: strOrNull(get("image_url")),
  };
}

async function mapColumnsWithLlm(
  headers: string[],
  sampleRows: CsvRow[],
): Promise<ColumnMap | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn("[catalog] OPENAI_API_KEY missing — skip LLM column mapping.");
    return null;
  }

  const openai = new OpenAI({ apiKey });

  const sampleText = sampleRows
    .map((r, i) => {
      const pairs = headers
        .map((h) => `${h}=${truncate(String(r[h] ?? ""), 60)}`)
        .join(" | ");
      return `fila ${i + 1}: ${pairs}`;
    })
    .join("\n");

  const system = `Sos un mapper de columnas de catálogos de retail. Recibís una lista de headers de un CSV (en cualquier idioma) y unas filas de ejemplo, y devolvés JSON puro mapeando los siguientes campos canónicos al header más cercano del CSV (o null si no existe):

CAMPOS CANÓNICOS:
- sku: identificador único del producto (ej. "código", "id", "sku", "product_id", "ref")
- name: nombre del producto (ej. "nombre", "producto", "title", "name")
- description: descripción larga (ej. "descripcion", "detalle", "desc")
- price: precio de venta al público (ej. "precio", "pvp", "price", "precio_venta")
- cost: costo del producto (ej. "costo", "cost", "coste", "precio_costo")
- stock: unidades disponibles (ej. "stock", "inventario", "existencias", "qty")
- category: categoría/tipo (ej. "categoria", "tipo", "category", "rubro")
- image_url: URL de la imagen principal (ej. "imagen", "foto", "img", "image_url", "url")

REGLAS:
- Devolvé SOLO el JSON, sin markdown, sin texto antes o después.
- Cada valor debe ser exactamente uno de los headers del CSV (lowercase) o null.
- Si dos headers podrían mapear a un campo, elegí el más obvio basado en las filas de ejemplo.
- Si no encontrás un match razonable, usá null en vez de inventar.

FORMATO:
{ "sku": "<header>" | null, "name": "<header>" | null, "description": "<header>" | null, "price": "<header>" | null, "cost": "<header>" | null, "stock": "<header>" | null, "category": "<header>" | null, "image_url": "<header>" | null }`;

  const user = `HEADERS DEL CSV: ${headers.join(", ")}

FILAS DE EJEMPLO:
${sampleText}

Devolvé el JSON ahora.`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      temperature: 0,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) return null;
    const parsed = JSON.parse(content) as Record<string, unknown>;
    const headerSet = new Set(headers);
    const out = {} as ColumnMap;
    for (const c of [...REQUIRED, ...OPTIONAL] as Canonical[]) {
      const v = parsed[c];
      if (typeof v === "string" && headerSet.has(v.toLowerCase())) {
        out[c] = v.toLowerCase();
      } else {
        out[c] = null;
      }
    }
    return out;
  } catch (err) {
    console.error("[catalog] LLM column mapping failed", err);
    return null;
  }
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}

function strOrNull(v: string | undefined): string | null {
  if (v == null) return null;
  const t = v.trim();
  return t === "" ? null : t;
}
function numOrNull(v: string | undefined): number | null {
  const s = strOrNull(v);
  if (s == null) return null;
  const n = Number(s.replace(/[^\d.\-]/g, ""));
  return Number.isFinite(n) ? n : null;
}
function intOrNull(v: string | undefined): number | null {
  const n = numOrNull(v);
  if (n == null) return null;
  return Math.trunc(n);
}
