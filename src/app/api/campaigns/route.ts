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

export async function POST() {
  return NextResponse.json(
    { error: "not_implemented", track: "T5" },
    { status: 501 },
  );
}
