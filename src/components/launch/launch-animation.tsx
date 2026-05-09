/**
 * OWNER: Track 5 (UI) + Track 1 (estilos).
 * Componente del modal "Launch to Meta" — design D10/D15.
 *
 * 4 pasos discretos: Creating campaign / Creating ad set / Uploading creatives / Live ✓
 * Timing: ~3-5s entre pasos (total 10-15s). Accent: emerald.
 */
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

const LAUNCH_STEPS = [
  "Creating campaign...",
  "Creating ad set...",
  "Uploading creatives...",
  "Live ✓",
] as const;

type LaunchAnimationProps = {
  projectCreativeIds: string[];
  onCompleted?: () => void;
  onCancelled?: () => void;
};

export function LaunchAnimation({
  projectCreativeIds,
  onCompleted,
  onCancelled,
}: LaunchAnimationProps) {
  const [activeStep, setActiveStep] = useState(0);
  const [running, setRunning] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancelled, setCancelled] = useState(false);

  const stepTimerRef = useRef<number | null>(null);
  const finishTimerRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const hasCreatives = useMemo(() => projectCreativeIds.length > 0, [projectCreativeIds]);

  function clearStepTimer() {
    if (stepTimerRef.current) {
      window.clearInterval(stepTimerRef.current);
      stepTimerRef.current = null;
    }
  }

  function clearTimers() {
    clearStepTimer();
    if (finishTimerRef.current) {
      window.clearTimeout(finishTimerRef.current);
      finishTimerRef.current = null;
    }
  }

  function cancelLaunch() {
    clearTimers();
    abortRef.current?.abort();
    abortRef.current = null;
    setCancelled(true);
    setRunning(false);
    setIsDone(false);
    setActiveStep(0);
    setError(null);
    onCancelled?.();
  }

  async function persistLaunch() {
    const controller = new AbortController();
    abortRef.current = controller;

    const response = await fetch("/api/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ creativeIds: projectCreativeIds }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(payload.error ?? "launch_failed");
    }
  }

  async function runLaunch() {
    if (!hasCreatives) return;

    setCancelled(false);
    setRunning(true);
    setIsDone(false);
    setError(null);
    setActiveStep(0);

    stepTimerRef.current = window.setInterval(() => {
      setActiveStep((value) => {
        if (value >= LAUNCH_STEPS.length - 1) {
          clearStepTimer();
          return value;
        }
        return value + 1;
      });
    }, 3000);

    try {
      finishTimerRef.current = window.setTimeout(async () => {
        if (cancelled) return;
        try {
          await persistLaunch();
        } catch (caught) {
          setRunning(false);
          setError(caught instanceof Error ? caught.message : "launch_failed");
          return;
        }
        setIsDone(true);
        setRunning(false);
        onCompleted?.();
      }, 12000);
    } catch (caught) {
      setRunning(false);
      clearTimers();
      setError(caught instanceof Error ? caught.message : "launch_failed");
    }
  }

  useEffect(() => {
    return () => {
      clearTimers();
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, []);

  return (
    <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-900 p-6">
      <div className="space-y-2">
        {LAUNCH_STEPS.map((label, index) => {
          const done = index < activeStep || (isDone && index === activeStep);
          const active = running && index === activeStep;

          return (
            <div
              key={label}
              className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2"
            >
              <span
                className={
                  done
                    ? "text-emerald-300"
                    : active
                      ? "text-agent-launch animate-pulse"
                      : "text-slate-500"
                }
              >
                {done ? "✓" : "○"}
              </span>
              <span className={active ? "text-slate-100" : "text-slate-400"}>{label}</span>
            </div>
          );
        })}
      </div>

      {error ? (
        <p className="text-sm text-amber-300">
          No pudimos terminar el launch ahora ({error}). Probemos de nuevo en unos segundos.
        </p>
      ) : null}
      {!hasCreatives ? (
        <p className="text-sm text-slate-400">
          Cuando tengas creativos listos, este boton se habilita automaticamente.
        </p>
      ) : null}

      <div className="flex items-center gap-3 pt-2">
        <Button onClick={runLaunch} disabled={running || !hasCreatives}>
          {running ? "Lanzando..." : "Iniciar launch"}
        </Button>
        <Button variant="ghost" onClick={cancelLaunch}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
