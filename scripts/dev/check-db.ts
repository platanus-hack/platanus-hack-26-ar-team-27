import postgres from "postgres";
import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { prepare: false });
  const checks: { table: string; count: number }[] = [];
  for (const t of [
    "projects",
    "brand_briefs",
    "products",
    "strategies",
    "influencers",
    "influencer_matches",
    "agent_events",
  ]) {
    const r = await sql.unsafe(`select count(*)::int as c from ${t}`);
    checks.push({ table: t, count: (r[0] as any).c });
  }
  console.table(checks);
  await sql.end();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
