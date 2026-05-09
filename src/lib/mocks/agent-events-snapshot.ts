import type { AgentEvent } from "@/lib/events/types";

type AgentEventInput = AgentEvent extends infer T
  ? T extends AgentEvent
    ? Omit<T, "ts">
    : never
  : never;

export type SnapshotEvent = {
  atMs: number;
  event: AgentEventInput;
};

export const DEMO_AGENT_EVENTS_SNAPSHOT: SnapshotEvent[] = [
  {
    atMs: 0,
    event: {
      kind: "agent.started",
      agent: "strategy",
      runId: "demo-run-strategy",
      projectId: "demo-project",
    },
  },
  {
    atMs: 500,
    event: {
      kind: "agent.thinking",
      agent: "strategy",
      runId: "demo-run-strategy",
      projectId: "demo-project",
      tokens: "Analizando catalogo y tono de marca...",
    },
  },
  {
    atMs: 2200,
    event: {
      kind: "artifact.created",
      agent: "strategy",
      runId: "demo-run-strategy",
      projectId: "demo-project",
      type: "sku",
      ref: "LUNA-009",
    },
  },
  {
    atMs: 3000,
    event: {
      kind: "agent.completed",
      agent: "strategy",
      runId: "demo-run-strategy",
      projectId: "demo-project",
      summary: "Hero SKUs definidos.",
    },
  },
  {
    atMs: 3300,
    event: {
      kind: "agent.started",
      agent: "creative",
      runId: "demo-run-creative",
      projectId: "demo-project",
    },
  },
  {
    atMs: 4600,
    event: {
      kind: "artifact.created",
      agent: "creative",
      runId: "demo-run-creative",
      projectId: "demo-project",
      type: "creative",
      ref: "LUNA-009-lifestyle-PAS",
    },
  },
  {
    atMs: 6300,
    event: {
      kind: "agent.completed",
      agent: "creative",
      runId: "demo-run-creative",
      projectId: "demo-project",
      summary: "Creativos listos.",
    },
  },
  {
    atMs: 6600,
    event: {
      kind: "agent.started",
      agent: "influencer",
      runId: "demo-run-influencer",
      projectId: "demo-project",
    },
  },
  {
    atMs: 7800,
    event: {
      kind: "artifact.created",
      agent: "influencer",
      runId: "demo-run-influencer",
      projectId: "demo-project",
      type: "match",
      ref: "valecosta.style",
    },
  },
  {
    atMs: 9000,
    event: {
      kind: "agent.completed",
      agent: "influencer",
      runId: "demo-run-influencer",
      projectId: "demo-project",
      summary: "Top 5 matches listos.",
    },
  },
];
