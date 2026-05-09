/**
 * OWNER: Track 3.
 *
 * Script standalone (NO corre en runtime de la app) para scraping de seed
 * de influencers vía Playwright (Chromium real). Decisión D7.
 *
 * Input:  scripts/seed/seed-handles.csv   (handle, platform, category)
 * Output: scripts/seed/influencers.json   (para luego batch insert a Supabase)
 *
 * Pipeline:
 *  1. Por cada handle, navegar a instagram.com/<handle>/ (o tiktok.com/@<handle>)
 *  2. Extraer: bio, followers, post URLs (12 visibles)
 *  3. Abrir 2-3 posts y capturar captions
 *  4. Resumir captions con GPT-4o-mini → recent_post_summary
 *  5. Embedding(bio + recent_post_summary + categories) con text-embedding-3-small
 *
 * Anti-bloqueo: delay aleatorio 5-10s, rotación de user-agent.
 *
 * Ejecutar:
 *   pnpm seed:scrape
 */

async function main() {
  console.log("[scrape] TODO: implementar (Track 3, tasks 2.13-2.15)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
