/**
 * POST /api/project/reset — descarta el proyecto activo y crea uno nuevo.
 *
 * Borra la fila de `projects` (cascade limpia brand_briefs, products,
 * strategies, creatives, influencer_matches, campaigns) y los agent_events
 * asociados (no tienen FK, hay que borrarlos a mano). Después rota la cookie
 * a un proyecto fresco y devuelve el nuevo id.
 *
 * El cliente debe redirigir a `/` para que el root resuelva la nueva cookie
 * y caiga en `/dashboard/<nuevo>` con estado limpio.
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";
import { getSql } from "@/lib/db/pg";

export const runtime = "nodejs";

const COOKIE_NAME = "rge_project_id";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

export async function POST() {
  const jar = cookies();
  const previousId = jar.get(COOKIE_NAME)?.value ?? null;

  const sql = getSql();

  if (previousId) {
    try {
      await sql`delete from agent_events where project_id = ${previousId}`;
    } catch (err) {
      console.error("[/api/project/reset] purge agent_events failed", err);
    }
    try {
      await sql`delete from projects where id = ${previousId}`;
    } catch (err) {
      console.error("[/api/project/reset] delete project failed", err);
    }
  }

  const newId = randomUUID();
  await sql`insert into projects (id) values (${newId})`;

  jar.set(COOKIE_NAME, newId, {
    maxAge: COOKIE_MAX_AGE,
    httpOnly: false,
    sameSite: "lax",
    path: "/",
  });

  return NextResponse.json({ projectId: newId, previousId });
}
