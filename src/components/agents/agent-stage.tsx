/**
 * AgentStage — 4 cards (Strategy/Creative/Influencer/Launch) con visualización
 * propia por agente. Diseño según working-artboard.jsx del bundle de Claude Design.
 *
 * Alimentado por useAgentStream: status, thinking acumulado, tools llamadas,
 * artifacts emitidos. Cuando no hay datos en vivo, las visualizaciones quedan
 * en estado idle (placeholders mudos).
 */
"use client";

import type { AgentEvent, AgentName } from "@/lib/events/types";
import {
  IconStrategy,
  IconCreative,
  IconInfluencer,
  IconLaunch,
} from "@/components/brand/agent-icons";
import type { StreamArtifact } from "@/components/agents/use-agent-stream";

type AgentStatus = "idle" | "active" | "done" | "failed";

const labels: Record<AgentName, string> = {
  strategy: "Strategy",
  creative: "Creative",
  influencer: "Influencer",
  launch: "Launch",
};

type AgentStageProps = {
  activeAgent: AgentName | null;
  agentStatuses: Record<AgentName, AgentStatus>;
  thinkingByAgent: Record<string, string>;
  tools: Array<Extract<AgentEvent, { kind: "tool.called" }>>;
  artifacts: StreamArtifact[];
};

export function AgentStage({
  activeAgent,
  agentStatuses,
  thinkingByAgent,
  tools,
  artifacts,
}: AgentStageProps) {
  return (
    <div className="agents-grid">
      {(["strategy", "creative", "influencer", "launch"] as const).map((agent) => (
        <AgentCard
          key={agent}
          agent={agent}
          status={agentStatuses[agent]}
          isActiveFocus={activeAgent === agent}
          thinking={thinkingByAgent[agent] ?? ""}
          tools={tools.filter((t) => t.agent === agent)}
          artifacts={artifacts.filter((a) => a.agent === agent)}
        />
      ))}
    </div>
  );
}

type AgentCardProps = {
  agent: AgentName;
  status: AgentStatus;
  isActiveFocus: boolean;
  thinking: string;
  tools: Array<Extract<AgentEvent, { kind: "tool.called" }>>;
  artifacts: StreamArtifact[];
};

function AgentCard({ agent, status, thinking, tools, artifacts }: AgentCardProps) {
  const Icon =
    agent === "strategy"
      ? IconStrategy
      : agent === "creative"
        ? IconCreative
        : agent === "influencer"
          ? IconInfluencer
          : IconLaunch;

  const statusClass =
    status === "active"
      ? ""
      : status === "done"
        ? " done"
        : status === "failed"
          ? " idle"
          : " idle";
  const cardClass = `agent ${agent}${status === "active" ? " active" : status === "done" ? " done" : " idle"}`;

  return (
    <div className={cardClass}>
      <div className="strip" />

      <div className="agent-head">
        <div className="name">
          <span className="icon">
            <Icon />
          </span>
          {labels[agent]}
        </div>
        <span className={`status${statusClass}`}>
          <span className="ring" />
          {status === "active"
            ? "Working"
            : status === "done"
              ? "Done"
              : status === "failed"
                ? "Failed"
                : "Idle"}
        </span>
      </div>

      <div className="agent-stream">
        {thinking ? (
          <>
            <span className="tok-faded">{thinking}</span>
            {status === "active" ? <span className="caret" /> : null}
          </>
        ) : (
          <span className="tok-faded">{idleHint(agent)}</span>
        )}
      </div>

      <div className="agent-tools">
        {tools.length === 0 ? (
          defaultTools(agent).map((tool) => (
            <span className="tool" key={tool}>
              <span className="arrow">▶</span>
              {tool}
            </span>
          ))
        ) : (
          dedupeTools(tools).map((tool) => (
            <span
              className={`tool${status === "active" ? " is-active" : ""}`}
              key={tool}
            >
              <span className="arrow">▶</span>
              {tool}
            </span>
          ))
        )}
      </div>

      <AgentVisualization agent={agent} artifacts={artifacts} status={status} />

      <div className="agent-foot">
        <span>{footerLabel(agent, artifacts.length)}</span>
        <span className="count">{status === "active" ? "en curso" : status === "done" ? "ok" : "—"}</span>
      </div>
    </div>
  );
}

function dedupeTools(
  events: Array<Extract<AgentEvent, { kind: "tool.called" }>>,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (let i = events.length - 1; i >= 0; i--) {
    const t = events[i]?.tool;
    if (!t) continue;
    if (!seen.has(t)) {
      seen.add(t);
      out.unshift(t);
    }
    if (out.length >= 3) break;
  }
  return out;
}

function defaultTools(agent: AgentName): string[] {
  if (agent === "strategy") return ["get_products", "get_brand_brief", "rank_skus"];
  if (agent === "creative") return ["generate_image", "write_copy", "compose_pair"];
  if (agent === "influencer") return ["cosine_match", "draft_dm", "verify_no_halluc"];
  return ["create_campaign", "create_ad_set", "upload_creatives"];
}

function idleHint(agent: AgentName): string {
  if (agent === "strategy")
    return "Esperando catálogo + brief para priorizar hero SKUs y armar el ICP.";
  if (agent === "creative")
    return "Esperando hero SKUs para generar 3 imágenes × 3 frameworks por SKU.";
  if (agent === "influencer")
    return "Esperando ICP para cruzar con 100 creators y armar DMs personalizadas.";
  return "Esperando 9 creativos + ICP confirmado para configurar Meta Ads (mock).";
}

function footerLabel(agent: AgentName, count: number): string {
  if (agent === "strategy") return `${count} hero SKUs`;
  if (agent === "creative") return `${count} ads generados`;
  if (agent === "influencer") return `${count} matches`;
  return count > 0 ? `${count} pasos` : "esperando upstream";
}

function AgentVisualization({
  agent,
  artifacts,
  status,
}: {
  agent: AgentName;
  artifacts: StreamArtifact[];
  status: AgentStatus;
}) {
  if (agent === "strategy") return <StrategyVis artifacts={artifacts} />;
  if (agent === "creative") return <CreativeVis artifacts={artifacts} />;
  if (agent === "influencer") return <InfluencerVis artifacts={artifacts} />;
  return <LaunchVis status={status} artifacts={artifacts} />;
}

function StrategyVis({ artifacts }: { artifacts: StreamArtifact[] }) {
  const skus = artifacts.filter((a) => a.type === "sku").slice(0, 3);
  const placeholders =
    skus.length === 0
      ? [
          { id: "p1", ref: "—", pct: 0 },
          { id: "p2", ref: "—", pct: 0 },
          { id: "p3", ref: "—", pct: 0 },
        ]
      : skus.map((s, i) => ({
          id: s.id,
          ref: s.ref,
          pct: 92 - i * 4,
        }));

  return (
    <div className="agent-vis strat-vis">
      {placeholders.map((row) => (
        <div className="strat-row" key={row.id}>
          <span className="sku">{row.ref}</span>
          <span className="bar">
            <i style={{ width: `${row.pct}%` }} />
          </span>
          <span className="pct">{row.pct || ""}</span>
        </div>
      ))}
    </div>
  );
}

function CreativeVis({ artifacts }: { artifacts: StreamArtifact[] }) {
  const done = Math.min(artifacts.filter((a) => a.type === "creative").length, 9);
  const cells: Array<"done" | "busy" | "idle"> = Array.from({ length: 9 }, (_, i) =>
    i < done ? "done" : i === done ? "busy" : "idle",
  );

  return (
    <div className="agent-vis creative-vis">
      {cells.map((state, i) => (
        <div
          key={i}
          className={`creative-cell${state === "done" ? " done" : state === "busy" ? " busy" : ""}`}
        />
      ))}
    </div>
  );
}

function InfluencerVis({ artifacts }: { artifacts: StreamArtifact[] }) {
  const matches = artifacts.filter((a) => a.type === "match").slice(0, 3);

  if (matches.length === 0) {
    return (
      <div className="agent-vis inf-vis">
        {[1, 2, 3].map((i) => (
          <div className="inf-row" key={i}>
            <div className="av" style={{ opacity: 0.4 }} />
            <div>
              <div className="h" style={{ opacity: 0.4 }}>—</div>
              <div className="meta-row">esperando</div>
            </div>
            <span className="score" style={{ color: "var(--fg-3)" }}>··</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="agent-vis inf-vis">
      {matches.map((m, i) => (
        <div className="inf-row" key={m.id}>
          <div className="av" />
          <div>
            <div className="h">@{m.ref.replace(/^@/, "")}</div>
            <div className="meta-row">match · live</div>
          </div>
          <span className="score">{91 - i * 4}</span>
        </div>
      ))}
    </div>
  );
}

function LaunchVis({
  artifacts,
  status,
}: {
  artifacts: StreamArtifact[];
  status: AgentStatus;
}) {
  const steps = ["Creating campaign", "Creating ad set", "Uploading creatives", "Live"];
  const done = status === "done" ? steps.length : Math.min(artifacts.length, steps.length - 1);

  return (
    <div className="agent-vis launch-vis">
      {steps.map((label, i) => (
        <div className="launch-step" key={label}>
          <span className="o">{i < done ? "✓" : "○"}</span>
          {label}
        </div>
      ))}
    </div>
  );
}
