/**
 * Publisher del event bus — inserta en `agent_events` (que dispara pg_notify).
 *
 * Usar desde cualquier agente:
 *
 *   await publishEvent({
 *     kind: 'agent.started',
 *     agent: 'strategy',
 *     runId,
 *     projectId,
 *   });
 *
 * El `ts` se agrega automáticamente.
 */

import { getServiceClient } from "@/lib/supabase/client";
import { makeEvent, type AgentEvent } from "@/lib/events/types";

export async function publishEvent(
  event: Omit<AgentEvent, "ts">,
): Promise<void> {
  const full = makeEvent(event);
  const client = getServiceClient();
  const { error } = await client.from("agent_events").insert({
    project_id: full.projectId,
    run_id: full.runId,
    agent: full.agent,
    kind: full.kind,
    payload: full,
  });
  if (error) {
    console.error("[publishEvent] failed to insert event", error, full);
    throw error;
  }
}
