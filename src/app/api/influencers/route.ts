/**
 * OWNER: Track 2 (Backend / Agents) — coord con T5 para DM polish.
 * Endpoint: POST /api/influencers (match)
 *
 * Body: { strategyId: string }
 *
 * Implementar:
 *  - leer ICP + detected_categories de la strategy
 *  - lib/agents/influencer.matchInfluencers(...)
 *  - persistir en influencer_matches con draft_messages = { initial, follow_up }
 *  - emitir artifact.created por cada match
 */
import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { error: "not_implemented", track: "T2" },
    { status: 501 },
  );
}
