"use client";
import { useState } from "react";

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
  onSubmit: (prompt: string) => void;
  isLoading: boolean;
  loadingStep?: string;
}

export default function LandingScreen({ onSubmit, isLoading, loadingStep }: LandingScreenProps) {
  const [prompt, setPrompt] = useState(EXAMPLES[0].raw);

  return (
    <div className="landing-shell">
      <div className="landing-hero fade-up">
        <div className="kicker">
          <span className="dots">
            <i style={{ background: "var(--diagnostic)" }} />
            <i style={{ background: "var(--domain)" }} />
            <i style={{ background: "var(--dns)" }} />
            <i style={{ background: "var(--warmup)" }} />
            <i style={{ background: "var(--research)" }} />
          </span>
          Multi-agent · GTM para startups · v0.5
        </div>
        <h1>
          Take me to <em>market</em>.<br />
          De pitch a primer outbound, en una corrida.
        </h1>
        <p className="sub">
          Contanos qué hace tu startup. Cinco agentes especialistas se encargan del setup completo: leen tu pitch, compran dominios, configuran DNS, calientan los inboxes y mandan los primeros emails personalizados a tus prospects ideales.
        </p>
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
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Contanos qué hace tu startup, a quién apuntás y cuántos prospects querés alcanzar…"
          disabled={isLoading}
          rows={5}
        />
        <div className="prompt-foot">
          <div className="prompt-attach">
            <span className="attach-chip" style={{ cursor: "default", opacity: 0.5 }}>
              <span className="ico">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M9 13h6M9 17h4" />
                </svg>
              </span>
              <span>Pitch deck</span>
              <span className="file-name">PDF · MD · TXT (opcional)</span>
            </span>
          </div>
          <button
            className="prompt-submit"
            onClick={() => onSubmit(prompt)}
            disabled={isLoading || !prompt.trim()}
          >
            <span>Empezar</span>
            <span className="arrow">→</span>
          </button>
        </div>
      </div>

      <div className="examples fade-up" style={{ animationDelay: "0.2s" }}>
        {EXAMPLES.map((s) => (
          <button key={s.key} className="example-card" onClick={() => setPrompt(s.raw)} disabled={isLoading}>
            <span className="ex-tag">{s.stack}</span>
            <span className="ex-title">{s.name}</span>
            <span className="ex-hint">{s.hint}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
