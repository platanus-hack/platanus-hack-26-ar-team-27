/**
 * Publisher del event bus — inserta en `agent_events` (que dispara pg_notify).
 *
 * Uso desde cualquier agente:
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

import { getSql } from "@/lib/db/pg";
import { type AgentEvent } from "@/lib/events/types";

type AgentEventInput = AgentEvent extends infer T
  ? T extends AgentEvent
    ? Omit<T, "ts">
    : never
  : never;

export async function publishEvent(
  event: AgentEventInput,
): Promise<void> {
  const full: AgentEvent = {
    ...event,
    ts: new Date().toISOString(),
  };
  const sql = getSql();
  try {
    await sql`
      insert into agent_events (project_id, run_id, agent, kind, payload)
      values (
        ${full.projectId},
        ${full.runId},
        ${full.agent},
        ${full.kind},
        ${sql.json(JSON.parse(JSON.stringify(full)))}
      )
    `;
  } catch (err) {
    console.error("[publishEvent] failed", err, full);
    throw err;
  }
}
