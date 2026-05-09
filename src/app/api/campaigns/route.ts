/**
 * OWNER: Track 5 (Launch mock + DevOps).
 * Endpoint: POST /api/campaigns (launch-mock)
 *
 * Body: { creativeIds: string[] }
 *
 * Implementar:
 *  - publicar agent.started (agent='launch')
 *  - emitir 4 agent.thinking en sequence: "Creating campaign", "Creating ad set",
 *    "Uploading creatives", "Live"  (3-5s entre cada uno)
 *  - persistir en campaigns con mock_meta_id = 'mock_' + uuid
 *  - publicar agent.completed
 *  - NO llamar a graph.facebook.com
 */
import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { z } from "zod";
import { getSql } from "@/lib/db/pg";
import { publishEvent } from "@/lib/events/publish";
import { getOrCreateProjectId } from "@/lib/project";

const LaunchBodySchema = z.object({
  creativeIds: z.array(z.string().uuid()).min(1),
});

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = LaunchBodySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "invalid_body",
        details: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  const projectId = await getOrCreateProjectId();
  const runId = randomUUID();
  const sql = getSql();

  const thinkingSteps = [
    "Creating campaign",
    "Creating ad set",
    "Uploading creatives",
    "Live",
  ] as const;

  await publishEvent({
    kind: "agent.started",
    agent: "launch",
    runId,
    projectId,
  });

  for (const step of thinkingSteps) {
    await publishEvent({
      kind: "agent.thinking",
      agent: "launch",
      runId,
      projectId,
      tokens: step,
    });

    if (step !== "Live") {
      await sleep(3000);
    }
  }

  const mockMetaId = `mock_${randomUUID()}`;

  const rows = await sql<{
    id: string;
    project_id: string;
    mock_meta_id: string;
    status: "preparing" | "live" | "paused";
    creative_ids: string[];
    created_at: string;
  }[]>`
    insert into campaigns (project_id, mock_meta_id, status, creative_ids)
    values (
      ${projectId},
      ${mockMetaId},
      'live',
      ${sql.json(parsed.data.creativeIds)}
    )
    returning id, project_id, mock_meta_id, status, creative_ids, created_at
  `;

  await publishEvent({
    kind: "agent.completed",
    agent: "launch",
    runId,
    projectId,
    summary: "Launch mock completed",
  });

  return NextResponse.json({
    campaign: rows[0],
    runId,
  });
}
