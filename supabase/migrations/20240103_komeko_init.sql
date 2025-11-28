-- 20240103_komeko_init.sql

-- 1. Users Table
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  line_user_id text unique not null,
  nickname text,
  monthly_budget integer default 30000,
  payday integer default 25, -- Day of month (1-31)
  fixed_costs integer default 0, -- Rent, etc.
  savings_goal integer default 0, -- Target savings
  onboarding_status text default 'INIT', -- INIT, NAME, PAYDAY, INCOME, FIXED, SAVINGS, COMPLETE
  created_at timestamptz default now()
);

-- 2. Groups Table
create table if not exists groups (
  id uuid primary key default gen_random_uuid(),
  line_group_id text unique not null,
  name text,
  created_at timestamptz default now()
);

-- 3. Group Members Junction
create table if not exists group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references groups(id) on delete cascade,
  user_id uuid references users(id) on delete cascade,
  role text default 'member',
  created_at timestamptz default now(),
  unique(group_id, user_id)
);

-- 4. Meals (Food Logs)
create table if not exists meals (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references groups(id) on delete set null,
  user_id uuid references users(id) on delete cascade,
  label text not null, -- e.g., "Ramen", "Curry"
  price integer,       -- e.g., 800
  time_slot text,      -- 'morning', 'noon', 'evening', 'snack'
  raw_text text,       -- Original message
  created_at timestamptz default now()
);

-- 5. Preferences (Likes/Dislikes)
create table if not exists preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  label text not null,
  kind text not null check (kind in ('like', 'dislike')),
  created_at timestamptz default now()
);

-- 6. Moods (Ephemeral state for menu planning)
create table if not exists moods (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references groups(id) on delete cascade,
  user_id uuid references users(id) on delete cascade,
  mood text not null, -- 'light', 'heavy', 'eatout', 'saving', etc.
  created_at timestamptz default now()
);

-- RLS Policies (Simplified for this demo: Service Role bypasses everything, but good to have)
alter table users enable row level security;
alter table groups enable row level security;
alter table group_members enable row level security;
alter table meals enable row level security;
alter table preferences enable row level security;
alter table moods enable row level security;

-- Allow public read/write for now (controlled by Edge Function via Service Role)
create policy "Enable access for service role" on users for all using (true) with check (true);
create policy "Enable access for service role" on groups for all using (true) with check (true);
create policy "Enable access for service role" on group_members for all using (true) with check (true);
create policy "Enable access for service role" on meals for all using (true) with check (true);
create policy "Enable access for service role" on preferences for all using (true) with check (true);
create policy "Enable access for service role" on moods for all using (true) with check (true);
