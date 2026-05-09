/**
 * AgentEvent — contrato compartido del event bus (design D6).
 *
 * FROZEN CONTRACT: este archivo NO se edita después del bootstrap.
 * Cualquier cambio requiere conversación grupal porque rompe a todos los tracks.
 *
 * El backend (T2) publica estos eventos a Postgres + pg_notify.
 * El frontend (T1) los consume vía SSE en /api/stream/:projectId.
 */

export type AgentName = "strategy" | "creative" | "influencer" | "launch";

export type ArtifactType = "sku" | "creative" | "match" | "dm" | "campaign";

export type AgentEvent =
  | {
      kind: "agent.started";
      agent: AgentName;
      runId: string;
      projectId: string;
      ts: string;
    }
  | {
      kind: "agent.thinking";
      agent: AgentName;
      runId: string;
      projectId: string;
      tokens: string;
      ts: string;
    }
  | {
      kind: "tool.called";
      agent: AgentName;
      runId: string;
      projectId: string;
      tool: string;
      input: unknown;
      ts: string;
    }
  | {
      kind: "tool.result";
      agent: AgentName;
      runId: string;
      projectId: string;
      tool: string;
      output: unknown;
      ts: string;
    }
  | {
      kind: "artifact.created";
      agent: AgentName;
      runId: string;
      projectId: string;
      type: ArtifactType;
      ref: string;
      ts: string;
    }
  | {
      kind: "agent.completed";
      agent: AgentName;
      runId: string;
      projectId: string;
      summary: string;
      ts: string;
    }
  | {
      kind: "agent.failed";
      agent: AgentName;
      runId: string;
      projectId: string;
      error: string;
      ts: string;
    };

export type AgentEventKind = AgentEvent["kind"];

/** Helper para construir eventos con `ts` automático. */
export function makeEvent<E extends AgentEvent>(
  e: Omit<E, "ts">,
): E {
  return { ...e, ts: new Date().toISOString() } as E;
}
