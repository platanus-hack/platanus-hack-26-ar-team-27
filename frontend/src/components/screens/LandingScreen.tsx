"use client";
import { useRef, useState, useEffect } from "react";
import type { ChangeEvent } from "react";

const EXAMPLES = [
  {
    key: "helio",
    stack: "B2B SaaS · Industrial IoT · Vertical AI",
    name: "Helio Robotics",
    hint: "Mantenimiento predictivo para robots industriales",
    raw: "Helio Robotics is a B2B SaaS that helps mid-market manufacturers schedule predictive maintenance on industrial robots. We have a working MVP that ingests robot telemetry, detects anomalies and books service appointments automatically. Small team (5 engineers + 1 founder). Want to reach ~50 manufacturing companies in LATAM with 50-500 employees. ICP: plant managers and operations directors who already track downtime as a KPI.",
  },
  {
    key: "finch",
    stack: "B2B API · FinTech · Treasury",
    name: "Finch Finance",
    hint: "Tesorería automatizada para fintechs latinoamericanas",
    raw: "Finch is an embedded treasury API for Latin American fintechs. We give them multi-currency accounts, FX hedging and payouts in 12 countries. Already 3 paying customers. Want to scale to 80 prospects in next quarter.",
  },
  {
    key: "arc",
    stack: "B2B SaaS · DevTools · AI",
    name: "Arc Studio",
    hint: "Generación de pruebas E2E con AI para frontends complejos",
    raw: "Arc Studio uses LLMs to generate Playwright tests from Figma designs. Targeted at YC-stage engineering leaders who don't have time to maintain test suites. Pre-seed.",
  },
];

interface LandingScreenProps {
  onSubmit: (prompt: string, files: File[]) => void;
  onInputChange?: () => void;
  isLoading: boolean;
  loadingStep?: string;
  submitError?: string;
}

const MAX_FILES = 3;
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set(["pdf", "md", "txt"]);

export default function LandingScreen({
  onSubmit,
  onInputChange,
  isLoading,
  loadingStep,
  submitError,
}: LandingScreenProps) {
  const [prompt, setPrompt] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Typewriter effect for the h1
  const FULL_TEXT = "Take me to market";
  const [typedCount, setTypedCount] = useState(0);
  const [typingDone, setTypingDone] = useState(false);

  useEffect(() => {
    if (typedCount >= FULL_TEXT.length) {
      setTypingDone(true);
      return;
    }
    const delay = typedCount === 0 ? 300 : 55; // small pause before starting
    const t = setTimeout(() => setTypedCount((c) => c + 1), delay);
    return () => clearTimeout(t);
  }, [typedCount]);

  function handleOpenFilePicker() {
    if (isLoading) return;
    fileInputRef.current?.click();
  }

  function handleFileSelection(event: ChangeEvent<HTMLInputElement>) {
    const pickedFiles = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (pickedFiles.length === 0) return;
    onInputChange?.();

    const nextFiles = [...selectedFiles];
    const seen = new Set(selectedFiles.map((file) => getFileKey(file)));

    for (const file of pickedFiles) {
      if (seen.has(getFileKey(file))) continue;
      nextFiles.push(file);
      seen.add(getFileKey(file));
    }

    const validationError = validateFiles(nextFiles);
    if (validationError) {
      setFileError(validationError);
      return;
    }

    setFileError("");
    setSelectedFiles(nextFiles);
  }

  function handleRemoveFile(fileToRemove: File) {
    if (isLoading) return;
    onInputChange?.();
    const nextFiles = selectedFiles.filter((file) => getFileKey(file) !== getFileKey(fileToRemove));
    setSelectedFiles(nextFiles);
    setFileError("");
  }

  return (
    <div className="landing-shell">
      <div className="landing-hero fade-up">
        <h1>
          {(() => {
            const typed = FULL_TEXT.slice(0, typedCount);
            const marketStart = "Take me to ".length;
            const marketEnd = "Take me to market".length;
            if (typedCount <= marketStart) {
              // still typing the plain part
              return <>{typed}<span className="tw-caret" /></>;
            } else if (typedCount <= marketEnd) {
              // typing inside "market"
              return <>
                {"Take me to "}
                <em>{typed.slice(marketStart)}</em>
                <span className="tw-caret" />
              </>;
            } else {
              // done — show full text with permanent caret
              return <>
                {"Take me to "}
                <em>{"market"}</em>
                <span className="tw-caret" />
              </>;
            }
          })()}
        </h1>
        <span className="kicker" style={{ opacity: typingDone ? 1 : 0, transition: "opacity 0.6s ease" }}>
          De pitch a primer outbound, en una corrida.
        </span>
      </div>

      <div className="prompt-box fade-up" style={{ animationDelay: "0.1s", position: "relative" }}>
        {isLoading && (
          <div style={{
            position: "absolute", inset: 0, background: "rgba(251,246,234,0.88)",
            backdropFilter: "blur(6px)", borderRadius: "inherit",
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            gap: 12, zIndex: 10,
          }}>
            <div style={{ display: "flex", gap: 6 }}>
              {["var(--diagnostic)", "var(--domain)", "var(--dns)", "var(--warmup)", "var(--research)"].map((c, i) => (
                <span key={i} style={{
                  width: 8, height: 8, borderRadius: "50%", background: c,
                  animation: `fade-in 0.5s ${i * 0.12}s both`,
                  opacity: 0.7,
                }} />
              ))}
            </div>
            <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--fg-2)", letterSpacing: "0.08em" }}>
              {loadingStep ?? "Analizando tu pitch…"}
            </span>
          </div>
        )}
        <textarea
          value={prompt}
          onChange={(e) => {
            onInputChange?.();
            setPrompt(e.target.value);
          }}
          placeholder="Contanos qué hace tu startup y nos encargamos del resto..."
          disabled={isLoading}
          rows={5}
        />
        <div className="prompt-foot">
          <div className="prompt-attach">
            <div className="attach-stack">
              <input
                ref={fileInputRef}
                type="file"
                hidden
                multiple
                accept=".pdf,.md,.txt,text/plain,text/markdown,application/pdf"
                onChange={handleFileSelection}
                disabled={isLoading}
              />
              <button
                type="button"
                className={`attach-chip${selectedFiles.length > 0 ? " is-loaded" : ""}`}
                onClick={handleOpenFilePicker}
                disabled={isLoading}
              >
                <span className="ico">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M9 13h6M9 17h4" />
                  </svg>
                </span>
                <span>{selectedFiles.length > 0 ? `${selectedFiles.length} adjunto${selectedFiles.length > 1 ? "s" : ""}` : "Pitch deck"}</span>
                <span className="file-name">
                  {selectedFiles.length > 0 ? "Listo para enviar" : "PDF · MD · TXT · hasta 5 MB"}
                </span>
              </button>
              {selectedFiles.length > 0 && (
                <div className="attach-list">
                  {selectedFiles.map((file) => (
                    <div key={getFileKey(file)} className="attach-item">
                      <span className="attach-item-name">{file.name}</span>
                      <button
                        type="button"
                        className="attach-remove"
                        onClick={() => handleRemoveFile(file)}
                        disabled={isLoading}
                      >
                        Quitar
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {fileError && <p className="attach-error">{fileError}</p>}
              {submitError && <p className="attach-error">{submitError}</p>}
            </div>
          </div>
          <button
            className="prompt-submit"
            onClick={() => onSubmit(prompt, selectedFiles)}
            disabled={isLoading || !prompt.trim()}
          >
            <span>Empezar</span>
            <span className="arrow">→</span>
          </button>
        </div>
      </div>

      <div className="examples fade-up" style={{ animationDelay: "0.2s" }}>
        {EXAMPLES.map((s) => (
          <button
            key={s.key}
            className="example-card"
            onClick={() => {
              onInputChange?.();
              setPrompt(s.raw);
            }}
            disabled={isLoading}
          >
            <span className="ex-tag">{s.stack}</span>
            <span className="ex-title">{s.name}</span>
            <span className="ex-hint">{s.hint}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function getFileKey(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

function validateFiles(files: File[]): string | null {
  if (files.length > MAX_FILES) {
    return "Podés adjuntar hasta 3 archivos.";
  }

  for (const file of files) {
    const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!ALLOWED_EXTENSIONS.has(extension)) {
      return `El archivo '${file.name}' no está soportado. Usá PDF, MD o TXT.`;
    }
    if (file.size > MAX_FILE_BYTES) {
      return `El archivo '${file.name}' supera el límite de 5 MB.`;
    }
  }

  return null;
}
