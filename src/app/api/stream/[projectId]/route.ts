/**
 * OWNER: Track 2 (Event bus + agents).
 * Endpoint: GET /api/stream/:projectId  (SSE)
 *
 * Implementar:
 *  - abrir conexión SSE (text/event-stream)
 *  - LISTEN al canal Postgres `agent_events:<projectId>` (usar conexión raw, no Supabase JS)
 *  - replay opcional via ?since=<event_id>: leer agent_events WHERE id > since
 *  - relay cada NOTIFY al cliente como `data: <json>\n\n`
 *  - cleanup cuando el cliente cierra
 */
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  _ctx: { params: { projectId: string } },
) {
  return NextResponse.json(
    { error: "not_implemented", track: "T2" },
    { status: 501 },
  );
}
