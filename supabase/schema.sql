-- ============================================================
-- Yoink It — Supabase schema
-- Run this in the Supabase SQL editor (Dashboard → SQL editor)
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- Extensions
-- ────────────────────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ────────────────────────────────────────────────────────────
-- profiles
-- ────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id               uuid        primary key references auth.users(id) on delete cascade,
  name             text        not null default '',
  email            text,
  phone            text        unique,
  default_address  text,
  item_visibility  text        not null default 'added'
                               check (item_visibility in ('added', 'both')),
  profile_photo    text,
  friends          uuid[]      not null default '{}',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- Auto-update updated_at
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute procedure public.set_updated_at();

-- RLS
alter table public.profiles enable row level security;

-- Anyone can read any profile (needed for friend discovery & donor display)
create policy "profiles: anyone can read"
  on public.profiles for select using (true);

-- Users can only insert/update their own profile
create policy "profiles: owner insert"
  on public.profiles for insert with check (auth.uid() = id);

create policy "profiles: owner update"
  on public.profiles for update using (auth.uid() = id);

-- ────────────────────────────────────────────────────────────
-- items
-- ────────────────────────────────────────────────────────────
create table if not exists public.items (
  id                   uuid        primary key default gen_random_uuid(),
  donor_id             uuid        not null references public.profiles(id) on delete cascade,
  title                text        not null,
  description          text        not null default '',
  photos               text[]      not null default '{}',
  restrictions         text,
  pickup_location      text        not null,
  pickup_window        text        not null,
  disposal_date        timestamptz not null,
  disposal_method      text        not null
                                   check (disposal_method in ('charity','keep','trash')),
  disposal_method_note text,
  claim_pickup_hours   integer     not null default 72,
  status               text        not null default 'available'
                                   check (status in ('available','claimed','pending_pickup','picked_up','disposed')),
  claimed_by           uuid        references public.profiles(id),
  claim_deadline       timestamptz,
  waitlist             uuid[]      not null default '{}',
  created_at           timestamptz not null default now()
);

-- RLS
alter table public.items enable row level security;

-- Anyone authenticated can read items (visibility filtering happens in app layer)
create policy "items: authenticated read"
  on public.items for select using (auth.role() = 'authenticated');

-- Only the donor can insert
create policy "items: donor insert"
  on public.items for insert with check (auth.uid() = donor_id);

-- Any authenticated user can update items (claiming, waitlist, pickup).
-- Business logic in the app layer enforces who may do what.
create policy "items: authenticated update"
  on public.items for update
  using (auth.role() = 'authenticated');

-- Only donor can delete
create policy "items: donor delete"
  on public.items for delete using (auth.uid() = donor_id);

-- ────────────────────────────────────────────────────────────
-- search_notifications
-- ────────────────────────────────────────────────────────────
create table if not exists public.search_notifications (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references public.profiles(id) on delete cascade,
  keyword    text        not null,
  created_at timestamptz not null default now(),
  unique (user_id, keyword)
);

alter table public.search_notifications enable row level security;

create policy "search_notifications: owner only"
  on public.search_notifications for all using (auth.uid() = user_id);

-- ────────────────────────────────────────────────────────────
-- Realtime: enable for items so clients get live updates
-- ────────────────────────────────────────────────────────────
alter publication supabase_realtime add table public.items;

-- ────────────────────────────────────────────────────────────
-- Mutual friend helper: appends my_id to target_id's friends
-- array without duplicates. SECURITY DEFINER bypasses RLS so
-- a user can write to another user's friends list.
-- ────────────────────────────────────────────────────────────
create or replace function public.add_friend_mutual(target_id uuid, my_id uuid)
returns void language plpgsql security definer as $$
begin
  update public.profiles
  set friends = friends || jsonb_build_array(my_id::text)
  where id = target_id
    and not (friends @> jsonb_build_array(my_id::text));
end;
$$;

-- ────────────────────────────────────────────────────────────
-- Account deletion (required by App Store Guideline 5.1.1(v)).
-- Deletes the calling user's auth record; profiles and items
-- are removed via on-delete cascades.
-- ────────────────────────────────────────────────────────────
create or replace function public.delete_own_account()
returns void language plpgsql security definer as $$
begin
  delete from auth.users where id = auth.uid();
end;
$$;

-- ────────────────────────────────────────────────────────────
-- Trusted borrowers: null = visible to all friends,
-- otherwise only the listed user ids can see the item.
-- ────────────────────────────────────────────────────────────
alter table public.items add column if not exists allowed_borrowers uuid[];
