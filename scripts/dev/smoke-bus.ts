/**
 * Smoke test del event bus (T2 §2.5).
 *
 * Uso:
 *   pnpm tsx scripts/dev/smoke-bus.ts
 *
 * Lo que hace:
 *  1. Crea un proyecto temporal en Postgres.
 *  2. Abre conexión SSE a /api/stream/:projectId (usando NEXT_BASE_URL || http://localhost:3000).
 *  3. Publica 3 eventos al bus desde Node directo.
 *  4. Verifica que llegan al cliente SSE.
 *  5. Chequea replay con ?since=<id>.
 *  6. Limpia el proyecto.
 */
import { config } from "dotenv";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { publishEvent } from "@/lib/events/publish";

config({ path: ".env.local" });

const BASE = process.env.NEXT_BASE_URL ?? "http://localhost:3000";

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { prepare: false });
  const projectId = randomUUID();
  const runId = randomUUID();

  await sql`insert into projects (id) values (${projectId})`;
  console.log(`[smoke] project ${projectId}`);

  const seen: any[] = [];
  const ctrl = new AbortController();

  const sseDone = (async () => {
    const res = await fetch(`${BASE}/api/stream/${projectId}`, {
      headers: { accept: "text/event-stream" },
      signal: ctrl.signal,
    });
    if (!res.ok || !res.body) {
      throw new Error(`SSE failed: ${res.status}`);
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const parts = buf.split("\n\n");
      buf = parts.pop() ?? "";
      for (const part of parts) {
        const dataLine = part
          .split("\n")
          .find((l) => l.startsWith("data:"));
        if (!dataLine) continue;
        const json = dataLine.slice(5).trim();
        try {
          seen.push(JSON.parse(json));
        } catch {}
      }
    }
  })();

  // Esperá un instante para asegurar la conexión.
  await new Promise((r) => setTimeout(r, 500));

  // Publicá 3 eventos.
  await publishEvent({
    kind: "agent.started",
    agent: "strategy",
    runId,
    projectId,
  } as const);
  await publishEvent({
    kind: "agent.thinking",
    agent: "strategy",
    runId,
    projectId,
    tokens: "hola mundo",
  } as const);
  await publishEvent({
    kind: "agent.completed",
    agent: "strategy",
    runId,
    projectId,
    summary: "ok",
  } as const);

  await new Promise((r) => setTimeout(r, 1500));
  ctrl.abort();
  await sseDone.catch(() => {});

  console.log(`[smoke] received ${seen.length} events`);
  if (seen.length < 3) {
    console.error("[smoke] FAIL: expected >= 3 events");
    process.exit(1);
  }

  // Replay test: ?since debería devolver subset.
  const lastId = seen[seen.length - 1].id;
  const replayRes = await fetch(
    `${BASE}/api/stream/${projectId}?since=${lastId}`,
    { headers: { accept: "text/event-stream" } },
  );
  if (!replayRes.ok || !replayRes.body) {
    console.error("[smoke] FAIL: replay req");
    process.exit(1);
  }
  const r2 = replayRes.body.getReader();
  const dec2 = new TextDecoder();
  let buf2 = "";
  let replayCount = 0;
  const replayCtrl = new AbortController();
  setTimeout(() => replayCtrl.abort(), 1500);
  try {
    while (true) {
      const { value, done } = await r2.read();
      if (done) break;
      buf2 += dec2.decode(value, { stream: true });
      const parts = buf2.split("\n\n");
      buf2 = parts.pop() ?? "";
      for (const part of parts) {
        const dataLine = part.split("\n").find((l) => l.startsWith("data:"));
        if (!dataLine) continue;
        replayCount++;
      }
      if (replayCtrl.signal.aborted) break;
    }
  } catch {}

  console.log(`[smoke] replay since=${lastId} → ${replayCount} events`);

  // cleanup
  await sql`delete from agent_events where project_id = ${projectId}`;
  await sql`delete from projects where id = ${projectId}`;
  await sql.end();

  console.log("[smoke] OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
