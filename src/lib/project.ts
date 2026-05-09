/**
 * Project session — sin auth en MVP (design D13).
 * El `project_id` se guarda en una cookie con UUID y todas las queries filtran por él.
 */

import { cookies } from "next/headers";
import { randomUUID } from "crypto";
import { getSql } from "@/lib/db/pg";

const COOKIE_NAME = "rge_project_id";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 días

/** Server-side: obtiene el project_id de la cookie, o crea uno nuevo. */
export async function getOrCreateProjectId(): Promise<string> {
  const jar = cookies();
  const existing = jar.get(COOKIE_NAME)?.value;
  if (existing) return existing;

  const id = randomUUID();
  const sql = getSql();
  await sql`insert into projects (id) values (${id})`;

  jar.set(COOKIE_NAME, id, {
    maxAge: COOKIE_MAX_AGE,
    httpOnly: false,
    sameSite: "lax",
    path: "/",
  });
  return id;
}

/** Server-side: solo lee la cookie. Devuelve null si no existe. */
export function readProjectIdFromCookie(): string | null {
  return cookies().get(COOKIE_NAME)?.value ?? null;
}
