/**
 * OWNER: Track 1.
 * Hook de cliente que consume /api/stream/:projectId vía EventSource y mantiene
 * un state local con: agente activo, tokens streaming acumulados, tools llamadas,
 * artifacts emitidos.
 *
 * Reglas:
 *  - idempotente: ignorar eventos con `id` ya visto (replay tras reconexión).
 *  - reconectar automáticamente si la conexión se cae.
 */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AgentEvent } from "@/lib/events/types";

type AgentEventInput = AgentEvent extends infer T
  ? T extends AgentEvent
    ? Omit<T, "ts">
    : never
  : never;

type AgentStatus = "idle" | "active" | "done" | "failed";

export type StreamArtifact = {
  id: string;
  agent: AgentEvent["agent"];
  type: "sku" | "creative" | "match" | "dm" | "campaign";
  ref: string;
  ts: string;
};

export function useAgentStream(projectId: string | null) {
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const seenKeysRef = useRef<Set<string>>(new Set());
  const reconnectTimerRef = useRef<number | null>(null);
  const retryCountRef = useRef(0);
  const sinceRef = useRef<number | null>(null);

  const appendEvent = useCallback((event: AgentEvent, eventId?: number) => {
    const key = `${event.runId}:${event.kind}:${event.ts}`;
    if (seenKeysRef.current.has(key)) {
      return;
    }

    seenKeysRef.current.add(key);
    if (typeof eventId === "number") {
      sinceRef.current = Math.max(sinceRef.current ?? 0, eventId);
    }

    setEvents((previous) => [...previous, event]);
  }, []);

  useEffect(() => {
    if (!projectId) {
      return;
    }

    let closed = false;
    let source: EventSource | null = null;

    const connect = () => {
      const query = sinceRef.current ? `?since=${sinceRef.current}` : "";
      source = new EventSource(`/api/stream/${projectId}${query}`);

      source.onopen = () => {
        if (closed) return;
        retryCountRef.current = 0;
        setConnected(true);
        setError(null);
      };

      source.onmessage = (message) => {
        try {
          const parsed = JSON.parse(message.data) as
            | AgentEvent
            | { id?: number; payload?: AgentEvent };

          if ("payload" in parsed && parsed.payload) {
            appendEvent(parsed.payload, parsed.id);
            return;
          }

          appendEvent(parsed as AgentEvent);
        } catch {
          setError("No pudimos leer algunos eventos del stream.");
        }
      };

      source.onerror = async () => {
        source?.close();
        setConnected(false);
        if (closed) return;

        retryCountRef.current += 1;
        const delay = Math.min(1000 * 2 ** retryCountRef.current, 10000);
        setError("Reconectando stream...");

        reconnectTimerRef.current = window.setTimeout(connect, delay);
      };
    };

    connect();

    return () => {
      closed = true;
      source?.close();
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current);
      }
      setConnected(false);
    };
  }, [appendEvent, projectId]);

  const artifacts = useMemo<StreamArtifact[]>(
    () =>
      events
        .filter((event): event is Extract<AgentEvent, { kind: "artifact.created" }> => event.kind === "artifact.created")
        .map((event, index) => ({
          id: `${event.runId}:${event.ref}:${index}`,
          agent: event.agent,
          type: event.type,
          ref: event.ref,
          ts: event.ts,
        })),
    [events],
  );

  const tools = useMemo(
    () =>
      events.filter(
        (event): event is Extract<AgentEvent, { kind: "tool.called" }> => event.kind === "tool.called",
      ),
    [events],
  );

  const thinkingByAgent = useMemo(() => {
    const byAgent: Record<string, string> = {};
    events.forEach((event) => {
      if (event.kind === "agent.thinking") {
        byAgent[event.agent] = `${byAgent[event.agent] ?? ""}${event.tokens}`;
      }
    });
    return byAgent;
  }, [events]);

  const agentStatuses = useMemo<Record<AgentEvent["agent"], AgentStatus>>(() => {
    const status: Record<AgentEvent["agent"], AgentStatus> = {
      strategy: "idle",
      creative: "idle",
      influencer: "idle",
      launch: "idle",
    };

    events.forEach((event) => {
      if (event.kind === "agent.started") status[event.agent] = "active";
      if (event.kind === "agent.completed") status[event.agent] = "done";
      if (event.kind === "agent.failed") status[event.agent] = "failed";
    });

    return status;
  }, [events]);

  const activeAgent = useMemo(() => {
    for (let i = events.length - 1; i >= 0; i -= 1) {
      const event = events[i];
      if (!event) continue;
      if (event.kind === "agent.started" || event.kind === "agent.thinking") {
        return event.agent;
      }
      if (event.kind === "agent.completed" || event.kind === "agent.failed") {
        return null;
      }
    }

    return null;
  }, [events]);

  const workingCount = useMemo(
    () => Object.values(agentStatuses).filter((state) => state === "active").length,
    [agentStatuses],
  );

  const emitLocalEvent = useCallback(
    (event: AgentEventInput) => {
      appendEvent({ ...event, ts: new Date().toISOString() });
    },
    [appendEvent],
  );

  return {
    events,
    artifacts,
    tools,
    connected,
    error,
    activeAgent,
    agentStatuses,
    thinkingByAgent,
    workingCount,
    emitLocalEvent,
  };
}
