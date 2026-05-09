/**
 * Zod schemas reflejando supabase/migrations/001_init.sql (design D12).
 *
 * Append-only: si tu track agrega una tabla en migration 002+, agregá su schema
 * acá sin tocar los existentes. Los outputs de los agentes deben validarse
 * contra estos schemas antes de persistir.
 */

import { z } from "zod";

// ---------- proyectos ----------

export const ProjectSchema = z.object({
  id: z.string().uuid(),
  name: z.string().nullable(),
  created_at: z.string(),
});
export type Project = z.infer<typeof ProjectSchema>;

// ---------- brand brief ----------

export const BrandBriefSchema = z.object({
  id: z.string().uuid(),
  project_id: z.string().uuid(),
  raw_text: z.string(),
  source: z.enum(["form", "upload"]),
  brand_name: z.string().nullable(),
  tone_of_voice: z.string().nullable(),
  target_description: z.string().nullable(),
  values: z.array(z.string()).nullable(),
  do_not_say: z.array(z.string()).nullable(),
  created_at: z.string(),
});
export type BrandBrief = z.infer<typeof BrandBriefSchema>;

/** Output del parser-LLM antes de persistir. */
export const BrandBriefParsedSchema = z.object({
  brand_name: z.string().nullable(),
  tone_of_voice: z.string().nullable(),
  target_description: z.string().nullable(),
  values: z.array(z.string()),
  do_not_say: z.array(z.string()),
});
export type BrandBriefParsed = z.infer<typeof BrandBriefParsedSchema>;

// ---------- products ----------

export const ProductSchema = z.object({
  id: z.string().uuid(),
  project_id: z.string().uuid(),
  sku: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  price: z.number().nullable(),
  cost: z.number().nullable(),
  stock: z.number().int().nullable(),
  category: z.string().nullable(),
  primary_image_url: z.string().url().nullable(),
  created_at: z.string(),
});
export type Product = z.infer<typeof ProductSchema>;

// ---------- strategies ----------

export const HeroSkuSchema = z.object({
  sku: z.string(),
  reason: z.string(),
  priority_score: z.number(),
});
export type HeroSku = z.infer<typeof HeroSkuSchema>;

export const IcpSchema = z.object({
  age_range: z.string(),
  gender: z.string(),
  interests: z.array(z.string()),
  behaviors: z.array(z.string()),
  pain_points: z.array(z.string()),
  confidence: z.enum(["low", "medium", "high"]).default("medium"),
});
export type Icp = z.infer<typeof IcpSchema>;

export const InfluencerCategoryEnum = z.enum([
  "fashion",
  "beauty",
  "fitness",
  "home",
  "food",
]);
export type InfluencerCategory = z.infer<typeof InfluencerCategoryEnum>;

export const StrategyOutputSchema = z.object({
  hero_skus: z.array(HeroSkuSchema).min(1).max(5),
  icp: IcpSchema,
  detected_categories: z.array(InfluencerCategoryEnum).min(1),
  reasoning: z.string(),
});
export type StrategyOutput = z.infer<typeof StrategyOutputSchema>;

// ---------- creatives ----------

export const CreativeSchema = z.object({
  id: z.string().uuid(),
  project_id: z.string().uuid(),
  product_id: z.string().uuid().nullable(),
  type: z.enum(["image", "copy", "pair"]),
  asset_url: z.string().url().nullable(),
  copy_text: z.string().nullable(),
  prompt_used: z.string().nullable(),
  variant_label: z.string().nullable(),
  status: z.enum(["pending", "ready", "failed"]),
  created_at: z.string(),
});
export type Creative = z.infer<typeof CreativeSchema>;

export const CopyFrameworkEnum = z.enum(["PAS", "AIDA", "curiosity"]);
export type CopyFramework = z.infer<typeof CopyFrameworkEnum>;

export const ImageStyleEnum = z.enum(["lifestyle", "context", "comparative"]);
export type ImageStyle = z.infer<typeof ImageStyleEnum>;

// ---------- influencers ----------

export const InfluencerSchema = z.object({
  id: z.string().uuid(),
  handle: z.string(),
  platform: z.enum(["ig", "tt", "yt"]),
  display_name: z.string().nullable(),
  avatar_url: z.string().url().nullable(),
  followers_count: z.number().int().nullable(),
  engagement_rate: z.number().nullable(),
  bio: z.string().nullable(),
  recent_post_summary: z.string().nullable(),
  categories: z.array(z.string()),
  audience_demo: z
    .object({
      age_range: z.string().optional(),
      gender: z.string().optional(),
      country: z.string().optional(),
    })
    .nullable(),
  embedding: z.array(z.number()).length(1536).nullable(),
  scraped_at: z.string(),
});
export type Influencer = z.infer<typeof InfluencerSchema>;

// ---------- influencer matches ----------

export const DraftMessagesSchema = z.object({
  initial: z.string().min(1),
  follow_up: z.string().min(1),
});
export type DraftMessages = z.infer<typeof DraftMessagesSchema>;

export const InfluencerMatchSchema = z.object({
  id: z.string().uuid(),
  project_id: z.string().uuid(),
  influencer_id: z.string().uuid(),
  match_score: z.number(),
  match_reasoning: z.string().nullable(),
  draft_messages: DraftMessagesSchema,
  recommended_skus: z.array(z.string()),
  status: z.enum(["proposed", "sent", "replied"]),
  created_at: z.string(),
});
export type InfluencerMatch = z.infer<typeof InfluencerMatchSchema>;

// ---------- campaigns ----------

export const CampaignSchema = z.object({
  id: z.string().uuid(),
  project_id: z.string().uuid(),
  mock_meta_id: z.string(),
  status: z.enum(["preparing", "live", "paused"]),
  creative_ids: z.array(z.string().uuid()),
  created_at: z.string(),
});
export type Campaign = z.infer<typeof CampaignSchema>;
