/**
 * GET /api/stream/:projectId — SSE del agent event bus.
 *
 * Diseño D5: Postgres LISTEN/NOTIFY + replay desde tabla `agent_events`.
 *
 * Query params:
 *  - ?since=<event_id>  → replay de eventos con id > since para este project_id.
 *  - sin since          → replay completo del project (orden cronológico).
 *
 * Cada evento serializado en el formato:
 *   id: <event_id>
 *   data: <json del row>
 *
 * El cliente debe deduplicar por `id` (ver D6 idempotencia).
 */
import type { NextRequest } from "next/server";
import { getDirectSql, getSql } from "@/lib/db/pg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type EventRow = {
  id: number;
  project_id: string;
  run_id: string;
  agent: string;
  kind: string;
  payload: unknown;
  created_at: string;
};

const HEARTBEAT_MS = 15_000;

export async function GET(
  req: NextRequest,
  ctx: { params: { projectId: string } },
) {
  const projectId = ctx.params.projectId;
  if (!isUuid(projectId)) {
    return new Response(JSON.stringify({ error: "invalid_project_id" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const sinceParam = new URL(req.url).searchParams.get("since");
  const since = sinceParam ? Number(sinceParam) : 0;

  const channel = `agent_events:${projectId}`;
  const directSql = getDirectSql();
  const pooledSql = getSql();

  let cleanup: (() => Promise<void>) | null = null;
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enc = new TextEncoder();
      const enqueue = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(enc.encode(chunk));
        } catch {
          closed = true;
        }
      };

      enqueue(`retry: 3000\n\n`);
      enqueue(`: connected to ${channel}\n\n`);

      // 1) Empezar a escuchar PRIMERO. Bufferamos lo que llegue durante el replay.
      const liveBuffer: string[] = [];
      let replayDone = false;
      let listenHandle: { unlisten: () => Promise<void> } | null = null;

      try {
        listenHandle = await directSql.listen(channel, (payload) => {
          if (!replayDone) {
            liveBuffer.push(payload);
            return;
          }
          enqueue(formatNotifyPayload(payload));
        });
      } catch (err) {
        console.error("[stream] LISTEN failed", err);
        enqueue(
          `event: error\ndata: ${JSON.stringify({ error: "listen_failed" })}\n\n`,
        );
        controller.close();
        return;
      }

      // 2) Replay: eventos con id > since para este project_id, en orden.
      try {
        const rows = (await pooledSql<EventRow[]>`
          select id, project_id, run_id, agent, kind, payload, created_at
          from agent_events
          where project_id = ${projectId} and id > ${since}
          order by id asc
        `) as unknown as EventRow[];

        for (const row of rows) {
          enqueue(formatRow(row));
        }
      } catch (err) {
        console.error("[stream] replay failed", err);
      }

      // 3) Drenar buffer de eventos en vivo recibidos durante el replay.
      replayDone = true;
      while (liveBuffer.length) {
        const next = liveBuffer.shift();
        if (next !== undefined) enqueue(formatNotifyPayload(next));
      }

      // 4) Heartbeat para mantener la conexión viva detrás de proxies.
      const heartbeat = setInterval(() => {
        enqueue(`: ping ${Date.now()}\n\n`);
      }, HEARTBEAT_MS);

      cleanup = async () => {
        closed = true;
        clearInterval(heartbeat);
        try {
          await listenHandle?.unlisten();
        } catch (err) {
          console.error("[stream] unlisten failed", err);
        }
      };

      // Cliente cierra: abortamos limpio.
      const onAbort = () => {
        cleanup?.().finally(() => {
          try {
            controller.close();
          } catch {}
        });
      };
      req.signal.addEventListener("abort", onAbort, { once: true });
    },

    async cancel() {
      await cleanup?.();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}

function formatRow(row: EventRow): string {
  return `id: ${row.id}\ndata: ${JSON.stringify(row)}\n\n`;
}

function formatNotifyPayload(payload: string): string {
  // El trigger NOTIFY ya emite un JSON con `id`.
  try {
    const parsed = JSON.parse(payload) as { id?: number };
    if (parsed.id) {
      return `id: ${parsed.id}\ndata: ${payload}\n\n`;
    }
  } catch {
    // payload no JSON: lo emitimos crudo igual.
  }
  return `data: ${payload}\n\n`;
}

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    s,
  );
}
