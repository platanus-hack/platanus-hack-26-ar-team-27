/**
 * POST /api/influencers — dispara el Influencer Matching Agent (D8, D14).
 *
 * Body opcional: { project_id?: string }  // por default usa cookie.
 *
 * Devuelve { run_id, project_id, match_ids[], matches[] } cuando termina.
 * `matches` viene joineado con `influencers` para que el UI los renderee
 * sin un fetch adicional. El streaming en vivo se consume vía SSE.
 *
 * Pre-requisito: el proyecto tiene una `strategies` row (correr Strategy primero).
 */
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getOrCreateProjectId } from "@/lib/project";
import { matchInfluencers } from "@/lib/agents/influencer";
import { getSql } from "@/lib/db/pg";

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

    const sql = getSql();
    const rows = await sql<
      {
        match_id: string;
        match_score: number;
        draft_messages: { initial: string; follow_up: string };
        avatar_url: string | null;
        display_name: string | null;
        handle: string;
        followers_count: number | null;
        engagement_rate: number | null;
      }[]
    >`
      select m.id as match_id,
             m.match_score,
             m.draft_messages,
             i.avatar_url,
             i.display_name,
             i.handle,
             i.followers_count,
             i.engagement_rate
      from influencer_matches m
      join influencers i on i.id = m.influencer_id
      where m.id = any(${result.matchIds})
      order by m.match_score desc
    `;

    const matches = rows.map((r) => ({
      id: r.match_id,
      avatar_url: r.avatar_url,
      display_name: r.display_name ?? `@${r.handle}`,
      handle: r.handle,
      followers_count: r.followers_count ?? 0,
      engagement_rate: Number(r.engagement_rate ?? 0),
      match_score: Number(r.match_score),
      draft_messages: {
        initial: r.draft_messages?.initial ?? "",
        follow_up: r.draft_messages?.follow_up ?? "",
      },
    }));

    return NextResponse.json({
      run_id: runId,
      project_id: projectId,
      match_ids: result.matchIds,
      matches,
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
