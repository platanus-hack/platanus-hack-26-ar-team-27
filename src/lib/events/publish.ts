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
import { makeEvent, type AgentEvent } from "@/lib/events/types";

/**
 * Distributive Omit: aplica Omit a cada miembro del union por separado para
 * preservar la discriminación por `kind`. Sin esto, los callers pierden narrowing.
 */
type AgentEventInput = AgentEvent extends infer E
  ? E extends AgentEvent
    ? Omit<E, "ts">
    : never
  : never;

export async function publishEvent(
  event: AgentEventInput,
): Promise<void> {
  const full = makeEvent(event as Omit<AgentEvent, "ts">);
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
