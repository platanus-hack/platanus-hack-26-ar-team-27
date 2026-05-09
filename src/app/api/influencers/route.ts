/**
 * POST /api/influencers — dispara el Influencer Matching Agent (D8, D14).
 *
 * Body opcional: { project_id?: string }  // por default usa cookie.
 *
 * Devuelve { run_id, project_id, match_ids[] } cuando termina.
 * El streaming en vivo se consume vía SSE en /api/stream/:projectId.
 *
 * Pre-requisito: el proyecto tiene una `strategies` row (correr Strategy primero).
 */
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getOrCreateProjectId } from "@/lib/project";
import { matchInfluencers } from "@/lib/agents/influencer";

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
    const result = await matchInfluencers({ projectId, runId });
    return NextResponse.json({
      run_id: runId,
      project_id: projectId,
      match_ids: result.matchIds,
    });
  } catch (err) {
    console.error("[/api/influencers] failed", err);
    return NextResponse.json(
      {
        run_id: runId,
        project_id: projectId,
        error: err instanceof Error ? err.message : "matching_failed",
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
