"use client";

import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

const steps = ["Catalogo", "Brief", "Confirmar"] as const;

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

export function OnboardingWizard({ onConfirm, loading }: OnboardingWizardProps) {
  const [activeStep, setActiveStep] = useState(0);
  const [brief, setBrief] = useState("");
  const [catalogFile, setCatalogFile] = useState<File | null>(null);
  const [briefFile, setBriefFile] = useState<File | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [briefError, setBriefError] = useState<string | null>(null);
  const [friendlyError, setFriendlyError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const catalogInputRef = useRef<HTMLInputElement>(null);
  const briefInputRef = useRef<HTMLInputElement>(null);

  const canContinue = useMemo(() => {
    if (activeStep === 0) return catalogFile !== null;
    if (activeStep === 1) return brief.trim().length > 0 || briefFile !== null;
    return false;
  }, [activeStep, catalogFile, brief, briefFile]);

  function pickCatalog(file: File | null | undefined) {
    setCatalogError(null);
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setCatalogError("Tiene que ser un archivo .csv");
      return;
    }
    if (file.size > MAX_CATALOG_BYTES) {
      setCatalogError(`Maximo 5MB (este pesa ${formatBytes(file.size)})`);
      return;
    }
    setCatalogFile(file);
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
      setBriefError(`Maximo 2MB (este pesa ${formatBytes(file.size)})`);
      return;
    }
    setBriefFile(file);
  }

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        {steps.map((step, index) => {
          const isActive = index === activeStep;
          const isDone = index < activeStep;
          return (
            <div
              key={step}
              className="flex items-center gap-2 rounded-full border border-slate-700 px-3 py-1.5"
            >
              <span
                className={
                  isDone
                    ? "text-emerald-300"
                    : isActive
                      ? "text-slate-100"
                      : "text-slate-500"
                }
              >
                {isDone ? "✓" : index + 1}
              </span>
              <span className={isActive ? "text-slate-100" : "text-slate-400"}>{step}</span>
            </div>
          );
        })}
      </div>

      {activeStep === 0 ? (
        <div
          className={`space-y-3 rounded-xl border-2 border-dashed p-5 transition-colors ${
            dragActive
              ? "border-violet-500 bg-violet-950/20"
              : "border-slate-700 bg-slate-950/70"
          }`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragActive(false);
            pickCatalog(e.dataTransfer.files?.[0]);
          }}
        >
          <p className="text-sm text-slate-200">Subi tu catalogo CSV</p>
          <p className="text-sm text-slate-400">
            Arrastra un archivo o seleccionalo. Maximo 5MB. Columnas obligatorias:
            <span className="ml-1 font-mono text-xs text-slate-300">sku, name</span>.
          </p>
          <input
            ref={catalogInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => pickCatalog(e.target.files?.[0])}
          />
          <Button variant="outline" onClick={() => catalogInputRef.current?.click()}>
            {catalogFile ? "Cambiar archivo" : "Seleccionar CSV"}
          </Button>
          {catalogFile ? (
            <p className="text-sm text-emerald-300">
              ✓ {catalogFile.name} ({formatBytes(catalogFile.size)})
            </p>
          ) : null}
          {catalogError ? <p className="text-sm text-amber-300">{catalogError}</p> : null}
        </div>
      ) : null}

      {activeStep === 1 ? (
        <div className="space-y-3 rounded-xl border border-dashed border-slate-700 bg-slate-950/70 p-5">
          <p className="text-sm text-slate-200">Contanos sobre tu marca</p>
          <textarea
            className="h-28 w-full resize-none rounded-lg border border-slate-700 bg-slate-900 p-3 text-sm text-slate-200"
            placeholder="Ej: Marca de moda sostenible para mujeres 25-35..."
            value={brief}
            onChange={(event) => setBrief(event.target.value)}
            disabled={briefFile !== null}
          />
          <p className="text-xs text-slate-500">— o —</p>
          <input
            ref={briefInputRef}
            type="file"
            accept=".txt,.md,.pdf,text/plain,application/pdf"
            className="hidden"
            onChange={(e) => pickBrief(e.target.files?.[0])}
          />
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={() => briefInputRef.current?.click()}>
              {briefFile ? "Cambiar archivo" : "Subir TXT, MD o PDF"}
            </Button>
            {briefFile ? (
              <button
                type="button"
                className="text-xs text-slate-400 underline"
                onClick={() => {
                  setBriefFile(null);
                  if (briefInputRef.current) briefInputRef.current.value = "";
                }}
              >
                Quitar
              </button>
            ) : null}
          </div>
          {briefFile ? (
            <p className="text-sm text-emerald-300">
              ✓ {briefFile.name} ({formatBytes(briefFile.size)})
            </p>
          ) : null}
          {briefError ? <p className="text-sm text-amber-300">{briefError}</p> : null}
        </div>
      ) : null}

      {activeStep === 2 ? (
        <div className="space-y-3 rounded-xl border border-emerald-700/50 bg-emerald-950/20 p-5">
          <p className="text-sm text-emerald-200">Todo listo para empezar</p>
          <ul className="space-y-1 text-sm text-slate-300">
            <li>• Catalogo: {catalogFile ? catalogFile.name : "—"}</li>
            <li>
              • Brief: {briefFile ? briefFile.name : brief ? `${brief.slice(0, 60)}${brief.length > 60 ? "…" : ""}` : "—"}
            </li>
          </ul>
          <p className="text-sm text-slate-400">
            Cuando confirmes, disparamos Strategy y luego Creative + Influencer en paralelo.
          </p>
          <Button
            onClick={async () => {
              if (!catalogFile) {
                setFriendlyError("Falta el catalogo CSV (paso 1).");
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
            }}
            disabled={loading}
          >
            {loading ? "Iniciando flujo..." : "Confirmar y generar estrategia"}
          </Button>
          {friendlyError ? <p className="text-sm text-amber-300">{friendlyError}</p> : null}
        </div>
      ) : null}

      <div className="mt-6 flex items-center justify-between">
        <Button
          variant="ghost"
          onClick={() => setActiveStep((value) => Math.max(0, value - 1))}
          disabled={activeStep === 0}
        >
          Anterior
        </Button>

        <Button
          onClick={() => setActiveStep((value) => Math.min(steps.length - 1, value + 1))}
          disabled={!canContinue || activeStep === steps.length - 1}
        >
          Siguiente
        </Button>
      </div>
    </section>
  );
}
