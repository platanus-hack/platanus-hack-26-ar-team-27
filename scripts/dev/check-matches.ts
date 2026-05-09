import postgres from "postgres";
import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const projectId = process.argv[2] ?? "";
  if (!projectId) throw new Error("usage: check-matches.ts <project_id>");

  const sql = postgres(process.env.DATABASE_URL!, { prepare: false });
  const rows = await sql`
    select im.match_score, im.match_reasoning, im.draft_messages, im.recommended_skus,
           i.handle, i.bio, i.recent_post_summary
    from influencer_matches im
    join influencers i on i.id = im.influencer_id
    where im.project_id = ${projectId}
    order by im.match_score desc
  `;
  for (const r of rows as any[]) {
    console.log("---", r.handle, "score", r.match_score);
    console.log("reasoning:", String(r.match_reasoning).slice(0, 200));
    console.log("initial:", String(r.draft_messages.initial).slice(0, 200));
    console.log("follow_up:", String(r.draft_messages.follow_up).slice(0, 200));
    console.log("skus:", r.recommended_skus);
  }
  await sql.end();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
