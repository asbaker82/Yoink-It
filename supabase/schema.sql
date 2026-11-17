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

-- (Friendships are managed by the friend-request functions near
-- the end of this file. The old add_friend_mutual helper used
-- jsonb operators on the uuid[] column and is dropped there.)

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

-- ════════════════════════════════════════════════════════════
-- FRIENDS: requests that the other person approves
-- profiles.friends holds accepted, mutual friendships only and is
-- written exclusively by the security-definer functions below.
-- ════════════════════════════════════════════════════════════
drop function if exists public.add_friend_mutual(uuid, uuid);

create table if not exists public.friend_requests (
  from_id     uuid        not null references public.profiles(id) on delete cascade,
  to_id       uuid        not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (from_id, to_id),
  check (from_id <> to_id)
);

alter table public.friend_requests enable row level security;

drop policy if exists "friend_requests: parties read" on public.friend_requests;
create policy "friend_requests: parties read"
  on public.friend_requests for select using (auth.uid() in (from_id, to_id));

-- Sender cancels / recipient declines by deleting the row
drop policy if exists "friend_requests: parties delete" on public.friend_requests;
create policy "friend_requests: parties delete"
  on public.friend_requests for delete using (auth.uid() in (from_id, to_id));

-- Clients may not edit friends directly (only the functions below may).
create or replace function public.guard_friends()
returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.friends := '{}';
    elsif new.friends is distinct from old.friends then
      new.friends := old.friends;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_friends on public.profiles;
create trigger profiles_guard_friends
  before insert or update on public.profiles
  for each row execute procedure public.guard_friends();

-- Internal: make a and b friends and clear requests between them
create or replace function public.make_friends(a uuid, b uuid)
returns void language plpgsql security definer as $$
begin
  update public.profiles set friends = array_append(friends, b)
    where id = a and not (b = any(friends));
  update public.profiles set friends = array_append(friends, a)
    where id = b and not (a = any(friends));
  delete from public.friend_requests
    where (from_id = a and to_id = b) or (from_id = b and to_id = a);
end;
$$;
revoke execute on function public.make_friends(uuid, uuid) from public, anon, authenticated;

-- Returns 'requested' or 'friends' (if they had already asked me)
create or replace function public.send_friend_request(target_id uuid)
returns text language plpgsql security definer as $$
declare
  me uuid := auth.uid();
begin
  if me is null or target_id is null or target_id = me then
    return 'invalid';
  end if;
  if exists (select 1 from public.profiles where id = me and target_id = any(friends)) then
    return 'friends';
  end if;
  if exists (select 1 from public.friend_requests r where r.from_id = target_id and r.to_id = me) then
    perform public.make_friends(me, target_id);
    return 'friends';
  end if;
  insert into public.friend_requests (from_id, to_id) values (me, target_id)
    on conflict do nothing;
  return 'requested';
end;
$$;

create or replace function public.respond_friend_request(requester_id uuid, accept boolean)
returns void language plpgsql security definer as $$
declare
  me uuid := auth.uid();
begin
  if not exists (select 1 from public.friend_requests r where r.from_id = requester_id and r.to_id = me) then
    return;
  end if;
  if accept then
    perform public.make_friends(me, requester_id);
  else
    delete from public.friend_requests r where r.from_id = requester_id and r.to_id = me;
  end if;
end;
$$;

create or replace function public.remove_friend(friend_id uuid)
returns void language plpgsql security definer as $$
declare
  me uuid := auth.uid();
begin
  update public.profiles set friends = array_remove(friends, friend_id) where id = me;
  update public.profiles set friends = array_remove(friends, me) where id = friend_id;
  delete from public.friend_requests r
    where (r.from_id = me and r.to_id = friend_id) or (r.from_id = friend_id and r.to_id = me);
end;
$$;

-- ────────────────────────────────────────────────────────────
-- Invites: when you text a contact an invite, the app records
-- their phone number. When someone signs up with that number,
-- each inviter's friend request is waiting for them to accept.
-- Phone numbers use the app's normalized "+1XXXXXXXXXX" form.
-- ────────────────────────────────────────────────────────────
create table if not exists public.invites (
  inviter_id  uuid        not null references public.profiles(id) on delete cascade,
  phone       text        not null,
  created_at  timestamptz not null default now(),
  primary key (inviter_id, phone)
);

alter table public.invites enable row level security;

drop policy if exists "invites: owner insert" on public.invites;
create policy "invites: owner insert"
  on public.invites for insert with check (auth.uid() = inviter_id);

drop policy if exists "invites: owner read" on public.invites;
create policy "invites: owner read"
  on public.invites for select using (auth.uid() = inviter_id);

create or replace function public.befriend_inviters()
returns trigger language plpgsql security definer as $$
begin
  if new.phone is null or new.phone = '' then
    return new;
  end if;
  insert into public.friend_requests (from_id, to_id)
    select i.inviter_id, new.id from public.invites i
    where i.phone = new.phone and i.inviter_id <> new.id
    on conflict do nothing;
  delete from public.invites where phone = new.phone;
  return new;
end;
$$;

drop trigger if exists profiles_befriend_inviters on public.profiles;
create trigger profiles_befriend_inviters
  after insert on public.profiles
  for each row execute procedure public.befriend_inviters();

-- One-time cleanup: one-sided friendships become pending requests;
-- friends lists keep only mutual (and existing) people.
insert into public.friend_requests (from_id, to_id)
  select a.id, f
  from public.profiles a, unnest(a.friends) as f
  where f <> a.id
    and exists (select 1 from public.profiles b where b.id = f)
    and not exists (select 1 from public.profiles b where b.id = f and a.id = any(b.friends))
  on conflict do nothing;

update public.profiles a
set friends = coalesce(array(
  select distinct f from unnest(a.friends) as f
  where exists (select 1 from public.profiles b where b.id = f and a.id = any(b.friends))
), '{}');
