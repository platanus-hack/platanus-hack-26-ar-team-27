"use client";

import { useMemo, useRef, useState } from "react";

const steps = [
  { key: "catalog", label: "Catálogo", hint: "CSV con tu inventario" },
  { key: "brief", label: "Brief de marca", hint: "tono, valores, target" },
  { key: "confirm", label: "Confirmar", hint: "disparar agentes" },
] as const;

const MAX_CATALOG_BYTES = 5 * 1024 * 1024;
const MAX_BRIEF_BYTES = 2 * 1024 * 1024;
const BRIEF_EXTS = ["txt", "md", "pdf"] as const;

export type OnboardingPayload = {
  catalogFile: File;
  brief: string;
  briefFile: File | null;
};

type OnboardingWizardProps = {
  onConfirm: (payload: OnboardingPayload) => Promise<void>;
  loading: boolean;
};

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

type CatalogRow = { sku: string; name: string; category: string; price: string };

async function previewCsv(file: File): Promise<{
  rows: number;
  preview: CatalogRow[];
}> {
  const text = await file.text();
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const headerLine = lines[0];
  if (!headerLine) return { rows: 0, preview: [] };
  const headers = headerLine.split(",").map((s) => s.trim().toLowerCase());
  const idx = (key: string) => headers.indexOf(key);
  const skuI = idx("sku");
  const nameI = idx("name");
  const catI = idx("category");
  const priceI = idx("price");
  const preview = lines.slice(1, 5).map((line) => {
    const cols = parseCsvLine(line);
    return {
      sku: skuI >= 0 ? cols[skuI] ?? "—" : "—",
      name: nameI >= 0 ? cols[nameI] ?? "—" : "—",
      category: catI >= 0 ? cols[catI] ?? "—" : "—",
      price: priceI >= 0 ? cols[priceI] ?? "—" : "—",
    };
  });
  return { rows: lines.length - 1, preview };
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === "," && !inQuotes) {
      out.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur.trim());
  return out;
}

function extractBriefHints(text: string): {
  brand: string | null;
  values: string[];
  warns: string[];
} {
  const brand = extractAfter(text, /(luna|marca\s+(?:llamada\s+)?["']?([^"'.,\n]+))/i);
  const values: string[] = [];
  if (/sosten/i.test(text)) values.push("sostenibilidad");
  if (/slow\s*fashion/i.test(text)) values.push("slow fashion");
  if (/atemporal/i.test(text)) values.push("atemporal");
  if (/lino/i.test(text)) values.push("lino");
  if (/satén|saten/i.test(text)) values.push("satén");
  if (/orgánic|organic/i.test(text)) values.push("orgánico");
  if (/transparen/i.test(text)) values.push("transparencia");
  const warns: string[] = [];
  if (/\bfast\b/i.test(text)) warns.push("fast");
  if (/\bbarato\b/i.test(text)) warns.push("barato");
  if (/\bviral\b/i.test(text)) warns.push("viral");
  return { brand, values: values.slice(0, 5), warns };
}

function extractAfter(text: string, re: RegExp): string | null {
  const m = text.match(re);
  if (!m) return null;
  return (m[2] ?? m[1] ?? "").trim().slice(0, 28) || null;
}

export function OnboardingWizard({ onConfirm, loading }: OnboardingWizardProps) {
  const [activeStep, setActiveStep] = useState(0);
  const [brief, setBrief] = useState("");
  const [catalogFile, setCatalogFile] = useState<File | null>(null);
  const [briefFile, setBriefFile] = useState<File | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [briefError, setBriefError] = useState<string | null>(null);
  const [friendlyError, setFriendlyError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [catalogPreview, setCatalogPreview] = useState<{
    rows: number;
    preview: CatalogRow[];
  } | null>(null);

  const catalogInputRef = useRef<HTMLInputElement>(null);
  const briefInputRef = useRef<HTMLInputElement>(null);

  const briefHints = useMemo(() => extractBriefHints(brief), [brief]);

  async function pickCatalog(file: File | null | undefined) {
    setCatalogError(null);
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setCatalogError("Tiene que ser un archivo .csv");
      return;
    }
    if (file.size > MAX_CATALOG_BYTES) {
      setCatalogError(`Máximo 5MB (este pesa ${formatBytes(file.size)})`);
      return;
    }
    setCatalogFile(file);
    try {
      const preview = await previewCsv(file);
      setCatalogPreview(preview);
    } catch {
      setCatalogPreview(null);
    }
  }

  function pickBrief(file: File | null | undefined) {
    setBriefError(null);
    if (!file) return;
    const ext = file.name.toLowerCase().split(".").pop() ?? "";
    if (!BRIEF_EXTS.includes(ext as (typeof BRIEF_EXTS)[number])) {
      setBriefError("Formato no soportado: usa .txt, .md o .pdf");
      return;
    }
    if (file.size > MAX_BRIEF_BYTES) {
      setBriefError(`Máximo 2MB (este pesa ${formatBytes(file.size)})`);
      return;
    }
    setBriefFile(file);
  }

  function stepStatus(index: number): "is-done" | "is-active" | "" {
    if (index < activeStep) return "is-done";
    if (index === activeStep) return "is-active";
    return "";
  }

  async function handleConfirm() {
    if (!catalogFile) {
      setFriendlyError("Falta el catálogo CSV (paso 1).");
      setActiveStep(0);
      return;
    }
    if (!brief.trim() && !briefFile) {
      setFriendlyError("Necesitamos un brief para personalizar la estrategia.");
      setActiveStep(1);
      return;
    }
    setFriendlyError(null);
    await onConfirm({ catalogFile, brief, briefFile });
  }

  return (
    <div className="onb-shell">
      <div className="onb-side">
        <div>
          <div className="kicker">Setup</div>
          <h2
            style={{
              margin: "8px 0 0",
              fontSize: 18,
              fontWeight: 600,
              letterSpacing: "-0.01em",
            }}
          >
            3 cosas y arrancamos
          </h2>
          <p
            style={{
              margin: "8px 0 0",
              color: "var(--fg-1)",
              fontSize: 13,
              lineHeight: 1.55,
            }}
          >
            Subí tu catálogo, contanos cómo habla tu marca y disparamos el equipo
            de 4 agentes en paralelo.
          </p>
        </div>

        <div className="onb-steps">
          {steps.map((step, i) => (
            <button
              type="button"
              key={step.key}
              className={`onb-step ${stepStatus(i)}`}
              onClick={() => setActiveStep(i)}
            >
              <div className="num">{i < activeStep ? "✓" : i + 1}</div>
              <div>
                <div className="label">{step.label}</div>
                <div className="hint">
                  {i === 0 && catalogPreview
                    ? `${catalogFile?.name} · ${catalogPreview.rows} filas`
                    : i === 1 && (briefFile || brief.trim())
                      ? briefFile
                        ? briefFile.name
                        : `${brief.length} caracteres`
                      : step.hint}
                </div>
              </div>
            </button>
          ))}
        </div>

        <div className="onb-helper">
          <b>¿Qué pasa cuando confirmás?</b>
          <br />
          Strategy lee todo, prioriza 3-5 hero SKUs y arma un ICP. Después,
          Creative e Influencer corren <b>en paralelo</b> generando 9 ads y un
          top de creadores con DMs listos.
        </div>
      </div>

      <div className="onb-stage">
        {/* Step 0 — Catalog */}
        {activeStep >= 0 ? (
          <div className="onb-card">
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div>
                <div
                  className="kicker"
                  style={{
                    color: catalogFile ? "var(--launch)" : "var(--fg-2)",
                  }}
                >
                  Paso 1 · {catalogFile ? "listo" : "subir catálogo"}
                </div>
                <h3>{catalogFile ? "Catálogo cargado" : "Subí tu catálogo CSV"}</h3>
              </div>
              {catalogFile ? (
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ fontSize: 12 }}
                  onClick={() => {
                    setCatalogFile(null);
                    setCatalogPreview(null);
                    if (catalogInputRef.current) catalogInputRef.current.value = "";
                  }}
                >
                  Cambiar archivo
                </button>
              ) : null}
            </div>

            <input
              ref={catalogInputRef}
              type="file"
              accept=".csv,text/csv"
              style={{ display: "none" }}
              onChange={(e) => void pickCatalog(e.target.files?.[0])}
            />

            <div
              className={`drop${dragActive ? " dragging" : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragActive(false);
                void pickCatalog(e.dataTransfer.files?.[0]);
              }}
              onClick={() => catalogInputRef.current?.click()}
              role="button"
              tabIndex={0}
            >
              <div className="file-icon" />
              <div>
                <div className="name">
                  {catalogFile ? catalogFile.name : "Arrastrá tu CSV o hacé clic"}
                </div>
                <div className="meta">
                  {catalogFile && catalogPreview
                    ? `${catalogPreview.rows} SKUs · ${formatBytes(catalogFile.size)}`
                    : "Columnas obligatorias: sku, name · máx 5MB"}
                </div>
              </div>
              {catalogFile ? (
                <span className="status done">
                  <span className="ring" />
                  Parseado
                </span>
              ) : (
                <span className="status idle">
                  <span className="ring" />
                  Pendiente
                </span>
              )}
            </div>

            {catalogError ? (
              <p
                style={{
                  marginTop: 10,
                  fontSize: 12,
                  color: "var(--warn)",
                }}
              >
                {catalogError}
              </p>
            ) : null}

            {catalogPreview && catalogPreview.preview.length > 0 ? (
              <div className="preview-table">
                <table>
                  <thead>
                    <tr>
                      <th>sku</th>
                      <th>name</th>
                      <th>category</th>
                      <th>price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {catalogPreview.preview.map((row, i) => (
                      <tr key={i}>
                        <td>{row.sku}</td>
                        <td>{row.name}</td>
                        <td>{row.category}</td>
                        <td>{row.price}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}

            {catalogFile && activeStep === 0 ? (
              <div
                style={{
                  marginTop: 14,
                  display: "flex",
                  justifyContent: "flex-end",
                }}
              >
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => setActiveStep(1)}
                >
                  Continuar al brief →
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Step 1 — Brief */}
        {activeStep >= 1 ? (
          <div className="onb-card">
            <div className="kicker">Paso 2 · {briefFile || brief.trim() ? "listo" : "activo"}</div>
            <h3>Contanos sobre tu marca</h3>
            <p className="lead">
              Texto libre, archivo PDF/MD/TXT, lo que tengas. Mientras escribís,
              previsualizamos cómo va a leer el Strategy Agent.
            </p>

            <div className="brief">
              <textarea
                className="brief-text"
                placeholder="Ej: Luna es una marca de moda slow fashion mediterránea para mujeres de 25-35..."
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
                disabled={briefFile !== null}
              />

              <div className="brief-extracts">
                <div className="extract">
                  <div className="lbl">Brand</div>
                  <div className="val">{briefHints.brand ?? "—"}</div>
                </div>
                <div className="extract">
                  <div className="lbl">Values</div>
                  <div className="chips">
                    {briefHints.values.length === 0 ? (
                      <span className="val" style={{ color: "var(--fg-2)" }}>—</span>
                    ) : (
                      briefHints.values.map((v) => (
                        <span className="chip" key={v}>
                          {v}
                        </span>
                      ))
                    )}
                  </div>
                </div>
                {briefHints.warns.length > 0 ? (
                  <div className="extract">
                    <div className="lbl">Do not say</div>
                    <div className="chips">
                      {briefHints.warns.map((w) => (
                        <span className="chip warn" key={w}>
                          {w}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            <input
              ref={briefInputRef}
              type="file"
              accept=".txt,.md,.pdf,text/plain,application/pdf"
              style={{ display: "none" }}
              onChange={(e) => pickBrief(e.target.files?.[0])}
            />

            <div
              style={{
                marginTop: 16,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="btn"
                  onClick={() => briefInputRef.current?.click()}
                >
                  {briefFile ? "Cambiar archivo" : "Subir TXT, MD o PDF"}
                </button>
                {briefFile ? (
                  <span
                    style={{
                      fontFamily: "var(--mono)",
                      fontSize: 11,
                      color: "var(--fg-2)",
                    }}
                  >
                    {briefFile.name} · {formatBytes(briefFile.size)}
                  </span>
                ) : (
                  <span
                    style={{
                      fontFamily: "var(--mono)",
                      fontSize: 11,
                      color: "var(--fg-2)",
                    }}
                  >
                    · o pegá texto arriba
                  </span>
                )}
                {briefFile ? (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ fontSize: 11 }}
                    onClick={() => {
                      setBriefFile(null);
                      if (briefInputRef.current) briefInputRef.current.value = "";
                    }}
                  >
                    Quitar
                  </button>
                ) : null}
              </div>
              {activeStep === 1 ? (
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!brief.trim() && !briefFile}
                  onClick={() => setActiveStep(2)}
                >
                  Continuar →
                </button>
              ) : null}
            </div>

            {briefError ? (
              <p style={{ marginTop: 10, fontSize: 12, color: "var(--warn)" }}>
                {briefError}
              </p>
            ) : null}
          </div>
        ) : null}

        {/* Step 2 — Confirm */}
        {activeStep >= 2 ? (
          <div
            className="onb-card"
            style={{ borderColor: "var(--launch-line)" }}
          >
            <div className="kicker" style={{ color: "var(--launch)" }}>
              Paso 3 · listo para arrancar
            </div>
            <h3>Disparamos los 4 agentes</h3>
            <p className="lead">
              Cuando confirmes, Strategy lee {catalogFile?.name} y el brief.
              Después Creative + Influencer corren en paralelo.
            </p>

            <div
              style={{
                marginTop: 14,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <div
                style={{
                  fontFamily: "var(--mono)",
                  fontSize: 11,
                  color: "var(--fg-2)",
                }}
              >
                {catalogFile?.name ?? "—"} ·{" "}
                {briefFile ? briefFile.name : `${brief.length} caracteres de brief`}
              </div>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleConfirm}
                disabled={loading}
              >
                {loading ? "Iniciando flujo…" : "Confirmar y generar estrategia →"}
              </button>
            </div>

            {friendlyError ? (
              <p style={{ marginTop: 10, fontSize: 12, color: "var(--warn)" }}>
                {friendlyError}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
