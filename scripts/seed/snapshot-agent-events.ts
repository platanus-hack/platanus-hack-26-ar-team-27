import { writeFile } from "node:fs/promises";
import postgres from "postgres";

type AgentEventRow = {
  id: number;
  project_id: string;
  payload: string;
  created_at: string;
};

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL env missing");
  }

  const projectId = process.argv[2];
  if (!projectId) {
    throw new Error("Usage: pnpm snapshot:events -- <project_id>");
  }

  const sql = postgres(connectionString, { prepare: false });
  const rows = await sql<AgentEventRow[]>`
    select id, project_id, payload::text as payload, created_at
    from agent_events
    where project_id = ${projectId}
    order by id asc
  `;

  if (rows.length === 0) {
    throw new Error(`No events found for project ${projectId}`);
  }

  const start = new Date(rows[0].created_at).getTime();
  const snapshot = rows.map((row) => {
    const atMs = Math.max(0, new Date(row.created_at).getTime() - start);
    return {
      atMs,
      event: JSON.parse(row.payload),
    };
  });

  const outputPath = "src/lib/mocks/agent-events-snapshot.generated.json";
  await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  await sql.end();

  console.log(`Snapshot written to ${outputPath} (${snapshot.length} events)`);
}

main().catch((error) => {
  console.error("snapshot-agent-events failed", error);
  process.exit(1);
});
