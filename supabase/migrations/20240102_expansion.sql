-- supabase/migrations/20240102_expansion.sql

-- 1. Gamification Tables

-- Badges (Master table)
create table badges (
  id text primary key, -- e.g., 'first_log', 'early_bird'
  name text not null,
  description text not null,
  icon_url text, -- URL to the badge image
  created_at timestamptz default now()
);

-- User Badges (Many-to-Many)
create table user_badges (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references members(id) on delete cascade,
  badge_id text references badges(id) on delete cascade,
  awarded_at timestamptz default now(),
  unique(user_id, badge_id)
);

-- Streaks (Tracking consecutive activity)
create table streaks (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references members(id) on delete cascade,
  current_streak integer default 0,
  longest_streak integer default 0,
  last_activity_date date,
  updated_at timestamptz default now(),
  unique(user_id)
);

-- 2. Storage Helper (RLS for Storage)
-- Note: You need to create a bucket named 'photos' in the Supabase Dashboard.
-- This SQL sets up the RLS for the objects in that bucket.

-- Allow public read access to photos
create policy "Public Access"
  on storage.objects for select
  using ( bucket_id = 'photos' );

-- Allow authenticated (service role) upload
create policy "Service Upload"
  on storage.objects for insert
  with check ( bucket_id = 'photos' );

-- 3. Seed Data for Badges
insert into badges (id, name, description, icon_url) values
  ('first_log', 'はじめてのいっぽ', 'はじめてさぎょうをきろくしたよ！', null),
  ('early_bird', 'はやおきさん', 'あさ6じまえにさぎょうしたよ！', null),
  ('streak_3', 'みっかぼうずそつぎょう', '3にちれんぞくでさぎょうしたよ！', null),
  ('night_owl', 'よふかしさん', 'よる10じすぎにさぎょうしたよ！', null)
on conflict (id) do nothing;
