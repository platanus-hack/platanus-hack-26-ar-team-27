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

export function AgentStage() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
      {(["strategy", "creative", "influencer", "launch"] as const).map(
        (agent) => (
          <div
            key={agent}
            className="rounded-xl border border-slate-800 bg-slate-900/60 p-4"
          >
            <p className="text-xs uppercase tracking-wider text-slate-500">
              {agent}
            </p>
            <p className="mt-2 text-sm text-slate-400">idle</p>
          </div>
        ),
      )}
    </div>
  );
}
