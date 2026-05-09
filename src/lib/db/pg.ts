/**
 * Postgres client SERVER-ONLY.
 *
 * Usamos un postgres client directo (no Supabase JS) en server por dos razones:
 *  1) LISTEN/NOTIFY del event bus (D5) requiere conexión raw que el SDK no expone.
 *  2) Sin auth en MVP (D13) no necesitamos el flow del JS SDK.
 *
 * Connection: DATABASE_URL (pooled) por default. Para LISTEN persistente, usar
 * getDirectSql() con DIRECT_URL (la conexión pooled cierra LISTEN al rotar).
 */

import postgres from "postgres";

let _pooled: ReturnType<typeof postgres> | null = null;
let _direct: ReturnType<typeof postgres> | null = null;

/** Conexión pooled (default). Usar para queries normales. */
export function getSql() {
  if (_pooled) return _pooled;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL env missing");
  }
  _pooled = postgres(url, { prepare: false });
  return _pooled;
}

/** Conexión directa (sin pooler). Usar para LISTEN/NOTIFY persistente. */
export function getDirectSql() {
  if (_direct) return _direct;
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DIRECT_URL or DATABASE_URL env missing");
  }
  _direct = postgres(url, { prepare: false, max: 1 });
  return _direct;
}
