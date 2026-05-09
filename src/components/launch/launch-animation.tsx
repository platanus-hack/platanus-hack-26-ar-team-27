/**
 * LaunchAnimation — modal "Launch to Meta" según launch-artboard.jsx.
 *
 * 4 pasos discretos: Creating campaign / Creating ad set / Uploading creatives / Live ✓
 * Timing: ~3s entre pasos (total ~12s). Accent: emerald.
 */
"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const LAUNCH_STEPS = [
  "Creating campaign",
  "Creating ad set · ICP 25-35 / Argentina",
  "Uploading creatives",
  "Live ✓",
] as const;

type LaunchAnimationProps = {
  projectCreativeIds: string[];
  onClose: () => void;
};

export function LaunchAnimation({
  projectCreativeIds,
  onClose,
}: LaunchAnimationProps) {
  const [activeStep, setActiveStep] = useState(0);
  const [running, setRunning] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());

  const stepTimerRef = useRef<number | null>(null);
  const finishTimerRef = useRef<number | null>(null);
  const tickRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const hasCreatives = useMemo(
    () => projectCreativeIds.length > 0,
    [projectCreativeIds],
  );

  function clearTimers() {
    if (stepTimerRef.current) {
      window.clearInterval(stepTimerRef.current);
      stepTimerRef.current = null;
    }
    if (finishTimerRef.current) {
      window.clearTimeout(finishTimerRef.current);
      finishTimerRef.current = null;
    }
    if (tickRef.current) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }

  function cancelLaunch() {
    clearTimers();
    abortRef.current?.abort();
    abortRef.current = null;
    setRunning(false);
    setIsDone(false);
    setActiveStep(0);
    setError(null);
    setStartedAt(null);
    onClose();
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
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      throw new Error(payload.error ?? "launch_failed");
    }
  }

  async function runLaunch() {
    if (!hasCreatives) return;

    clearTimers();
    setRunning(true);
    setIsDone(false);
    setError(null);
    setActiveStep(0);
    setStartedAt(Date.now());

    tickRef.current = window.setInterval(() => setNow(Date.now()), 250);

    stepTimerRef.current = window.setInterval(() => {
      setActiveStep((value) => {
        if (value >= LAUNCH_STEPS.length - 1) {
          if (stepTimerRef.current) {
            window.clearInterval(stepTimerRef.current);
            stepTimerRef.current = null;
          }
          return value;
        }
        return value + 1;
      });
    }, 3000);

    finishTimerRef.current = window.setTimeout(async () => {
      try {
        await persistLaunch();
      } catch (caught) {
        clearTimers();
        setRunning(false);
        setError(caught instanceof Error ? caught.message : "launch_failed");
        return;
      }
      clearTimers();
      setIsDone(true);
      setRunning(false);
    }, 12000);
  }

  useEffect(() => {
    return () => {
      clearTimers();
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, []);

  const elapsedMs = startedAt ? now - startedAt : 0;
  const totalMs = 12000;
  const progress = isDone ? 100 : Math.min((elapsedMs / totalMs) * 100, 95);

  return (
    <div className="launch-overlay" role="dialog" aria-modal>
      <div className="dim" onClick={onClose} />
      <div className="launch-modal">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div>
            <div className="kicker" style={{ color: "var(--launch)" }}>
              Launch · mock seguro
            </div>
            <h3>
              {isDone
                ? "Campaña configurada"
                : running
                  ? "Configurando tu campaña en Meta"
                  : "Listo para lanzar"}
            </h3>
          </div>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cerrar
          </button>
        </div>
        <p className="lead">
          {projectCreativeIds.length} creativos · presupuesto inicial{" "}
          <span style={{ fontFamily: "var(--mono)", color: "var(--fg)" }}>
            USD 50/día
          </span>
          . Cero requests reales a graph.facebook.com — esto persiste un
          campaign mock para la demo.
        </p>

        <div className="launch-list">
          {LAUNCH_STEPS.map((label, index) => {
            const done = index < activeStep || (isDone && index === activeStep);
            const active = running && index === activeStep && !isDone;
            return (
              <div
                key={label}
                className={`launch-row${done ? " is-done" : active ? " is-active" : ""}`}
              >
                <div className="icon">{done ? "✓" : active ? "●" : "○"}</div>
                <div className="label">{label}</div>
                <span className={`ts${active ? " live" : ""}`}>
                  {done ? "ok" : active ? "en curso" : "—"}
                </span>
              </div>
            );
          })}
        </div>

        <div className="launch-bar">
          <i style={{ width: `${progress}%` }} />
        </div>

        {error ? (
          <p
            style={{
              marginTop: 12,
              fontSize: 12,
              color: "var(--warn)",
            }}
          >
            No pudimos terminar el launch ({error}). Probá de nuevo.
          </p>
        ) : null}

        <div className="launch-foot">
          <span className="meta">
            {isDone
              ? "campaign_id "
              : running
                ? "creando campaign_id "
                : "campaign_id "}
            <span style={{ color: "var(--fg)" }}>
              cmp_mock_{projectCreativeIds.length.toString(16).padStart(2, "0")}
            </span>
          </span>
          {running ? (
            <button
              type="button"
              className="btn btn-ghost"
              style={{ color: "var(--fg-2)" }}
              onClick={cancelLaunch}
            >
              Cancelar launch
            </button>
          ) : isDone ? (
            <button
              type="button"
              className="btn btn-launch"
              onClick={onClose}
            >
              Cerrar
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-launch"
              onClick={runLaunch}
              disabled={!hasCreatives}
            >
              Iniciar launch
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
