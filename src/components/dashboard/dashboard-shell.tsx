"use client";

import { useMemo, useState } from "react";
import { AgentStage } from "@/components/agents/agent-stage";
import { useAgentStream } from "@/components/agents/use-agent-stream";
import { AdGallery } from "@/components/dashboard/ad-gallery";
import { HeroSkusSection } from "@/components/dashboard/hero-skus-section";
import {
  InfluencerCard,
  type InfluencerItem,
} from "@/components/dashboard/influencer-card";
import { LaunchDemo } from "@/components/dashboard/launch-demo";
import {
  OnboardingWizard,
  type OnboardingPayload,
} from "@/components/dashboard/onboarding-wizard";
import { LogoMark } from "@/components/brand/logo-mark";
import {
  DEMO_AGENT_EVENTS_SNAPSHOT,
  type SnapshotEvent,
} from "@/lib/mocks/agent-events-snapshot";
import { MOCK_STRATEGY_OUTPUT } from "@/lib/mocks/strategy";
import type { AgentEvent, AgentName } from "@/lib/events/types";

type DashboardShellProps = {
  projectId: string;
};

type AdItem = {
  id: string;
  heroSku: string;
  variant_label: string;
  asset_url: string | null;
  copy_text: string | null;
};

const MOCK_INFLUENCERS: InfluencerItem[] = [
  {
    id: "mock-1",
    avatar_url: null,
    display_name: "Valentina Costa",
    handle: "valecosta.style",
    followers_count: 128000,
    engagement_rate: 3.2,
    match_score: 0.91,
    draft_messages: {
      initial:
        "Hola Vale, nos encantó tu enfoque de estilo minimalista. Queremos enviarte el Vestido Luna Midi para una colaboración orgánica.",
      follow_up:
        "Hola Vale, te escribí hace unos días por la propuesta del Vestido Luna Midi. Si te sirve, te compartimos fechas y alternativas.",
    },
  },
];

function makeMockAds(): AdItem[] {
  return MOCK_STRATEGY_OUTPUT.hero_skus.flatMap((sku) =>
    ["lifestyle", "contexto", "comparativa"].flatMap((style) =>
      ["PAS", "AIDA", "curiosity"].map((framework, index) => ({
        id: `${sku.sku}-${style}-${framework}`,
        heroSku: sku.sku,
        variant_label: `${style} · ${framework}`,
        asset_url: `https://picsum.photos/seed/${sku.sku}-${style}-${index}/500/640`,
        copy_text: `Copy ${framework} para ${sku.sku} en variante ${style}.`,
      })),
    ),
  );
}

export function DashboardShell({ projectId }: DashboardShellProps) {
  const stream = useAgentStream(projectId);
  const [loadingFlow, setLoadingFlow] = useState(false);
  const [strategyLoading, setStrategyLoading] = useState(false);
  const [creativeLoading, setCreativeLoading] = useState(false);
  const [influencerLoading, setInfluencerLoading] = useState(false);
  const [heroSkus, setHeroSkus] = useState(
    MOCK_STRATEGY_OUTPUT.hero_skus.slice(0, 0),
  );
  const [ads, setAds] = useState<AdItem[]>([]);
  const [influencers, setInfluencers] = useState<InfluencerItem[]>([]);
  const [uiError, setUiError] = useState<string | null>(null);
  const [replayRunning, setReplayRunning] = useState(false);
  const [flowStarted, setFlowStarted] = useState(false);

  const launchCreativeIds = useMemo(
    () => ads.map((ad) => ad.id).slice(0, 9),
    [ads],
  );

  async function runOnboardingFlow(payload: OnboardingPayload) {
    setLoadingFlow(true);
    setStrategyLoading(true);
    setFlowStarted(true);
    setUiError(null);

    try {
      const catalogForm = new FormData();
      catalogForm.append("file", payload.catalogFile);
      const catalogResponse = await fetch("/api/catalog", {
        method: "POST",
        body: catalogForm,
      });
      if (!catalogResponse.ok) {
        const detail = await catalogResponse.json().catch(() => ({}));
        const message =
          (detail as { message?: string; error?: string }).message ??
          (detail as { error?: string }).error ??
          `Catálogo: error ${catalogResponse.status}`;
        setUiError(message);
        setLoadingFlow(false);
        setStrategyLoading(false);
        return;
      }

      let briefResponse: Response;
      if (payload.briefFile) {
        const briefForm = new FormData();
        briefForm.append("file", payload.briefFile);
        briefResponse = await fetch("/api/brief", {
          method: "POST",
          body: briefForm,
        });
      } else {
        briefResponse = await fetch("/api/brief", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ source: "form", text: payload.brief }),
        });
      }
      if (!briefResponse.ok) {
        const detail = await briefResponse.json().catch(() => ({}));
        const message =
          (detail as { message?: string; error?: string }).message ??
          (detail as { error?: string }).error ??
          `Brief: error ${briefResponse.status}`;
        setUiError(message);
        setLoadingFlow(false);
        setStrategyLoading(false);
        return;
      }

      const strategyResponse = await fetch("/api/strategy", {
        method: "POST",
      }).catch(() => null);
      const strategyBlocked =
        !strategyResponse || strategyResponse.status === 501;

      if (strategyBlocked) {
        const fallbackRunId = crypto.randomUUID();
        stream.emitLocalEvent({
          kind: "agent.started",
          agent: "strategy",
          runId: fallbackRunId,
          projectId,
        });
        stream.emitLocalEvent({
          kind: "agent.thinking",
          agent: "strategy",
          runId: fallbackRunId,
          projectId,
          tokens: "Analizando catálogo y brief...",
        });
        stream.emitLocalEvent({
          kind: "agent.completed",
          agent: "strategy",
          runId: fallbackRunId,
          projectId,
          summary: "Strategy mock completado",
        });
        setHeroSkus(MOCK_STRATEGY_OUTPUT.hero_skus);
      }

      setStrategyLoading(false);
      setCreativeLoading(true);
      setInfluencerLoading(true);

      const [creativesResponse, influencersResponse] = await Promise.all([
        fetch("/api/creatives", { method: "POST" }).catch(() => null),
        fetch("/api/influencers", { method: "POST" }).catch(() => null),
      ]);

      if (!creativesResponse || creativesResponse.status === 501) {
        setAds(makeMockAds());
      }
      if (!influencersResponse || influencersResponse.status === 501) {
        setInfluencers(MOCK_INFLUENCERS);
      }

      setCreativeLoading(false);
      setInfluencerLoading(false);
    } catch {
      setUiError(
        "No pudimos completar el flujo en vivo. Mostramos datos mock para no frenarte.",
      );
      setHeroSkus(MOCK_STRATEGY_OUTPUT.hero_skus);
      setAds(makeMockAds());
      setInfluencers(MOCK_INFLUENCERS);
      setStrategyLoading(false);
      setCreativeLoading(false);
      setInfluencerLoading(false);
    } finally {
      setLoadingFlow(false);
    }
  }

  function runReplay(snapshot: SnapshotEvent[]) {
    if (replayRunning) return;
    setReplayRunning(true);
    setUiError(null);
    setFlowStarted(true);

    snapshot.forEach((item, index) => {
      window.setTimeout(() => {
        stream.emitLocalEvent(item.event);
        if (index === snapshot.length - 1) {
          setReplayRunning(false);
          setHeroSkus(MOCK_STRATEGY_OUTPUT.hero_skus);
          setAds(makeMockAds());
          setInfluencers(MOCK_INFLUENCERS);
        }
      }, item.atMs);
    });
  }

  const ribbonState: Record<AgentName, { state: "done" | "active" | "idle"; meta: string }> = {
    strategy: {
      state:
        stream.agentStatuses.strategy === "done"
          ? "done"
          : stream.agentStatuses.strategy === "active"
            ? "active"
            : heroSkus.length > 0
              ? "done"
              : "idle",
      meta:
        heroSkus.length > 0
          ? `${heroSkus.length} hero SKUs`
          : stream.agentStatuses.strategy === "active"
            ? "analizando"
            : "esperando",
    },
    creative: {
      state:
        stream.agentStatuses.creative === "done"
          ? "done"
          : stream.agentStatuses.creative === "active" || creativeLoading
            ? "active"
            : ads.length > 0
              ? "done"
              : "idle",
      meta: `${ads.length} / 9 ads`,
    },
    influencer: {
      state:
        stream.agentStatuses.influencer === "done"
          ? "done"
          : stream.agentStatuses.influencer === "active" || influencerLoading
            ? "active"
            : influencers.length > 0
              ? "done"
              : "idle",
      meta: `${influencers.length} / 5 matches`,
    },
    launch: {
      state: stream.agentStatuses.launch === "done" ? "done" : "idle",
      meta: stream.agentStatuses.launch === "done" ? "live" : "esperando",
    },
  };

  const runStartedAt = stream.events[0]?.ts;

  return (
    <main className="ab">
      <div className="ab-inner">
        {/* Topbar */}
        <div className="topbar">
          <div className="brand">
            <LogoMark size={32} />
            <div className="brand-text">
              <span className="kicker">Retail Growth Engine</span>
              <span className="name">
                {flowStarted ? "Run en vivo" : "Nuevo proyecto"}
              </span>
            </div>
          </div>
          <div className="topbar-right">
            <span className="crumb">
              <span className="dot" />
              {stream.workingCount > 0
                ? `${stream.workingCount} / 4 working`
                : flowStarted
                  ? "run idle"
                  : "setup"}
              {runStartedAt ? ` · proj_${projectId.slice(0, 4)}` : ""}
            </span>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => runReplay(DEMO_AGENT_EVENTS_SNAPSHOT)}
              disabled={replayRunning}
            >
              {replayRunning ? "Reproduciendo demo…" : "Modo demo replay"}
            </button>
            <LaunchDemo creativeIds={launchCreativeIds} />
          </div>
        </div>

        {!flowStarted ? (
          <OnboardingWizard
            onConfirm={runOnboardingFlow}
            loading={loadingFlow}
          />
        ) : (
          <>
            {/* Phase ribbon */}
            <div className="ribbon">
              {(
                [
                  { agent: "strategy", n: "01", label: "Strategy" },
                  { agent: "creative", n: "02", label: "Creative" },
                  { agent: "influencer", n: "02'", label: "Influencer" },
                  { agent: "launch", n: "03", label: "Launch" },
                ] as const
              ).map(({ agent, n, label }) => {
                const cfg = ribbonState[agent];
                const stateClass =
                  cfg.state === "done"
                    ? "is-done"
                    : cfg.state === "active"
                      ? "is-active"
                      : "";
                const accent =
                  agent === "strategy"
                    ? "var(--strategy)"
                    : agent === "creative"
                      ? "var(--creative)"
                      : agent === "influencer"
                        ? "var(--influencer)"
                        : "var(--launch)";
                return (
                  <div
                    key={agent}
                    className={`ribbon-step ${stateClass}`}
                    style={cfg.state === "active" ? { color: accent } : undefined}
                  >
                    <span className="step-n">{n}</span>
                    {cfg.state === "done" ? (
                      <span style={{ color: "var(--launch)" }}>✓</span>
                    ) : cfg.state === "active" ? (
                      <span className="pulse" />
                    ) : null}
                    <span
                      className="step-name"
                      style={
                        cfg.state === "idle"
                          ? { color: "var(--fg-2)" }
                          : undefined
                      }
                    >
                      {label}
                    </span>
                    <span className="step-meta">{cfg.meta}</span>
                  </div>
                );
              })}
            </div>

            {/* Agents grid */}
            <AgentStage
              activeAgent={stream.activeAgent}
              agentStatuses={stream.agentStatuses}
              thinkingByAgent={stream.thinkingByAgent}
              tools={stream.tools}
              artifacts={stream.artifacts}
            />

            {/* Console */}
            <Console
              events={stream.events}
              artifacts={stream.artifacts}
              connected={stream.connected}
              projectId={projectId}
            />

            {(uiError || stream.error) ? (
              <p
                style={{
                  fontSize: 12,
                  color: "var(--warn)",
                  fontFamily: "var(--mono)",
                }}
              >
                {uiError ?? stream.error}
              </p>
            ) : null}

            {/* Outputs */}
            <HeroSkusSection loading={strategyLoading} skus={heroSkus} />

            <AdGallery loading={creativeLoading} ads={ads} />

            {(influencerLoading || influencers.length > 0) && (
              <section>
                <div className="section-head">
                  <h2>
                    <span style={{ color: "var(--influencer)" }}>●</span>
                    Influencer matches
                    <span style={{ color: "var(--fg-2)", fontWeight: 400 }}>
                      · con DMs draft
                    </span>
                  </h2>
                  <span className="meta">
                    {influencerLoading
                      ? "buscando creadores…"
                      : `top ${influencers.length} · DMs ancladas a bio + recent posts`}
                  </span>
                </div>
                {influencerLoading && influencers.length === 0 ? (
                  <div className="card">
                    <p
                      style={{
                        margin: 0,
                        fontSize: 13,
                        color: "var(--fg-2)",
                      }}
                    >
                      Cosine matching contra creators…
                    </p>
                  </div>
                ) : (
                  <div className="inf-grid">
                    {influencers.map((item) => (
                      <InfluencerCard key={item.id} influencer={item} />
                    ))}
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}

/* ===================== Console (event log + artifact stream) ===================== */

type ConsoleProps = {
  events: AgentEvent[];
  artifacts: ReturnType<typeof useAgentStream>["artifacts"];
  connected: boolean;
  projectId: string;
};

function Console({ events, artifacts, connected, projectId }: ConsoleProps) {
  const [tab, setTab] = useState<"all" | "thinking" | "tools" | "artifacts">(
    "all",
  );

  const filtered = events
    .filter((e) => {
      if (tab === "all") return true;
      if (tab === "thinking") return e.kind === "agent.thinking";
      if (tab === "tools")
        return e.kind === "tool.called" || e.kind === "tool.result";
      if (tab === "artifacts") return e.kind === "artifact.created";
      return true;
    })
    .slice(-12)
    .reverse();

  return (
    <div className="console">
      <div className="console-main">
        <div className="console-head">
          <div className="row" style={{ gap: 8 }}>
            <span className="kicker">Live event bus</span>
            <span
              style={{
                fontFamily: "var(--mono)",
                fontSize: 10,
                color: "var(--fg-3)",
              }}
            >
              /api/stream/{projectId.slice(0, 8)} ·{" "}
              {connected ? "SSE conectado" : "reconectando…"}
            </span>
          </div>
          <div className="console-tabs">
            {(["all", "thinking", "tools", "artifacts"] as const).map((key) => (
              <button
                key={key}
                type="button"
                className={`console-tab${tab === key ? " is-active" : ""}`}
                onClick={() => setTab(key)}
              >
                {key === "all" ? "Todos" : key}
              </button>
            ))}
          </div>
        </div>

        <div className="log">
          {filtered.length === 0 ? (
            <div className="row">
              <span className="ts">—</span>
              <span className="mute">
                Sin eventos todavía. Confirmá el wizard o reproducí el demo.
              </span>
            </div>
          ) : (
            filtered.map((event, i) => <LogRow key={i} event={event} />)
          )}
        </div>
      </div>

      <div className="console-side">
        <div className="kicker">Artifact stream</div>
        <div className="artifact-stream">
          {artifacts.length === 0 ? (
            <div
              style={{
                fontFamily: "var(--mono)",
                fontSize: 10.5,
                color: "var(--fg-3)",
              }}
            >
              Sin artifacts
            </div>
          ) : (
            artifacts
              .slice(-6)
              .reverse()
              .map((a) => (
                <div className="artifact-pill" key={a.id}>
                  <span
                    className={`dot ${
                      a.agent === "strategy"
                        ? "s"
                        : a.agent === "creative"
                          ? "c"
                          : a.agent === "influencer"
                            ? "i"
                            : "l"
                    }`}
                  />
                  <span>{a.type}</span>
                  <span className="ref">{a.ref}</span>
                  <span className="when">{relativeTime(a.ts)}</span>
                </div>
              ))
          )}
        </div>
        <div
          style={{
            marginTop: "auto",
            padding: "10px 12px",
            border: "1px dashed var(--line)",
            borderRadius: 12,
            fontFamily: "var(--mono)",
            fontSize: 10.5,
            color: "var(--fg-2)",
            lineHeight: 1.55,
          }}
        >
          <span style={{ color: "var(--fg)" }}>tip</span> · cerrá la pestaña
          tranquilo, el run sigue en background y los eventos se replayean por{" "}
          <span style={{ color: "var(--fg)" }}>?since=&lt;event_id&gt;</span> al
          volver.
        </div>
      </div>
    </div>
  );
}

function LogRow({ event }: { event: AgentEvent }) {
  const ts = formatTimestamp(event.ts);
  const agentClass =
    event.agent === "strategy"
      ? "ag-strategy"
      : event.agent === "creative"
        ? "ag-creative"
        : event.agent === "influencer"
          ? "ag-influencer"
          : "ag-launch";
  const detail = describeEvent(event);

  return (
    <div className="row">
      <span className="ts">{ts}</span>
      <span className={agentClass}>{event.agent}</span>
      <span className="kind">{event.kind}</span>
      <span>{detail}</span>
    </div>
  );
}

function describeEvent(event: AgentEvent): React.ReactNode {
  if (event.kind === "agent.started") return "iniciando";
  if (event.kind === "agent.thinking") {
    const head = event.tokens.slice(0, 80);
    return (
      <span className="mute">
        “{head}
        {event.tokens.length > 80 ? "…" : ""}”
      </span>
    );
  }
  if (event.kind === "tool.called") return event.tool;
  if (event.kind === "tool.result") return `${event.tool} → ok`;
  if (event.kind === "artifact.created")
    return (
      <>
        {event.type} · {event.ref}
      </>
    );
  if (event.kind === "agent.completed")
    return <span className="ok">{event.summary}</span>;
  if (event.kind === "agent.failed")
    return <span style={{ color: "var(--warn)" }}>{event.error}</span>;
  return null;
}

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString("en-GB", { hour12: false });
  } catch {
    return "—";
  }
}

function relativeTime(iso: string): string {
  try {
    const ms = Date.now() - new Date(iso).getTime();
    if (ms < 1000) return "ahora";
    const s = Math.floor(ms / 1000);
    if (s < 60) return `−${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `−${m}m`;
    const h = Math.floor(m / 60);
    return `−${h}h`;
  } catch {
    return "—";
  }
}
