/**
 * OWNER: Track 1 (Frontend + Agent UX).
 * Componente principal del "stage de agentes" — design D15.
 *
 * 4 cards horizontales (Strategy/Creative/Influencer/Launch) con:
 *  - accent color por agente (tailwind theme.colors.agent.*)
 *  - estado: idle | active | done | failed
 *  - borde gradient animado en activo (animate-border-flow)
 *
 * Usar con el hook useAgentStream(projectId).
 */
"use client";

import type { AgentName } from "@/lib/events/types";
import { cn } from "@/lib/utils";

type AgentStatus = "idle" | "active" | "done" | "failed";

const labels: Record<AgentName, string> = {
  strategy: "Strategy",
  creative: "Creative",
  influencer: "Influencer",
  launch: "Launch",
};

const accents: Record<AgentName, string> = {
  strategy: "from-violet-500/60 to-agent-strategy",
  creative: "from-fuchsia-500/60 to-agent-creative",
  influencer: "from-cyan-500/60 to-agent-influencer",
  launch: "from-emerald-500/60 to-agent-launch",
};

const statuses: Record<AgentStatus, string> = {
  idle: "Idle",
  active: "Working",
  done: "Done",
  failed: "Failed",
};

type AgentStageProps = {
  activeAgent: AgentName | null;
  agentStatuses: Record<AgentName, AgentStatus>;
};

export function AgentStage({ activeAgent, agentStatuses }: AgentStageProps) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
      {(["strategy", "creative", "influencer", "launch"] as const).map(
        (agent) => (
          <div
            key={agent}
            className={cn(
              "relative overflow-hidden rounded-xl border border-slate-800 bg-slate-900/60 p-4",
              activeAgent === agent && "ring-1 ring-slate-700",
            )}
          >
            {activeAgent === agent ? (
              <div
                className={cn(
                  "absolute inset-0 -z-10 bg-gradient-to-r bg-[length:200%_200%] opacity-30 animate-border-flow",
                  accents[agent],
                )}
              />
            ) : null}

            <p className="text-xs uppercase tracking-wider text-slate-500">
              {labels[agent]}
            </p>
            <p
              className={cn(
                "mt-2 text-sm",
                agentStatuses[agent] === "active" && "text-slate-100",
                agentStatuses[agent] === "done" && "text-emerald-300",
                agentStatuses[agent] === "failed" && "text-rose-300",
                agentStatuses[agent] === "idle" && "text-slate-400",
              )}
            >
              {statuses[agentStatuses[agent]]}
            </p>
          </div>
        ),
      )}
    </div>
  );
}
