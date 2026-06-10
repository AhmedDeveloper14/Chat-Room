-- ============================================================
-- KARACHI LOUNGE — SUPABASE SCHEMA
-- Run this entire file in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- 1. USERS TABLE (nickname registry)
create table if not exists public.kl_users (
  id            uuid default gen_random_uuid() primary key,
  nick          text unique not null,
  area          text not null,
  role          text not null default 'guest',   -- owner|admin|vip|user|guest
  color         text not null default '#e8f4f0',
  avatar_bg     text not null default '#1c2d3a',
  password_hash text,                            -- null = guest session
  email         text unique,
  is_banned     boolean default false,
  last_seen     timestamptz default now(),
  created_at    timestamptz default now()
);

-- 2. MESSAGES TABLE (global chat)
create table if not exists public.kl_messages (
  id         bigserial primary key,
  nick       text not null,
  role       text not null default 'guest',
  color      text not null default '#e8f4f0',
  area       text,
  text       text not null,
  is_system  boolean default false,
  created_at timestamptz default now()
);

-- 3. DM MESSAGES TABLE
create table if not exists public.kl_dms (
  id         bigserial primary key,
  from_nick  text not null,
  to_nick    text not null,
  text       text not null,
  read       boolean default false,
  created_at timestamptz default now()
);

-- 4. PRESENCE TABLE (who is online)
create table if not exists public.kl_presence (
  nick        text primary key,
  area        text,
  role        text default 'guest',
  color       text default '#e8f4f0',
  avatar_bg   text default '#1c2d3a',
  status_icon text default '🟢',
  status_text text default 'Online',
  registered  boolean default false,
  last_ping   timestamptz default now()
);

-- ── INDEXES ──────────────────────────────────────────────────
create index if not exists kl_messages_created_at_idx on public.kl_messages(created_at desc);
create index if not exists kl_dms_pair_idx on public.kl_dms(from_nick, to_nick);
create index if not exists kl_presence_ping_idx on public.kl_presence(last_ping desc);

-- ── ROW LEVEL SECURITY (open for now — lock down later) ──────
alter table public.kl_users     enable row level security;
alter table public.kl_messages  enable row level security;
alter table public.kl_dms       enable row level security;
alter table public.kl_presence  enable row level security;

-- Allow all anon reads & writes (adjust per your needs)
create policy "public read messages"  on public.kl_messages  for select using (true);
create policy "public insert messages" on public.kl_messages for insert with check (true);
create policy "public read presence"  on public.kl_presence  for select using (true);
create policy "public upsert presence" on public.kl_presence for all using (true) with check (true);
create policy "public read dms"       on public.kl_dms       for select using (true);
create policy "public insert dms"     on public.kl_dms       for insert with check (true);
create policy "public update dms"     on public.kl_dms       for update using (true);
create policy "public read users"     on public.kl_users     for select using (true);
create policy "public insert users"   on public.kl_users     for insert with check (true);
create policy "public update users"   on public.kl_users     for update using (true);

-- ── REALTIME (enable for live updates) ───────────────────────
-- Run these one by one if needed:
-- alter publication supabase_realtime add table public.kl_messages;
-- alter publication supabase_realtime add table public.kl_presence;
-- alter publication supabase_realtime add table public.kl_dms;

-- ── SEED: Owner account (password: owner786) ─────────────────
-- Simple bcrypt-style marker — real hashing done in API
insert into public.kl_users (nick, area, role, color, avatar_bg, password_hash, email)
values ('KLOwner', 'Clifton', 'owner', '#ff4d6d', '#3d0a10', 'owner786', 'owner@karachilounge.com')
on conflict (nick) do nothing;
