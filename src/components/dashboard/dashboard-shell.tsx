"use client";

import { useMemo, useState } from "react";
import { AgentStage } from "@/components/agents/agent-stage";
import { LiveThinking } from "@/components/agents/live-thinking";
import { useAgentStream } from "@/components/agents/use-agent-stream";
import { AdGallery } from "@/components/dashboard/ad-gallery";
import { ArtifactEmergence } from "@/components/dashboard/artifact-emergence";
import { HeroSkusSection } from "@/components/dashboard/hero-skus-section";
import { InfluencerCard, type InfluencerItem } from "@/components/dashboard/influencer-card";
import { LaunchDemo } from "@/components/dashboard/launch-demo";
import { OnboardingWizard, type OnboardingPayload } from "@/components/dashboard/onboarding-wizard";
import { Button } from "@/components/ui/button";
import {
  DEMO_AGENT_EVENTS_SNAPSHOT,
  type SnapshotEvent,
} from "@/lib/mocks/agent-events-snapshot";
import { MOCK_STRATEGY_OUTPUT } from "@/lib/mocks/strategy";
import { motion } from "framer-motion";

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
      initial: "Hola Vale, nos encanto tu enfoque de estilo minimalista. Queremos enviarte el Vestido Luna Midi para una colaboracion.",
      follow_up: "Hola Vale, te escribi hace unos dias por la propuesta del Vestido Luna Midi. Si te sirve, te compartimos fechas y alternativas.",
    },
  },
];

function makeMockAds() {
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
  const [heroSkus, setHeroSkus] = useState(MOCK_STRATEGY_OUTPUT.hero_skus.slice(0, 0));
  const [ads, setAds] = useState<AdItem[]>([]);
  const [influencers, setInfluencers] = useState<InfluencerItem[]>([]);
  const [uiError, setUiError] = useState<string | null>(null);
  const [replayRunning, setReplayRunning] = useState(false);

  const launchCreativeIds = useMemo(
    () => ads.map((ad) => ad.id).slice(0, 9),
    [ads],
  );

  async function runOnboardingFlow(payload: OnboardingPayload) {
    setLoadingFlow(true);
    setStrategyLoading(true);
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
        const message = (detail as { message?: string; error?: string }).message
          ?? (detail as { error?: string }).error
          ?? `Catalogo: error ${catalogResponse.status}`;
        setUiError(message);
        setLoadingFlow(false);
        setStrategyLoading(false);
        return;
      }
      const catalogJson = (await catalogResponse.json().catch(() => ({}))) as {
        inserted?: number;
      };

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
        const message = (detail as { message?: string; error?: string }).message
          ?? (detail as { error?: string }).error
          ?? `Brief: error ${briefResponse.status}`;
        setUiError(message);
        setLoadingFlow(false);
        setStrategyLoading(false);
        return;
      }

      if (typeof catalogJson.inserted === "number" && catalogJson.inserted > 0) {
        // Feedback opcional: el header global muestra el run via SSE.
      }

      const strategyResponse = await fetch("/api/strategy", { method: "POST" }).catch(() => null);
      const strategyBlocked = !strategyResponse || strategyResponse.status === 501;

      if (strategyBlocked) {
        const fallbackRunId = crypto.randomUUID();
        stream.emitLocalEvent({ kind: "agent.started", agent: "strategy", runId: fallbackRunId, projectId });
        stream.emitLocalEvent({
          kind: "agent.thinking",
          agent: "strategy",
          runId: fallbackRunId,
          projectId,
          tokens: "Analizando catalogo y brief...",
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
      setUiError("No pudimos completar el flujo en vivo. Mostramos datos mock para no frenarte.");
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

    snapshot.forEach((item, index) => {
      window.setTimeout(() => {
        stream.emitLocalEvent(item.event);
        if (index === snapshot.length - 1) {
          setReplayRunning(false);
        }
      }, item.atMs);
    });
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 md:px-8">
        <header className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Retail Growth Engine</p>
            <h1 className="mt-1 text-xl font-semibold text-slate-100">Proyecto activo</h1>
            <p className="mt-2 font-mono text-xs text-slate-500">{projectId}</p>
          </div>
          <div className="flex items-center gap-4">
            <p className="text-sm text-slate-300">{stream.workingCount} agentes trabajando</p>
            <Button
              variant="outline"
              onClick={() => runReplay(DEMO_AGENT_EVENTS_SNAPSHOT)}
              disabled={replayRunning}
            >
              {replayRunning ? "Reproduciendo demo..." : "Modo demo replay"}
            </Button>
            <LaunchDemo creativeIds={launchCreativeIds} />
          </div>
        </header>

        <OnboardingWizard onConfirm={runOnboardingFlow} loading={loadingFlow} />

        <AgentStage activeAgent={stream.activeAgent} agentStatuses={stream.agentStatuses} />
        <LiveThinking
          activeAgent={stream.activeAgent}
          thinkingByAgent={stream.thinkingByAgent}
          tools={stream.tools}
        />
        <ArtifactEmergence artifacts={stream.artifacts} />

        {!stream.connected ? <p className="text-xs text-slate-500">SSE desconectado, usando fallback local.</p> : null}
        {stream.error ? <p className="text-xs text-amber-300">{stream.error}</p> : null}
        {uiError ? <p className="text-sm text-amber-300">{uiError}</p> : null}

        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
          <HeroSkusSection loading={strategyLoading} skus={heroSkus} />
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
          <AdGallery loading={creativeLoading} ads={ads} />
        </motion.div>

        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5"
        >
          <h2 className="text-base font-semibold text-slate-100">Influencer Matches</h2>
          {influencerLoading ? <p className="mt-2 text-sm text-slate-400">Buscando creadores...</p> : null}
          {!influencerLoading && influencers.length === 0 ? (
            <p className="mt-2 text-sm text-slate-400">Aun no hay matches. Vamos a mostrarlos apenas termine el agente.</p>
          ) : null}
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {influencers.map((item) => (
              <InfluencerCard key={item.id} influencer={item} />
            ))}
          </div>
        </motion.section>
      </div>
    </main>
  );
}
