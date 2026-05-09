/**
 * POST /api/strategy — dispara el Strategy Agent.
 *
 * Body opcional: { project_id?: string }  // por default usa cookie.
 *
 * Devuelve { run_id, strategy_id, output } cuando termina.
 * El streaming en vivo se consume vía SSE en /api/stream/:projectId.
 */
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getOrCreateProjectId } from "@/lib/project";
import { runStrategy } from "@/lib/agents/strategy";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let projectId: string;
  try {
    const body = (await safelyReadJson(req)) as { project_id?: string };
    projectId = body.project_id ?? (await getOrCreateProjectId());
  } catch {
    projectId = await getOrCreateProjectId();
  }

  const runId = randomUUID();

  try {
    const result = await runStrategy({ projectId, runId });
    return NextResponse.json({
      run_id: runId,
      project_id: projectId,
      strategy_id: result.strategyId,
      output: result.output,
    });
  } catch (err) {
    console.error("[/api/strategy] failed", err);
    return NextResponse.json(
      {
        run_id: runId,
        project_id: projectId,
        error: err instanceof Error ? err.message : "strategy_failed",
      },
      { status: 500 },
    );
  }
}

async function safelyReadJson(req: NextRequest): Promise<unknown> {
  const ct = req.headers.get("content-type") ?? "";
  if (!ct.includes("application/json")) return {};
  try {
    return await req.json();
  } catch {
    return {};
  }
}
