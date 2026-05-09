"use client";

import type { AgentName } from "@/lib/events/types";

type ToolCall = {
  agent: AgentName;
  tool: string;
  input: unknown;
  ts: string;
};

type LiveThinkingProps = {
  activeAgent: AgentName | null;
  thinkingByAgent: Record<string, string>;
  tools: ToolCall[];
};

export function LiveThinking({ activeAgent, thinkingByAgent, tools }: LiveThinkingProps) {
  const currentThinking = activeAgent ? thinkingByAgent[activeAgent] ?? "" : "";
  const visibleTools = activeAgent
    ? tools.filter((tool) => tool.agent === activeAgent).slice(-6)
    : [];

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
      <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Live Thinking</p>
      <p className="mt-2 text-sm text-slate-300">
        {activeAgent ? `Agente activo: ${activeAgent}` : "Todavia no hay agentes corriendo."}
      </p>

      <div className="mt-4 min-h-24 rounded-lg border border-slate-800 bg-slate-950/70 p-3 font-mono text-xs leading-6 text-slate-300">
        {currentThinking.length > 0 ? currentThinking : "Esperando tokens del stream..."}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {visibleTools.length > 0 ? (
          visibleTools.map((tool) => (
            <span
              key={`${tool.agent}:${tool.tool}:${tool.ts}`}
              className="rounded-full border border-slate-700 bg-slate-950 px-2.5 py-1 font-mono text-xs text-slate-300"
            >
              {`→ ${tool.tool}`}
            </span>
          ))
        ) : (
          <span className="text-xs text-slate-500">Sin tools registradas por ahora.</span>
        )}
      </div>
    </section>
  );
}
