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
-- Inverse of allowed_borrowers: these friends can NOT see the item.
alter table public.items add column if not exists excluded_friends uuid[];

-- ────────────────────────────────────────────────────────────
-- Skills: a third listing type for offering help/expertise.
-- ────────────────────────────────────────────────────────────
alter table public.items drop constraint if exists items_listing_type_check;
alter table public.items add constraint items_listing_type_check
  check (listing_type in ('give','borrow','skill'));

-- ────────────────────────────────────────────────────────────
-- Privacy: store ZIP codes only, never street addresses.
-- items.pickup_location and profiles.default_address keep their
-- column names but hold a 5-digit ZIP (pickup_location is '' for
-- skills). Existing rows are reduced to their trailing ZIP; rows
-- without one are cleared.
-- ────────────────────────────────────────────────────────────
update public.items
set pickup_location = coalesce(substring(pickup_location from '(\d{5})(?:-\d{4})?\s*$'), '')
where pickup_location !~ '^(\d{5})?$';

update public.profiles
set default_address = substring(default_address from '(\d{5})(?:-\d{4})?\s*$')
where default_address is not null and default_address !~ '^\d{5}$';

alter table public.items drop constraint if exists items_pickup_zip_check;
alter table public.items add constraint items_pickup_zip_check
  check (pickup_location ~ '^(\d{5})?$');

alter table public.profiles drop constraint if exists profiles_zip_check;
alter table public.profiles add constraint profiles_zip_check
  check (default_address is null or default_address ~ '^\d{5}$');

-- ────────────────────────────────────────────────────────────
-- Locations: "City, ST 12345" (still never a street address).
-- Replaces the ZIP-only constraints; a bare ZIP is still allowed
-- for older rows, and the app fills in city/state when edited.
-- City may not contain digits or commas, which blocks street
-- addresses like "742 Evergreen Terrace, …".
-- ────────────────────────────────────────────────────────────
alter table public.items drop constraint if exists items_pickup_zip_check;
alter table public.items add constraint items_pickup_zip_check
  check (pickup_location ~ '^(([^,0-9]{1,40}, [A-Z]{2} )?[0-9]{5})?$');

alter table public.profiles drop constraint if exists profiles_zip_check;
alter table public.profiles add constraint profiles_zip_check
  check (default_address is null or default_address ~ '^([^,0-9]{1,40}, [A-Z]{2} )?[0-9]{5}$');

-- Fill in city/state for ZIP-only rows using known seed ZIPs.
with zip_city(zip, city_state) as (values
  ('02116', 'Boston, MA'),
  ('02139', 'Cambridge, MA'),
  ('10118', 'New York, NY'),
  ('19102', 'Philadelphia, PA'),
  ('30303', 'Atlanta, GA'),
  ('33131', 'Miami, FL'),
  ('37201', 'Nashville, TN'),
  ('55401', 'Minneapolis, MN'),
  ('60606', 'Chicago, IL'),
  ('70112', 'New Orleans, LA'),
  ('77002', 'Houston, TX'),
  ('78701', 'Austin, TX'),
  ('80202', 'Denver, CO'),
  ('85004', 'Phoenix, AZ'),
  ('90046', 'Los Angeles, CA'),
  ('92101', 'San Diego, CA'),
  ('94117', 'San Francisco, CA'),
  ('97209', 'Portland, OR'),
  ('97210', 'Portland, OR'),
  ('98109', 'Seattle, WA'),
  ('62701', 'Springfield, IL'),
  ('62702', 'Springfield, IL'),
  ('62703', 'Springfield, IL'),
  ('62704', 'Springfield, IL')
)
update public.items i
set pickup_location = z.city_state || ' ' || z.zip
from zip_city z
where i.pickup_location = z.zip;

with zip_city(zip, city_state) as (values
  ('02116', 'Boston, MA'),
  ('02139', 'Cambridge, MA'),
  ('10118', 'New York, NY'),
  ('19102', 'Philadelphia, PA'),
  ('30303', 'Atlanta, GA'),
  ('33131', 'Miami, FL'),
  ('37201', 'Nashville, TN'),
  ('55401', 'Minneapolis, MN'),
  ('60606', 'Chicago, IL'),
  ('70112', 'New Orleans, LA'),
  ('77002', 'Houston, TX'),
  ('78701', 'Austin, TX'),
  ('80202', 'Denver, CO'),
  ('85004', 'Phoenix, AZ'),
  ('90046', 'Los Angeles, CA'),
  ('92101', 'San Diego, CA'),
  ('94117', 'San Francisco, CA'),
  ('97209', 'Portland, OR'),
  ('97210', 'Portland, OR'),
  ('98109', 'Seattle, WA'),
  ('62701', 'Springfield, IL'),
  ('62702', 'Springfield, IL'),
  ('62703', 'Springfield, IL'),
  ('62704', 'Springfield, IL')
)
update public.profiles p
set default_address = z.city_state || ' ' || z.zip
from zip_city z
where p.default_address = z.zip;
