/**
 * POST /api/catalog — sube CSV de productos.
 *
 * Acepta multipart/form-data con field `file` (.csv, ≤5MB).
 * Columnas:
 *   obligatorias: sku, name
 *   opcionales:   description, price, cost, stock, category, image_url
 *
 * Comportamiento (spec capability `catalog`):
 *  - tolera columnas opcionales faltantes con warning.
 *  - rechaza si falta sku o name.
 *  - upsert por (project_id, sku): última fila gana.
 *  - image_url se guarda tal cual en primary_image_url (sin re-upload).
 */
import { NextRequest, NextResponse } from "next/server";
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

type CsvRow = Partial<
  Record<(typeof REQUIRED)[number] | (typeof OPTIONAL)[number], string>
>;

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
  const missingRequired = REQUIRED.filter((h) => !headers.includes(h));
  if (missingRequired.length > 0) {
    return NextResponse.json(
      {
        error: "missing_required_columns",
        missing: missingRequired,
        message: `Falta(n) columna(s) obligatoria(s): ${missingRequired.join(", ")}`,
      },
      { status: 400 },
    );
  }

  const missingOptional = OPTIONAL.filter((h) => !headers.includes(h));

  const projectId = await getOrCreateProjectId();
  const sql = getSql();

  const seenSkus = new Map<string, CsvRow>();
  const skipped: Array<{ row: number; reason: string }> = [];

  parsed.data.forEach((row, idx) => {
    const sku = row.sku?.trim();
    const name = row.name?.trim();
    if (!sku || !name) {
      skipped.push({ row: idx + 2, reason: "missing sku or name" });
      return;
    }
    seenSkus.set(sku, { ...row, sku, name });
  });

  let inserted = 0;
  for (const row of seenSkus.values()) {
    try {
      const price = numOrNull(row.price);
      const cost = numOrNull(row.cost);
      const stock = intOrNull(row.stock);
      const description = strOrNull(row.description);
      const category = strOrNull(row.category);
      const imageUrl = strOrNull(row.image_url);

      await sql`
        insert into products (
          project_id, sku, name, description, price, cost, stock, category, primary_image_url
        ) values (
          ${projectId},
          ${row.sku ?? ""},
          ${row.name ?? ""},
          ${description},
          ${price},
          ${cost},
          ${stock},
          ${category},
          ${imageUrl}
        )
        on conflict (project_id, sku) do update set
          name = excluded.name,
          description = excluded.description,
          price = excluded.price,
          cost = excluded.cost,
          stock = excluded.stock,
          category = excluded.category,
          primary_image_url = excluded.primary_image_url
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
    warnings:
      missingOptional.length > 0
        ? [
            `Columnas opcionales no encontradas: ${missingOptional.join(", ")}`,
          ]
        : [],
    duplicates_collapsed: parsed.data.length - seenSkus.size - skipped.length,
  });
}

function strOrNull(v: string | undefined): string | null {
  if (v == null) return null;
  const t = v.trim();
  return t === "" ? null : t;
}
function numOrNull(v: string | undefined): number | null {
  const s = strOrNull(v);
  if (s == null) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
function intOrNull(v: string | undefined): number | null {
  const n = numOrNull(v);
  if (n == null) return null;
  return Math.trunc(n);
}
