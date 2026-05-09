"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";

const steps = ["Catalogo", "Brief", "Confirmar"] as const;

type OnboardingWizardProps = {
  onConfirm: (payload: { brief: string }) => Promise<void>;
  loading: boolean;
};

export function OnboardingWizard({ onConfirm, loading }: OnboardingWizardProps) {
  const [activeStep, setActiveStep] = useState(0);
  const [brief, setBrief] = useState("");
  const [friendlyError, setFriendlyError] = useState<string | null>(null);
  const canContinue = useMemo(() => activeStep < steps.length - 1, [activeStep]);

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
        <div className="space-y-3 rounded-xl border border-dashed border-slate-700 bg-slate-950/70 p-5">
          <p className="text-sm text-slate-200">Subi tu catalogo CSV</p>
          <p className="text-sm text-slate-400">
            Arrastra un archivo o selecciona uno desde tu computadora (maximo 5MB).
          </p>
          <Button variant="outline">Seleccionar CSV</Button>
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
          />
          <Button variant="outline">Subir TXT, MD o PDF</Button>
        </div>
      ) : null}

      {activeStep === 2 ? (
        <div className="space-y-3 rounded-xl border border-emerald-700/50 bg-emerald-950/20 p-5">
          <p className="text-sm text-emerald-200">Todo listo para empezar</p>
          <p className="text-sm text-slate-300">
            Cuando confirmes, disparamos Strategy y luego Creative + Influencer en paralelo.
          </p>
          <Button
            onClick={async () => {
              if (!brief.trim()) {
                setFriendlyError("Necesitamos un brief corto para personalizar la estrategia.");
                return;
              }
              setFriendlyError(null);
              await onConfirm({ brief });
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
          disabled={!canContinue}
        >
          Siguiente
        </Button>
      </div>
    </section>
  );
}
