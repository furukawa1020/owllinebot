-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Groups Table (Represents a LINE Group or Room)
create table groups (
  id uuid primary key default uuid_generate_v4(),
  line_group_id text not null unique, -- LINE's groupId or roomId
  name text default '未設定グループ',
  created_at timestamptz default now()
);

-- Members Table (Users within a group)
create table members (
  id uuid primary key default uuid_generate_v4(),
  group_id uuid references groups(id) on delete cascade,
  line_user_id text not null,
  display_name text, -- Cached display name
  role text default 'member', -- 'admin' or 'member'
  created_at timestamptz default now(),
  unique(group_id, line_user_id)
);

-- Activities Table (Work logs)
create table activities (
  id uuid primary key default uuid_generate_v4(),
  group_id uuid references groups(id) on delete cascade,
  member_id uuid references members(id) on delete set null,
  activity_type text default 'log', -- 'log' for now, extensible
  raw_text text not null,
  created_at timestamptz default now(),
  expires_at timestamptz -- For "Now" command filtering (e.g., 24h)
);

-- RLS Policies
alter table groups enable row level security;
alter table members enable row level security;
alter table activities enable row level security;

-- Policy: Allow anonymous access for now (since Edge Function uses service role or anon key)
-- In a real app with user auth, we would restrict this.
-- For the bot, the Edge Function acts as the trusted backend.
create policy "Allow public read/write for bot" on groups for all using (true) with check (true);
create policy "Allow public read/write for bot" on members for all using (true) with check (true);
create policy "Allow public read/write for bot" on activities for all using (true) with check (true);
