/**
 * OWNER: Track 2 (Backend / Agents).
 * Endpoint: POST /api/strategy
 *
 * Implementar:
 *  - leer project_id de cookie (getOrCreateProjectId)
 *  - generar runId, publicar agent.started
 *  - correr Strategy Agent (lib/agents/strategy)
 *  - persistir en strategies, publicar agent.completed
 *  - devolver { runId, strategyId }
 */
import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { error: "not_implemented", track: "T2" },
    { status: 501 },
  );
}
