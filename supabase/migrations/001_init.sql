-- ============================================================
-- Retail Growth Engine — schema inicial (design D12).
-- FROZEN: este archivo NO se edita después del bootstrap.
-- Para cambios, agregar 002_*.sql, 003_*.sql, etc.
-- ============================================================

create extension if not exists vector;
create extension if not exists "uuid-ossp";

-- ------------------------------------------------------------
-- projects: una fila por sesión (cookie). Sin auth en MVP.
-- ------------------------------------------------------------
create table if not exists projects (
  id uuid primary key default uuid_generate_v4(),
  name text,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- brand_briefs: contexto de marca (form o upload).
-- ------------------------------------------------------------
create table if not exists brand_briefs (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references projects(id) on delete cascade,
  raw_text text not null,
  source text not null check (source in ('form', 'upload')),
  brand_name text,
  tone_of_voice text,
  target_description text,
  values jsonb,
  do_not_say jsonb,
  created_at timestamptz not null default now()
);

create index if not exists brand_briefs_project_id_idx on brand_briefs(project_id);

-- ------------------------------------------------------------
-- products: catálogo CSV.
-- ------------------------------------------------------------
create table if not exists products (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references projects(id) on delete cascade,
  sku text not null,
  name text not null,
  description text,
  price numeric,
  cost numeric,
  stock integer,
  category text,
  primary_image_url text,
  created_at timestamptz not null default now()
);

create index if not exists products_project_id_idx on products(project_id);
create unique index if not exists products_project_sku_idx on products(project_id, sku);

-- ------------------------------------------------------------
-- strategies: output del Strategy Agent.
-- ------------------------------------------------------------
create table if not exists strategies (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references projects(id) on delete cascade,
  hero_skus jsonb not null,
  icp jsonb not null,
  detected_categories jsonb not null,
  reasoning text,
  created_at timestamptz not null default now()
);

create index if not exists strategies_project_id_idx on strategies(project_id);

-- ------------------------------------------------------------
-- creatives: 9 ads por hero SKU (Creative Engine).
-- ------------------------------------------------------------
create table if not exists creatives (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references projects(id) on delete cascade,
  product_id uuid references products(id) on delete cascade,
  type text not null check (type in ('image', 'copy', 'pair')),
  asset_url text,
  copy_text text,
  prompt_used text,
  variant_label text,
  status text not null default 'pending' check (status in ('pending', 'ready', 'failed')),
  created_at timestamptz not null default now()
);

create index if not exists creatives_project_id_idx on creatives(project_id);
create index if not exists creatives_product_id_idx on creatives(product_id);
create index if not exists creatives_status_idx on creatives(status);

-- ------------------------------------------------------------
-- influencers: pre-poblado por scrape, NO modificado desde la app.
-- ------------------------------------------------------------
create table if not exists influencers (
  id uuid primary key default uuid_generate_v4(),
  handle text not null,
  platform text not null check (platform in ('ig', 'tt', 'yt')),
  display_name text,
  avatar_url text,
  followers_count integer,
  engagement_rate numeric,
  bio text,
  recent_post_summary text,
  categories jsonb not null default '[]'::jsonb,
  audience_demo jsonb,
  embedding vector(1536),
  scraped_at timestamptz not null default now()
);

create unique index if not exists influencers_handle_platform_idx on influencers(handle, platform);
create index if not exists influencers_categories_idx on influencers using gin(categories);
-- Para cosine similarity con embeddings:
create index if not exists influencers_embedding_idx on influencers
  using ivfflat (embedding vector_cosine_ops) with (lists = 10);

-- ------------------------------------------------------------
-- influencer_matches: top creators por proyecto + DMs (initial + follow-up).
-- ------------------------------------------------------------
create table if not exists influencer_matches (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references projects(id) on delete cascade,
  influencer_id uuid not null references influencers(id),
  match_score numeric not null,
  match_reasoning text,
  draft_messages jsonb not null,  -- { initial: "...", follow_up: "..." }
  recommended_skus jsonb not null default '[]'::jsonb,
  status text not null default 'proposed' check (status in ('proposed', 'sent', 'replied')),
  created_at timestamptz not null default now()
);

create index if not exists influencer_matches_project_id_idx on influencer_matches(project_id);
create index if not exists influencer_matches_score_idx on influencer_matches(project_id, match_score desc);

-- ------------------------------------------------------------
-- campaigns: launch mock (sin Meta API real).
-- ------------------------------------------------------------
create table if not exists campaigns (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references projects(id) on delete cascade,
  mock_meta_id text not null,
  status text not null default 'preparing' check (status in ('preparing', 'live', 'paused')),
  creative_ids jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists campaigns_project_id_idx on campaigns(project_id);

-- ------------------------------------------------------------
-- agent_events: event bus persistido + LISTEN/NOTIFY (design D5/D6).
-- ------------------------------------------------------------
create table if not exists agent_events (
  id bigserial primary key,
  project_id uuid not null,
  run_id uuid not null,
  agent text not null,
  kind text not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists agent_events_project_id_idx on agent_events(project_id, id);
create index if not exists agent_events_run_id_idx on agent_events(run_id, id);

-- Trigger: emite NOTIFY por canal `agent_events:<project_id>` con el evento serializado.
create or replace function notify_agent_event() returns trigger as $$
begin
  perform pg_notify(
    'agent_events:' || NEW.project_id::text,
    json_build_object(
      'id', NEW.id,
      'project_id', NEW.project_id,
      'run_id', NEW.run_id,
      'agent', NEW.agent,
      'kind', NEW.kind,
      'payload', NEW.payload,
      'created_at', NEW.created_at
    )::text
  );
  return NEW;
end;
$$ language plpgsql;

drop trigger if exists agent_events_notify on agent_events;
create trigger agent_events_notify
  after insert on agent_events
  for each row execute function notify_agent_event();
