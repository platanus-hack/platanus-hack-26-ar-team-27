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

import { useEffect, useState } from "react";
import type { AgentEvent } from "@/lib/events/types";

export function useAgentStream(projectId: string | null) {
  const [events, setEvents] = useState<AgentEvent[]>([]);

  useEffect(() => {
    if (!projectId) return;
    // TODO Track 1: abrir EventSource(`/api/stream/${projectId}`),
    // parsear cada `data:` como AgentEvent, dedupe por (runId+kind+ts).
  }, [projectId]);

  return { events };
}
