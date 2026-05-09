/**
 * POST /api/brief — captura del brand brief (form o upload).
 *
 * Acepta:
 *  - JSON  { source: 'form', text: string }
 *  - multipart con field `file` (.txt, .md, .pdf, ≤2MB) y opcional `source: 'upload'`
 *
 * Pipeline:
 *  1. Resolver `raw_text` (de body.text o del archivo).
 *  2. Parsear con GPT-4o-mini → BrandBriefParsed (campos opcionales nullables).
 *  3. Persistir en `brand_briefs` con source = 'form' | 'upload'.
 *
 * Tolera briefs incompletos: si el LLM no extrae algún campo, queda null
 * en DB sin fallar (spec brand-brief, scenario "Brief con campos parciales").
 */
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { getOrCreateProjectId } from "@/lib/project";
import { getSql } from "@/lib/db/pg";
import { BrandBriefParsedSchema } from "@/lib/db/schema";

export const runtime = "nodejs";

const MAX_BYTES = 2 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const ct = req.headers.get("content-type") ?? "";

  let rawText: string;
  let source: "form" | "upload";

  try {
    if (ct.includes("application/json")) {
      const body = (await req.json()) as { text?: string };
      const text = (body.text ?? "").trim();
      if (!text) {
        return NextResponse.json(
          {
            error: "empty_brief",
            message:
              "Necesitamos contexto de tu marca para personalizar los outputs",
          },
          { status: 400 },
        );
      }
      rawText = text;
      source = "form";
    } else if (ct.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      const fallbackText = form.get("text");

      if (file instanceof File) {
        if (file.size > MAX_BYTES) {
          return NextResponse.json(
            { error: "file_too_large", max: MAX_BYTES },
            { status: 400 },
          );
        }
        const ext = file.name.toLowerCase().split(".").pop() ?? "";
        if (!["txt", "md", "pdf"].includes(ext)) {
          return NextResponse.json(
            {
              error: "unsupported_format",
              message: "Formatos aceptados: .txt, .md, .pdf",
            },
            { status: 400 },
          );
        }
        rawText = await extractText(file, ext);
        source = "upload";
      } else if (typeof fallbackText === "string" && fallbackText.trim()) {
        rawText = fallbackText.trim();
        source = "form";
      } else {
        return NextResponse.json(
          { error: "missing_input" },
          { status: 400 },
        );
      }
    } else {
      return NextResponse.json(
        { error: "unsupported_content_type" },
        { status: 400 },
      );
    }
  } catch (err) {
    console.error("[brief] body parse failed", err);
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const projectId = await getOrCreateProjectId();
  const parsed = await parseBriefWithLlm(rawText);
  const sql = getSql();

  const rows = await sql<{ id: string }[]>`
    insert into brand_briefs (
      project_id, raw_text, source,
      brand_name, tone_of_voice, target_description, values, do_not_say
    ) values (
      ${projectId},
      ${rawText},
      ${source},
      ${parsed.brand_name},
      ${parsed.tone_of_voice},
      ${parsed.target_description},
      ${sql.json(parsed.values)},
      ${sql.json(parsed.do_not_say)}
    )
    returning id
  `;

  return NextResponse.json({
    id: rows[0]?.id,
    project_id: projectId,
    source,
    parsed,
    warning:
      !parsed.brand_name && parsed.values.length === 0 && !parsed.tone_of_voice
        ? "El brief no parece tener información estructurada de marca utilizable. Los outputs van a ser más genéricos."
        : null,
  });
}

async function extractText(file: File, ext: string): Promise<string> {
  if (ext === "txt" || ext === "md") {
    return await file.text();
  }
  if (ext === "pdf") {
    const buf = Buffer.from(await file.arrayBuffer());
    // pdf-parse no tiene tipos buenos; el require dinámico evita su test side-effect.
    const pdfParse = (await import("pdf-parse")).default as (
      data: Buffer,
    ) => Promise<{ text: string }>;
    const out = await pdfParse(buf);
    return out.text;
  }
  throw new Error(`unexpected_ext_${ext}`);
}

async function parseBriefWithLlm(rawText: string): Promise<{
  brand_name: string | null;
  tone_of_voice: string | null;
  target_description: string | null;
  values: string[];
  do_not_say: string[];
}> {
  const fallback = {
    brand_name: null,
    tone_of_voice: null,
    target_description: null,
    values: [] as string[],
    do_not_say: [] as string[],
  };

  if (!process.env.OPENAI_API_KEY) {
    console.warn("[brief] OPENAI_API_KEY missing, returning empty parse");
    return fallback;
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content: SYSTEM_PROMPT,
        },
        {
          role: "user",
          content: rawText.slice(0, 12_000),
        },
      ],
    });

    const content = completion.choices[0]?.message?.content ?? "{}";
    const data = JSON.parse(content);

    // Normalizar a strings/arrays con fallback null/[].
    const normalized = {
      brand_name: nullableString(data.brand_name),
      tone_of_voice: nullableString(data.tone_of_voice),
      target_description: nullableString(data.target_description),
      values: stringArray(data.values),
      do_not_say: stringArray(data.do_not_say),
    };
    const validated = BrandBriefParsedSchema.parse(normalized);
    return validated;
  } catch (err) {
    console.error("[brief] LLM parse failed", err);
    return fallback;
  }
}

const SYSTEM_PROMPT = `Sos un parser de brand briefs para retail. Recibís texto libre y devolvés JSON estricto.

Devolvé un objeto con estas claves exactas:
{
  "brand_name": string | null,
  "tone_of_voice": string | null,
  "target_description": string | null,
  "values": string[],
  "do_not_say": string[]
}

Reglas:
- Si un campo no está presente o es ambiguo, devolvelo como null (o [] para los arrays).
- "values": valores de marca (3-7 ítems cortos, ej. ["sustentabilidad", "transparencia"]).
- "do_not_say": frases o conceptos a evitar (puede ser []).
- "tone_of_voice": una frase corta (ej. "cercano, juvenil, sin tecnicismos").
- "target_description": 1-2 oraciones describiendo el cliente ideal.
- NO inventes información que no esté en el texto. Si el brief es vago, dejá campos null.
- Salida JSON puro, sin markdown, sin texto extra.`;

function nullableString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

function stringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === "string" && x.trim() !== "")
    .map((s) => s.trim())
    .slice(0, 12);
}
