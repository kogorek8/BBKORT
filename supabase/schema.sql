-- =====================================================================
--  BBKORT v2 – schemat bazy danych dla Supabase (PostgreSQL)
--  Uruchom CAŁY plik w: Supabase → SQL Editor → New query → Run.
--
--  Zasady gry są egzekwowane PO STRONIE SERWERA (funkcje RPC poniżej).
--  Stałe są też w app/js/rules.js – trzymaj je w zgodzie.
--
--    sporty ..................................... koszykówka, piłka nożna
--    promień check-in / przejęcia ............... 150 m
--    przyjęcie wyzwania przez "króla" ........... 48 h (lub do startu meczu)
--    ochrona boiska po przejęciu / obronie ...... 24 h
--    check-in otwarty ........................... 30 min przed – 30 min po starcie
--    mecz bez wyniku wygasa ..................... 48 h po starcie
--
--  WYNIK MECZU: wpisuje i zatwierdza SĘDZIA (moderator) lub ADMIN – obecny
--  na meczu albo na podstawie nagrania. Kapitanowie obu drużyn mogą zgłosić
--  wynik (z linkiem do nagrania), ale zawsze wymaga on zatwierdzenia.
--
--  Po założeniu konta admina:
--    update public.profiles set is_admin = true where nick = 'TWÓJ_NICK';
--  Moderatorów nadaje admin w aplikacji (Panel → Moderatorzy).
--
--  Jeśli wcześniej uruchomiłeś wersję 1, najpierw wyczyść stare tabele:
--    drop table if exists public.court_history, public.challenge_players,
--      public.challenges, public.courts, public.profiles, public.teams cascade;
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- TABELE ----------------------------------------------------

create table if not exists public.teams (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique check (char_length(name) between 3 and 40),
  tag         text not null unique check (char_length(tag) between 2 and 4),
  color       text not null default '#ff7a1a',
  sport       text not null default 'basketball' check (sport in ('basketball','football')),
  captain_id  uuid,
  rating      numeric,                       -- zarezerwowane: wzór ustalimy później
  created_at  timestamptz not null default now()
);

create table if not exists public.profiles (
  id                    uuid primary key references auth.users(id) on delete cascade,
  nick                  text not null check (char_length(nick) between 2 and 24),
  team_id               uuid references public.teams(id) on delete set null,
  sport                 text not null default 'basketball' check (sport in ('basketball','football')),
  position              text check (char_length(position) <= 4),
  number                int  check (number between 0 and 99),
  height_cm             int  check (height_cm between 120 and 240),
  is_admin              boolean not null default false,
  is_moderator          boolean not null default false,
  skills                jsonb not null default '{}'::jsonb,  -- {"basketball":{...},"football":{...}} zatwierdzone
  skills_pending        jsonb,                                -- wartości czekające na akceptację
  skills_pending_sport  text,
  skills_video          text,
  skills_status         text not null default 'none'
                        check (skills_status in ('none','pending','approved','rejected')),
  skills_note           text,
  skills_submitted_at   timestamptz,
  ghost_count           int not null default 0,              -- ile razy był "duchem"
  created_at            timestamptz not null default now()
);

do $$ begin
  alter table public.teams
    add constraint teams_captain_fk foreign key (captain_id)
    references public.profiles(id) on delete set null;
exception when duplicate_object then null; end $$;

create table if not exists public.courts (
  id               uuid primary key default gen_random_uuid(),
  external_id      text unique,              -- osm:way/123:basketball | g:PlaceId:football
  name             text not null default '',
  sport            text not null default 'basketball' check (sport in ('basketball','football')),
  lat              float8 not null,
  lng              float8 not null,
  address          text not null default '',
  source           text not null default 'manual',
  king_team_id     uuid references public.teams(id) on delete set null,
  king_since       timestamptz,
  protected_until  timestamptz,
  defenses         int not null default 0,
  created_at       timestamptz not null default now()
);
create index if not exists courts_latlng on public.courts (lat, lng);

create table if not exists public.challenges (
  id                  uuid primary key default gen_random_uuid(),
  court_id            uuid not null references public.courts(id) on delete cascade,
  challenger_team_id  uuid not null references public.teams(id) on delete cascade,
  defender_team_id    uuid not null references public.teams(id) on delete cascade,
  scheduled_at        timestamptz not null,
  status              text not null default 'pending' check (status in
                      ('pending','accepted','reported','confirmed','walkover','expired','cancelled','void')),
  accept_deadline     timestamptz not null,
  referee_id          uuid references public.profiles(id) on delete set null,  -- sędzia / moderator
  challenger_report   jsonb,   -- zgłoszenie kapitana: {"a":21,"b":18,"video":"...","walkover":false,"at":"..."}
  defender_report     jsonb,
  score_challenger    int,     -- wynik ostateczny (zatwierdzony)
  score_defender      int,
  video_url           text,
  winner_team_id      uuid,
  note                text,
  resolved_by         uuid references public.profiles(id) on delete set null,
  resolved_at         timestamptz,
  created_at          timestamptz not null default now()
);

create table if not exists public.challenge_players (
  challenge_id   uuid not null references public.challenges(id) on delete cascade,
  player_id      uuid not null references public.profiles(id) on delete cascade,
  team_id        uuid not null,
  checked_in_at  timestamptz,
  primary key (challenge_id, player_id)
);

create table if not exists public.court_history (
  id            bigint generated always as identity primary key,
  court_id      uuid not null references public.courts(id) on delete cascade,
  team_id       uuid references public.teams(id) on delete set null,
  event         text not null,               -- claim | capture | defend | reset
  challenge_id  uuid,
  at            timestamptz not null default now()
);

-- ---------- BEZPIECZEŃSTWO (RLS) -------------------------------------
-- Każdy może czytać. Nikt nie pisze bezpośrednio – tylko przez funkcje RPC.

alter table public.teams             enable row level security;
alter table public.profiles          enable row level security;
alter table public.courts            enable row level security;
alter table public.challenges        enable row level security;
alter table public.challenge_players enable row level security;
alter table public.court_history     enable row level security;

do $$ declare t text; begin
  foreach t in array array['teams','profiles','courts','challenges','challenge_players','court_history'] loop
    execute format('drop policy if exists read_all on public.%I', t);
    execute format('create policy read_all on public.%I for select using (true)', t);
  end loop;
end $$;

-- Realtime (odświeżanie na żywo u wszystkich graczy)
do $$ declare t text; begin
  foreach t in array array['teams','profiles','courts','challenges','challenge_players','court_history'] loop
    begin execute format('alter publication supabase_realtime add table public.%I', t);
    exception when others then null; end;
  end loop;
end $$;

-- Profil tworzony automatycznie przy rejestracji
create or replace function public.bb_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare n text;
begin
  n := left(trim(coalesce(nullif(new.raw_user_meta_data->>'nick',''), split_part(new.email,'@',1), '')), 24);
  if char_length(n) < 2 then n := 'gracz_' || left(new.id::text, 6); end if;
  insert into public.profiles (id, nick) values (new.id, n);
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.bb_new_user();

-- ---------- FUNKCJE POMOCNICZE ---------------------------------------

create or replace function public.bb_dist_m(lat1 float8, lng1 float8, lat2 float8, lng2 float8)
returns float8 language sql immutable as $$
  select 2 * 6371000 * asin(sqrt(
      power(sin(radians(lat2 - lat1) / 2), 2) +
      cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)))
$$;

create or replace function public.bb_me() returns public.profiles
language plpgsql security definer set search_path = public as $$
declare p public.profiles;
begin
  select * into p from public.profiles where id = auth.uid();
  if p.id is null then raise exception 'err_auth'; end if;
  return p;
end $$;

create or replace function public.bb_require_admin() returns public.profiles
language plpgsql security definer set search_path = public as $$
declare p public.profiles;
begin
  p := public.bb_me();
  if not p.is_admin then raise exception 'err_not_admin'; end if;
  return p;
end $$;

-- sędzia = moderator albo admin
create or replace function public.bb_require_staff() returns public.profiles
language plpgsql security definer set search_path = public as $$
declare p public.profiles;
begin
  p := public.bb_me();
  if not (p.is_admin or p.is_moderator) then raise exception 'err_not_staff'; end if;
  return p;
end $$;

create or replace function public.bb_is_captain(p_player uuid, p_team uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.teams where id = p_team and captain_id = p_player)
$$;

create or replace function public.bb_check_dist(p_court public.courts, p_lat float8, p_lng float8) returns void
language plpgsql as $$
begin
  if p_lat is null or p_lng is null then raise exception 'err_no_gps'; end if;
  if public.bb_dist_m(p_lat, p_lng, p_court.lat, p_court.lng) > 150 then
    raise exception 'err_too_far';
  end if;
end $$;

-- Zamyka wyzwanie i rozlicza boisko
create or replace function public.bb_finalize(p_id uuid, p_winner uuid, p_status text, p_note text, p_by uuid)
returns void language plpgsql security definer set search_path = public as $$
declare c public.challenges;
begin
  select * into c from public.challenges where id = p_id for update;
  if c.status not in ('pending','accepted','reported') then return; end if;

  update public.challenges
     set status = p_status, winner_team_id = p_winner,
         note = coalesce(p_note, note), resolved_at = now(), resolved_by = p_by
   where id = p_id;

  -- DUCHY: zapisani na mecz, którzy nie zameldowali się na boisku
  if c.status in ('accepted','reported') and p_status <> 'void' then
    update public.profiles set ghost_count = ghost_count + 1
     where id in (select player_id from public.challenge_players
                   where challenge_id = p_id and checked_in_at is null);
  end if;

  if p_winner is null then return; end if;

  if p_winner = c.challenger_team_id then
    update public.courts
       set king_team_id = p_winner, king_since = now(), defenses = 0,
           protected_until = now() + interval '24 hours'
     where id = c.court_id;
    insert into public.court_history (court_id, team_id, event, challenge_id)
    values (c.court_id, p_winner, 'capture', p_id);
  else
    update public.courts
       set defenses = defenses + 1, protected_until = now() + interval '24 hours'
     where id = c.court_id;
    insert into public.court_history (court_id, team_id, event, challenge_id)
    values (c.court_id, p_winner, 'defend', p_id);
  end if;
end $$;

-- ---------- RPC: PROFIL I SKILLE -------------------------------------

create or replace function public.update_profile(p_nick text, p_position text, p_number int, p_height int, p_sport text)
returns void language plpgsql security definer set search_path = public as $$
declare me public.profiles;
begin
  me := public.bb_me();
  update public.profiles
     set nick = coalesce(nullif(trim(p_nick),''), nick),
         position = nullif(p_position,''), number = p_number, height_cm = p_height,
         -- sport zmienia się tylko wolnemu zawodnikowi (w drużynie = sport drużyny)
         sport = case when team_id is null and p_sport in ('basketball','football') then p_sport else sport end
   where id = me.id;
end $$;

create or replace function public.submit_skills(p_sport text, p_skills jsonb, p_video text)
returns void language plpgsql security definer set search_path = public as $$
declare me public.profiles; r record; n int := 0;
begin
  me := public.bb_me();
  if p_sport not in ('basketball','football') then raise exception 'err_bad_request'; end if;
  if jsonb_typeof(p_skills) <> 'object' then raise exception 'err_bad_skills'; end if;
  for r in select * from jsonb_each(p_skills) loop
    n := n + 1;
    if jsonb_typeof(r.value) <> 'number' or (r.value)::int not between 25 and 99 then
      raise exception 'err_bad_skills';
    end if;
  end loop;
  if n = 0 or n > 40 then raise exception 'err_bad_skills'; end if;
  update public.profiles
     set skills_pending = p_skills, skills_pending_sport = p_sport,
         skills_video = nullif(trim(coalesce(p_video,'')),''),
         skills_status = 'pending', skills_note = null, skills_submitted_at = now()
   where id = me.id;
end $$;

-- Akceptacja skilli – admin lub moderator
create or replace function public.review_skills(p_player uuid, p_approve boolean, p_note text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.bb_require_staff();
  if p_approve then
    update public.profiles
       set skills = coalesce(skills, '{}'::jsonb) || jsonb_build_object(skills_pending_sport, skills_pending),
           skills_pending = null, skills_pending_sport = null,
           skills_status = 'approved', skills_note = nullif(p_note,'')
     where id = p_player and skills_status = 'pending';
  else
    update public.profiles
       set skills_pending = null, skills_pending_sport = null,
           skills_status = 'rejected', skills_note = nullif(p_note,'')
     where id = p_player and skills_status = 'pending';
  end if;
end $$;

-- ---------- RPC: DRUŻYNY ----------------------------------------------

create or replace function public.create_team(p_name text, p_tag text, p_color text, p_sport text)
returns uuid language plpgsql security definer set search_path = public as $$
declare me public.profiles; nid uuid;
begin
  me := public.bb_me();
  if me.team_id is not null then raise exception 'err_already_in_team'; end if;
  if p_sport not in ('basketball','football') then raise exception 'err_bad_request'; end if;
  if exists (select 1 from public.teams where lower(name) = lower(trim(p_name))
                                           or upper(tag) = upper(trim(p_tag))) then
    raise exception 'err_team_exists';
  end if;
  insert into public.teams (name, tag, color, sport, captain_id)
  values (trim(p_name), upper(trim(p_tag)), coalesce(p_color,'#ff7a1a'), p_sport, me.id)
  returning id into nid;
  update public.profiles set team_id = nid, sport = p_sport where id = me.id;
  return nid;
end $$;

create or replace function public.join_team(p_team uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me public.profiles; tm public.teams;
begin
  me := public.bb_me();
  if me.team_id is not null then raise exception 'err_already_in_team'; end if;
  select * into tm from public.teams where id = p_team;
  if tm.id is null then raise exception 'err_not_found'; end if;
  update public.profiles set team_id = p_team, sport = tm.sport where id = me.id;
end $$;

create or replace function public.leave_team()
returns void language plpgsql security definer set search_path = public as $$
declare me public.profiles; nxt uuid;
begin
  me := public.bb_me();
  if me.team_id is null then return; end if;
  update public.profiles set team_id = null where id = me.id;
  if public.bb_is_captain(me.id, me.team_id) then
    select id into nxt from public.profiles where team_id = me.team_id order by created_at limit 1;
    if nxt is null then
      delete from public.teams where id = me.team_id;   -- boiska stają się wolne
    else
      update public.teams set captain_id = nxt where id = me.team_id;
    end if;
  end if;
end $$;

create or replace function public.kick_member(p_player uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me public.profiles;
begin
  me := public.bb_me();
  if me.team_id is null or not public.bb_is_captain(me.id, me.team_id) then raise exception 'err_not_captain'; end if;
  if p_player = me.id then raise exception 'err_bad_request'; end if;
  update public.profiles set team_id = null where id = p_player and team_id = me.team_id;
end $$;

-- ---------- RPC: BOISKA -----------------------------------------------

-- Dodaje boiska znalezione automatycznie (OpenStreetMap / Google).
-- Pomija duplikaty: ten sam external_id albo boisko tego samego sportu w promieniu ~40 m.
create or replace function public.import_courts(p_courts jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare r jsonb; n int := 0; la float8; ln float8; sp text;
begin
  perform public.bb_me();
  if jsonb_typeof(p_courts) <> 'array' or jsonb_array_length(p_courts) > 300 then
    raise exception 'err_bad_request';
  end if;
  for r in select * from jsonb_array_elements(p_courts) loop
    la := (r->>'lat')::float8; ln := (r->>'lng')::float8; sp := coalesce(r->>'sport','basketball');
    continue when la is null or ln is null or sp not in ('basketball','football');
    continue when exists (select 1 from public.courts where external_id = r->>'external_id');
    continue when exists (select 1 from public.courts
                           where sport = sp and abs(lat - la) < 0.0006 and abs(lng - ln) < 0.0009
                             and public.bb_dist_m(lat, lng, la, ln) < 40);
    insert into public.courts (external_id, name, sport, lat, lng, address, source)
    values (r->>'external_id', left(coalesce(r->>'name',''), 80), sp, la, ln,
            left(coalesce(r->>'address',''), 120), coalesce(r->>'source','manual'));
    n := n + 1;
  end loop;
  return n;
end $$;

-- Przejęcie WOLNEGO boiska (trzeba fizycznie być na miejscu)
create or replace function public.claim_court(p_court uuid, p_lat float8, p_lng float8)
returns void language plpgsql security definer set search_path = public as $$
declare me public.profiles; ct public.courts; tm public.teams;
begin
  me := public.bb_me();
  if me.team_id is null then raise exception 'err_no_team'; end if;
  select * into tm from public.teams where id = me.team_id;
  select * into ct from public.courts where id = p_court for update;
  if ct.id is null then raise exception 'err_not_found'; end if;
  if ct.sport <> tm.sport then raise exception 'err_wrong_sport'; end if;
  if ct.king_team_id is not null then raise exception 'err_court_taken'; end if;
  perform public.bb_check_dist(ct, p_lat, p_lng);
  update public.courts
     set king_team_id = me.team_id, king_since = now(), defenses = 0,
         protected_until = now() + interval '24 hours'
   where id = p_court;
  insert into public.court_history (court_id, team_id, event) values (p_court, me.team_id, 'claim');
end $$;

-- ---------- RPC: WYZWANIA ---------------------------------------------

create or replace function public.create_challenge(p_court uuid, p_time timestamptz)
returns uuid language plpgsql security definer set search_path = public as $$
declare me public.profiles; ct public.courts; tm public.teams; nid uuid;
begin
  me := public.bb_me();
  if me.team_id is null then raise exception 'err_no_team'; end if;
  if not public.bb_is_captain(me.id, me.team_id) then raise exception 'err_not_captain'; end if;
  select * into tm from public.teams where id = me.team_id;
  select * into ct from public.courts where id = p_court for update;
  if ct.id is null then raise exception 'err_not_found'; end if;
  if ct.sport <> tm.sport then raise exception 'err_wrong_sport'; end if;
  if ct.king_team_id is null then raise exception 'err_court_free'; end if;
  if ct.king_team_id = me.team_id then raise exception 'err_own_court'; end if;
  if ct.protected_until is not null and ct.protected_until > now() then raise exception 'err_protected'; end if;
  if exists (select 1 from public.challenges where court_id = p_court
              and status in ('pending','accepted','reported')) then
    raise exception 'err_court_busy';
  end if;
  if p_time < now() + interval '60 minutes' or p_time > now() + interval '7 days' then
    raise exception 'err_bad_time';
  end if;
  insert into public.challenges (court_id, challenger_team_id, defender_team_id, scheduled_at, accept_deadline)
  values (p_court, me.team_id, ct.king_team_id, p_time, least(now() + interval '48 hours', p_time))
  returning id into nid;
  insert into public.challenge_players (challenge_id, player_id, team_id) values (nid, me.id, me.team_id);
  return nid;
end $$;

create or replace function public.cancel_challenge(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me public.profiles; c public.challenges;
begin
  me := public.bb_me();
  select * into c from public.challenges where id = p_id for update;
  if c.id is null then raise exception 'err_not_found'; end if;
  if c.status <> 'pending' then raise exception 'err_bad_state'; end if;
  if not public.bb_is_captain(me.id, c.challenger_team_id) then raise exception 'err_not_captain'; end if;
  update public.challenges set status = 'cancelled', resolved_at = now() where id = p_id;
end $$;

create or replace function public.accept_challenge(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me public.profiles; c public.challenges;
begin
  me := public.bb_me();
  select * into c from public.challenges where id = p_id for update;
  if c.id is null then raise exception 'err_not_found'; end if;
  if c.status <> 'pending' then raise exception 'err_bad_state'; end if;
  if not public.bb_is_captain(me.id, c.defender_team_id) then raise exception 'err_not_captain'; end if;
  update public.challenges set status = 'accepted' where id = p_id;
  insert into public.challenge_players (challenge_id, player_id, team_id)
  values (p_id, me.id, c.defender_team_id) on conflict do nothing;
end $$;

-- "Król" oddaje boisko bez gry
create or replace function public.forfeit_challenge(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me public.profiles; c public.challenges;
begin
  me := public.bb_me();
  select * into c from public.challenges where id = p_id;
  if c.id is null then raise exception 'err_not_found'; end if;
  if c.status not in ('pending','accepted') then raise exception 'err_bad_state'; end if;
  if not public.bb_is_captain(me.id, c.defender_team_id) then raise exception 'err_not_captain'; end if;
  update public.challenges set status = 'pending' where id = p_id;   -- bez duchów przy poddaniu
  perform public.bb_finalize(p_id, c.challenger_team_id, 'walkover', 'forfeit', me.id);
end $$;

create or replace function public.join_match(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me public.profiles; c public.challenges;
begin
  me := public.bb_me();
  select * into c from public.challenges where id = p_id;
  if c.id is null then raise exception 'err_not_found'; end if;
  if c.status not in ('pending','accepted') then raise exception 'err_bad_state'; end if;
  if me.team_id is null or me.team_id not in (c.challenger_team_id, c.defender_team_id) then
    raise exception 'err_not_in_match';
  end if;
  insert into public.challenge_players (challenge_id, player_id, team_id)
  values (p_id, me.id, me.team_id) on conflict do nothing;
end $$;

create or replace function public.leave_match(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me public.profiles; c public.challenges;
begin
  me := public.bb_me();
  select * into c from public.challenges where id = p_id;
  if c.status not in ('pending','accepted') then raise exception 'err_bad_state'; end if;
  if now() > c.scheduled_at - interval '30 minutes' then raise exception 'err_too_late'; end if;
  delete from public.challenge_players
   where challenge_id = p_id and player_id = me.id and checked_in_at is null;
end $$;

create or replace function public.check_in(p_id uuid, p_lat float8, p_lng float8)
returns void language plpgsql security definer set search_path = public as $$
declare me public.profiles; c public.challenges; ct public.courts;
begin
  me := public.bb_me();
  select * into c from public.challenges where id = p_id;
  if c.id is null then raise exception 'err_not_found'; end if;
  if c.status <> 'accepted' then raise exception 'err_bad_state'; end if;
  if me.team_id is null or me.team_id not in (c.challenger_team_id, c.defender_team_id) then
    raise exception 'err_not_in_match';
  end if;
  if now() < c.scheduled_at - interval '30 minutes' then raise exception 'err_too_early'; end if;
  if now() > c.scheduled_at + interval '30 minutes' then raise exception 'err_too_late'; end if;
  select * into ct from public.courts where id = c.court_id;
  perform public.bb_check_dist(ct, p_lat, p_lng);
  insert into public.challenge_players (challenge_id, player_id, team_id, checked_in_at)
  values (p_id, me.id, me.team_id, now())
  on conflict (challenge_id, player_id) do update set checked_in_at = coalesce(public.challenge_players.checked_in_at, now());
end $$;

-- Sędzia (moderator/admin) bierze mecz – będzie na miejscu albo obejrzy nagranie
create or replace function public.take_referee(p_id uuid, p_take boolean)
returns void language plpgsql security definer set search_path = public as $$
declare me public.profiles; c public.challenges;
begin
  me := public.bb_require_staff();
  select * into c from public.challenges where id = p_id for update;
  if c.id is null then raise exception 'err_not_found'; end if;
  if c.status not in ('pending','accepted','reported') then raise exception 'err_bad_state'; end if;
  if p_take then
    update public.challenges set referee_id = me.id where id = p_id;
  else
    update public.challenges set referee_id = null where id = p_id and referee_id = me.id;
  end if;
end $$;

-- Kapitan zgłasza wynik (albo walkower) – ZAWSZE do zatwierdzenia przez sędziego/admina
create or replace function public.report_result(p_id uuid, p_score_challenger int, p_score_defender int, p_video text, p_walkover boolean)
returns void language plpgsql security definer set search_path = public as $$
declare me public.profiles; c public.challenges; rep jsonb; mine uuid; other uuid; a int; b int;
begin
  me := public.bb_me();
  select * into c from public.challenges where id = p_id for update;
  if c.id is null then raise exception 'err_not_found'; end if;
  if c.status not in ('accepted','reported') then raise exception 'err_bad_state'; end if;
  if public.bb_is_captain(me.id, c.challenger_team_id) then mine := c.challenger_team_id; other := c.defender_team_id;
  elsif public.bb_is_captain(me.id, c.defender_team_id) then mine := c.defender_team_id; other := c.challenger_team_id;
  else raise exception 'err_not_captain'; end if;
  if now() < c.scheduled_at - interval '30 minutes' then raise exception 'err_too_early'; end if;

  if coalesce(p_walkover, false) then
    -- walkower: 30 min po starcie, my na miejscu, rywala brak
    if now() < c.scheduled_at + interval '30 minutes' then raise exception 'err_too_early'; end if;
    select count(*) filter (where team_id = mine  and checked_in_at is not null),
           count(*) filter (where team_id = other and checked_in_at is not null)
      into a, b from public.challenge_players where challenge_id = p_id;
    if a = 0 then raise exception 'err_need_checkins'; end if;
    if b > 0 then raise exception 'err_opponent_present'; end if;
    rep := jsonb_build_object('walkover', true, 'video', nullif(trim(coalesce(p_video,'')),''), 'at', now());
  else
    if p_score_challenger is null or p_score_defender is null
       or p_score_challenger < 0 or p_score_defender < 0
       or p_score_challenger = p_score_defender then
      raise exception 'err_bad_score';
    end if;
    rep := jsonb_build_object('a', p_score_challenger, 'b', p_score_defender, 'walkover', false,
                              'video', nullif(trim(coalesce(p_video,'')),''), 'at', now());
  end if;

  if mine = c.challenger_team_id then
    update public.challenges set challenger_report = rep, status = 'reported' where id = p_id;
  else
    update public.challenges set defender_report = rep, status = 'reported' where id = p_id;
  end if;
end $$;

-- Sędzia / admin zatwierdza wynik ostateczny.
--  p_winner = null → mecz unieważniony; wynik bez punktów → walkower.
create or replace function public.referee_result(p_id uuid, p_winner uuid, p_score_challenger int, p_score_defender int, p_video text, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare me public.profiles; c public.challenges; st text;
begin
  me := public.bb_require_staff();
  select * into c from public.challenges where id = p_id for update;
  if c.id is null then raise exception 'err_not_found'; end if;
  if c.status not in ('accepted','reported') then raise exception 'err_bad_state'; end if;
  if p_winner is not null and p_winner not in (c.challenger_team_id, c.defender_team_id) then
    raise exception 'err_bad_request';
  end if;
  if p_winner is not null and p_score_challenger is not null then
    if p_score_defender is null or p_score_challenger < 0 or p_score_defender < 0
       or p_score_challenger = p_score_defender
       or (p_score_challenger > p_score_defender) <> (p_winner = c.challenger_team_id) then
      raise exception 'err_bad_score';
    end if;
  end if;
  st := case when p_winner is null then 'void'
             when p_score_challenger is null then 'walkover'
             else 'confirmed' end;
  update public.challenges
     set referee_id = coalesce(referee_id, me.id),
         score_challenger = case when st = 'confirmed' then p_score_challenger end,
         score_defender   = case when st = 'confirmed' then p_score_defender end,
         video_url = coalesce(nullif(trim(coalesce(p_video,'')),''), video_url)
   where id = p_id;
  perform public.bb_finalize(p_id, p_winner, st, coalesce(nullif(p_note,''), case when st = 'walkover' then 'no_show' end), me.id);
end $$;

-- Rozlicza przeterminowane wyzwania (wywoływane przez aplikację; opcjonalnie pg_cron)
create or replace function public.resolve_expired()
returns int language plpgsql security definer set search_path = public as $$
declare c record; n int := 0;
begin
  -- 1) "Król" nie odpowiedział w 48 h → walkower dla wyzywających + duch dla kapitana
  for c in select * from public.challenges where status = 'pending' and accept_deadline < now() loop
    update public.profiles set ghost_count = ghost_count + 1
     where id = (select captain_id from public.teams where id = c.defender_team_id);
    perform public.bb_finalize(c.id, c.challenger_team_id, 'walkover', 'no_response', null);
    n := n + 1;
  end loop;
  -- 2) Mecz bez żadnego zgłoszenia wyniku 48 h po starcie → wygasa
  --    (zgłoszone wyniki 'reported' czekają na sędziego – nie wygasają same)
  for c in select * from public.challenges
            where status = 'accepted' and scheduled_at + interval '48 hours' < now() loop
    perform public.bb_finalize(c.id, null, 'expired', 'no_report', null);
    n := n + 1;
  end loop;
  return n;
end $$;

-- ---------- RPC: ADMIN ------------------------------------------------

create or replace function public.admin_set_moderator(p_player uuid, p_on boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.bb_require_admin();
  update public.profiles set is_moderator = p_on where id = p_player;
end $$;

create or replace function public.admin_reset_court(p_court uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.bb_require_admin();
  update public.challenges set status = 'cancelled', note = 'admin', resolved_at = now()
   where court_id = p_court and status in ('pending','accepted','reported');
  update public.courts set king_team_id = null, king_since = null, protected_until = null, defenses = 0
   where id = p_court;
  insert into public.court_history (court_id, team_id, event) values (p_court, null, 'reset');
end $$;

create or replace function public.admin_delete_court(p_court uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.bb_require_admin();
  delete from public.courts where id = p_court;
end $$;

-- ---------- OCENY BOISK ------------------------------------------------

create table if not exists public.court_ratings (
  court_id    uuid not null references public.courts(id) on delete cascade,
  player_id   uuid not null references public.profiles(id) on delete cascade,
  scores      jsonb not null,            -- {"surface":4,"hoops":5,...}
  comment     text check (char_length(comment) <= 280),
  created_at  timestamptz not null default now(),
  primary key (court_id, player_id)
);

alter table public.court_ratings enable row level security;
drop policy if exists read_all on public.court_ratings;
create policy read_all on public.court_ratings for select using (true);
do $$ begin
  alter publication supabase_realtime add table public.court_ratings;
exception when others then null; end $$;

-- Ocena boiska przez zalogowanego gracza (jedna ocena na gracza, można ją zmienić)
create or replace function public.rate_court(p_court uuid, p_scores jsonb, p_comment text)
returns void language plpgsql security definer set search_path = public as $$
declare me public.profiles; r record; n int := 0;
begin
  me := public.bb_me();
  if not exists (select 1 from public.courts where id = p_court) then raise exception 'err_not_found'; end if;
  if jsonb_typeof(p_scores) <> 'object' then raise exception 'err_bad_request'; end if;
  for r in select * from jsonb_each(p_scores) loop
    n := n + 1;
    if jsonb_typeof(r.value) <> 'number' or (r.value)::int not between 1 and 5 then
      raise exception 'err_bad_rating';
    end if;
  end loop;
  if n = 0 or n > 12 then raise exception 'err_bad_rating'; end if;
  insert into public.court_ratings (court_id, player_id, scores, comment)
  values (p_court, me.id, p_scores, nullif(left(trim(coalesce(p_comment,'')), 280), ''))
  on conflict (court_id, player_id)
  do update set scores = excluded.scores, comment = excluded.comment, created_at = now();
end $$;

-- Admin może usunąć ocenę (np. spam)
create or replace function public.admin_delete_rating(p_court uuid, p_player uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.bb_require_admin();
  delete from public.court_ratings where court_id = p_court and player_id = p_player;
end $$;


-- ---------- MIGRACJA 3: OG SPOT, gry, prośby, usterki -----------------

-- ---------- BOISKA: zgłoszenia graczy + zdjęcie -----------------------
alter table public.courts add column if not exists status text not null default 'active';
alter table public.courts add column if not exists added_by uuid references public.profiles(id) on delete set null;
alter table public.courts add column if not exists photo_url text;
do $$ begin
  alter table public.courts add constraint courts_status_chk check (status in ('active','pending'));
exception when duplicate_object then null; end $$;

-- ---------- OFICJALNA KARTA BOISKA (OG SPOT) --------------------------
-- Jedna aktualna karta na boisko. Punktacja 100 pkt w 8 obszarach:
--   surface 25, hoop 20, space 15, lines 10, access 10, surroundings 5, regular 5, players 10
-- Znak OG SPOT: suma >= 75, brak zagrożeń oraz min. 3/5 (60%) osobno za
-- nawierzchnię, kosz i przestrzeń. Ważność 12 miesięcy od wizyty.
create table if not exists public.court_reviews (
  court_id     uuid primary key references public.courts(id) on delete cascade,
  reviewer_id  uuid references public.profiles(id) on delete set null,
  visited_at   date not null default current_date,
  valid_until  date not null,
  scores       jsonb not null,
  total        int not null,
  hazard       boolean not null default false,
  og_spot      boolean not null default false,
  og_number    int,
  summary      text,
  pros         jsonb not null default '[]'::jsonb,
  cons         jsonb not null default '[]'::jsonb,
  suggestions  jsonb not null default '[]'::jsonb,   -- [{"text":"...","kind":"urgent|cheap|invest"}]
  photos       jsonb not null default '[]'::jsonb,   -- ["https://...", ...]
  video_url    text,
  updated_at   timestamptz not null default now()
);
create sequence if not exists public.og_spot_number_seq;

-- ---------- DRUŻYNY: prośby i zaproszenia (zgoda obu stron) -----------
create table if not exists public.team_requests (
  team_id     uuid not null references public.teams(id) on delete cascade,
  player_id   uuid not null references public.profiles(id) on delete cascade,
  kind        text not null check (kind in ('request','invite')),   -- request = gracz prosi; invite = kapitan zaprasza
  created_at  timestamptz not null default now(),
  primary key (team_id, player_id)
);

-- ---------- OTWARTE GRY ("Gramy?") -------------------------------------
create table if not exists public.games (
  id          uuid primary key default gen_random_uuid(),
  court_id    uuid not null references public.courts(id) on delete cascade,
  host_id     uuid not null references public.profiles(id) on delete cascade,
  sport       text not null,
  starts_at   timestamptz not null,
  slots       int not null check (slots between 2 and 40),
  level       text not null default 'all' check (level in ('all','beginner','mid','pro')),
  note        text check (char_length(note) <= 200),
  status      text not null default 'open' check (status in ('open','cancelled')),
  created_at  timestamptz not null default now()
);
create table if not exists public.game_players (
  game_id    uuid not null references public.games(id) on delete cascade,
  player_id  uuid not null references public.profiles(id) on delete cascade,
  joined_at  timestamptz not null default now(),
  primary key (game_id, player_id)
);

-- ---------- ZGŁOSZENIA USTEREK ------------------------------------------
create table if not exists public.court_issues (
  id          bigint generated always as identity primary key,
  court_id    uuid not null references public.courts(id) on delete cascade,
  player_id   uuid references public.profiles(id) on delete set null,
  text        text not null check (char_length(text) between 3 and 300),
  status      text not null default 'open' check (status in ('open','resolved')),
  created_at  timestamptz not null default now()
);

-- ---------- RLS + realtime ----------------------------------------------
do $$ declare t text; begin
  foreach t in array array['court_reviews','team_requests','games','game_players','court_issues'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists read_all on public.%I', t);
    execute format('create policy read_all on public.%I for select using (true)', t);
    begin execute format('alter publication supabase_realtime add table public.%I', t);
    exception when others then null; end;
  end loop;
end $$;

-- ---------- RPC: karta OG SPOT (admin / moderator) ----------------------
create or replace function public.save_court_review(p_court uuid, p_data jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare me public.profiles; s jsonb; tot int := 0; og boolean; num int; hz boolean; vis date;
  mx jsonb := '{"surface":25,"hoop":20,"space":15,"lines":10,"access":10,"surroundings":5,"regular":5,"players":10}'::jsonb;
  k text; v int;
begin
  me := public.bb_require_staff();
  if not exists (select 1 from public.courts where id = p_court) then raise exception 'err_not_found'; end if;
  s := p_data->'scores';
  if jsonb_typeof(s) <> 'object' then raise exception 'err_bad_review'; end if;
  for k in select jsonb_object_keys(mx) loop
    v := coalesce((s->>k)::int, -1);
    if v < 0 or v > (mx->>k)::int then raise exception 'err_bad_review'; end if;
    tot := tot + v;
  end loop;
  hz := coalesce((p_data->>'hazard')::boolean, false);
  vis := coalesce((p_data->>'visited_at')::date, current_date);
  og := tot >= 75 and not hz
        and (s->>'surface')::int >= 15 and (s->>'hoop')::int >= 12 and (s->>'space')::int >= 9;
  select og_number into num from public.court_reviews where court_id = p_court;
  if og and num is null then num := nextval('public.og_spot_number_seq'); end if;

  insert into public.court_reviews (court_id, reviewer_id, visited_at, valid_until, scores, total, hazard, og_spot,
                                    og_number, summary, pros, cons, suggestions, photos, video_url, updated_at)
  values (p_court, me.id, vis, vis + interval '12 months', s, tot, hz, og, num,
          nullif(left(trim(coalesce(p_data->>'summary','')), 1500), ''),
          coalesce(p_data->'pros','[]'::jsonb), coalesce(p_data->'cons','[]'::jsonb),
          coalesce(p_data->'suggestions','[]'::jsonb), coalesce(p_data->'photos','[]'::jsonb),
          nullif(trim(coalesce(p_data->>'video_url','')), ''), now())
  on conflict (court_id) do update set
    reviewer_id = excluded.reviewer_id, visited_at = excluded.visited_at, valid_until = excluded.valid_until,
    scores = excluded.scores, total = excluded.total, hazard = excluded.hazard, og_spot = excluded.og_spot,
    og_number = excluded.og_number, summary = excluded.summary, pros = excluded.pros, cons = excluded.cons,
    suggestions = excluded.suggestions, photos = excluded.photos, video_url = excluded.video_url, updated_at = now();

  if p_data ? 'photo_url' then
    update public.courts set photo_url = nullif(trim(coalesce(p_data->>'photo_url','')), '') where id = p_court;
  end if;
end $$;

create or replace function public.delete_court_review(p_court uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.bb_require_admin();
  delete from public.court_reviews where court_id = p_court;
end $$;

-- ---------- RPC: zgłoszenie boiska, którego nie ma na mapie -------------
create or replace function public.suggest_court(p_name text, p_sport text, p_lat float8, p_lng float8, p_address text)
returns uuid language plpgsql security definer set search_path = public as $$
declare me public.profiles; nid uuid; st text;
begin
  me := public.bb_me();
  if p_sport not in ('basketball','football') or p_lat is null or p_lng is null
     or char_length(trim(coalesce(p_name,''))) < 3 then raise exception 'err_bad_request'; end if;
  if exists (select 1 from public.courts where sport = p_sport
              and abs(lat - p_lat) < 0.0006 and abs(lng - p_lng) < 0.0009
              and public.bb_dist_m(lat, lng, p_lat, p_lng) < 40) then
    raise exception 'err_court_exists';
  end if;
  if not (me.is_admin or me.is_moderator)
     and (select count(*) from public.courts where added_by = me.id and status = 'pending') >= 5 then
    raise exception 'err_too_many_pending';
  end if;
  st := case when me.is_admin or me.is_moderator then 'active' else 'pending' end;
  insert into public.courts (name, sport, lat, lng, address, source, status, added_by)
  values (left(trim(p_name), 80), p_sport, p_lat, p_lng, left(coalesce(p_address,''), 120), 'user', st, me.id)
  returning id into nid;
  return nid;
end $$;

create or replace function public.review_court(p_court uuid, p_approve boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.bb_require_staff();
  if p_approve then
    update public.courts set status = 'active' where id = p_court and status = 'pending';
  else
    delete from public.courts where id = p_court and status = 'pending';
  end if;
end $$;

-- ---------- RPC: dołączanie do drużyny – zgoda obu stron ----------------
create or replace function public.bb_join(p_team uuid, p_player uuid) returns void
language plpgsql security definer set search_path = public as $$
declare tm public.teams;
begin
  select * into tm from public.teams where id = p_team;
  if tm.id is null then raise exception 'err_not_found'; end if;
  if exists (select 1 from public.profiles where id = p_player and team_id is not null) then
    raise exception 'err_already_in_team';
  end if;
  update public.profiles set team_id = p_team, sport = tm.sport where id = p_player;
  delete from public.team_requests where player_id = p_player;
end $$;
revoke execute on function public.bb_join(uuid, uuid) from public, anon, authenticated;

-- gracz prosi o dołączenie (jeśli kapitan już go zaprosił – dołącza od razu)
create or replace function public.request_join(p_team uuid)
returns text language plpgsql security definer set search_path = public as $$
declare me public.profiles;
begin
  me := public.bb_me();
  if me.team_id is not null then raise exception 'err_already_in_team'; end if;
  if not exists (select 1 from public.teams where id = p_team) then raise exception 'err_not_found'; end if;
  if exists (select 1 from public.team_requests where team_id = p_team and player_id = me.id and kind = 'invite') then
    perform public.bb_join(p_team, me.id);
    return 'joined';
  end if;
  insert into public.team_requests (team_id, player_id, kind) values (p_team, me.id, 'request')
  on conflict do nothing;
  return 'requested';
end $$;

-- stare "dołącz" działa teraz jak prośba
create or replace function public.join_team(p_team uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.request_join(p_team);
end $$;

-- kapitan zaprasza gracza (jeśli gracz już prosił – dołącza od razu)
create or replace function public.invite_player(p_player uuid)
returns text language plpgsql security definer set search_path = public as $$
declare me public.profiles;
begin
  me := public.bb_me();
  if me.team_id is null or not public.bb_is_captain(me.id, me.team_id) then raise exception 'err_not_captain'; end if;
  if exists (select 1 from public.profiles where id = p_player and team_id is not null) then
    raise exception 'err_player_in_team';
  end if;
  if not exists (select 1 from public.profiles where id = p_player) then raise exception 'err_not_found'; end if;
  if exists (select 1 from public.team_requests where team_id = me.team_id and player_id = p_player and kind = 'request') then
    perform public.bb_join(me.team_id, p_player);
    return 'joined';
  end if;
  insert into public.team_requests (team_id, player_id, kind) values (me.team_id, p_player, 'invite')
  on conflict do nothing;
  return 'invited';
end $$;

-- odpowiedź drugiej strony: kapitan na prośbę, gracz na zaproszenie; autor może też wycofać
create or replace function public.respond_team_request(p_team uuid, p_player uuid, p_accept boolean)
returns void language plpgsql security definer set search_path = public as $$
declare me public.profiles; r public.team_requests; cap boolean;
begin
  me := public.bb_me();
  select * into r from public.team_requests where team_id = p_team and player_id = p_player;
  if r.team_id is null then raise exception 'err_not_found'; end if;
  cap := public.bb_is_captain(me.id, p_team);
  if not (cap or me.id = p_player) then raise exception 'err_not_allowed'; end if;
  if p_accept then
    if (r.kind = 'request' and not cap) or (r.kind = 'invite' and me.id <> p_player) then
      raise exception 'err_not_allowed';
    end if;
    perform public.bb_join(p_team, p_player);
  else
    delete from public.team_requests where team_id = p_team and player_id = p_player;
  end if;
end $$;

-- ---------- RPC: otwarte gry --------------------------------------------
create or replace function public.create_game(p_court uuid, p_time timestamptz, p_slots int, p_level text, p_note text)
returns uuid language plpgsql security definer set search_path = public as $$
declare me public.profiles; ct public.courts; nid uuid;
begin
  me := public.bb_me();
  select * into ct from public.courts where id = p_court and status = 'active';
  if ct.id is null then raise exception 'err_not_found'; end if;
  if p_time < now() - interval '10 minutes' or p_time > now() + interval '30 days' then raise exception 'err_bad_time_game'; end if;
  if p_slots is null or p_slots < 2 or p_slots > 40 then raise exception 'err_bad_request'; end if;
  if (select count(*) from public.games where host_id = me.id and status = 'open' and starts_at > now()) >= 5 then
    raise exception 'err_too_many_games';
  end if;
  insert into public.games (court_id, host_id, sport, starts_at, slots, level, note)
  values (p_court, me.id, ct.sport, p_time, p_slots, coalesce(nullif(p_level,''),'all'),
          nullif(left(trim(coalesce(p_note,'')), 200), ''))
  returning id into nid;
  insert into public.game_players (game_id, player_id) values (nid, me.id);
  return nid;
end $$;

create or replace function public.join_game(p_game uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me public.profiles; g public.games;
begin
  me := public.bb_me();
  select * into g from public.games where id = p_game for update;
  if g.id is null or g.status <> 'open' then raise exception 'err_not_found'; end if;
  if g.starts_at < now() - interval '2 hours' then raise exception 'err_too_late'; end if;
  if exists (select 1 from public.game_players where game_id = p_game and player_id = me.id) then return; end if;
  if (select count(*) from public.game_players where game_id = p_game) >= g.slots then raise exception 'err_game_full'; end if;
  insert into public.game_players (game_id, player_id) values (p_game, me.id);
end $$;

create or replace function public.leave_game(p_game uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me public.profiles; g public.games;
begin
  me := public.bb_me();
  select * into g from public.games where id = p_game;
  if g.id is null then return; end if;
  if g.host_id = me.id or me.is_admin then
    update public.games set status = 'cancelled' where id = p_game;   -- organizator odwołuje grę
  else
    delete from public.game_players where game_id = p_game and player_id = me.id;
  end if;
end $$;

-- ---------- RPC: usterki --------------------------------------------------
create or replace function public.report_issue(p_court uuid, p_text text)
returns void language plpgsql security definer set search_path = public as $$
declare me public.profiles;
begin
  me := public.bb_me();
  if not exists (select 1 from public.courts where id = p_court) then raise exception 'err_not_found'; end if;
  if char_length(trim(coalesce(p_text,''))) < 3 then raise exception 'err_bad_request'; end if;
  if (select count(*) from public.court_issues where player_id = me.id and created_at > now() - interval '1 day') >= 10 then
    raise exception 'err_too_many_issues';
  end if;
  insert into public.court_issues (court_id, player_id, text) values (p_court, me.id, left(trim(p_text), 300));
end $$;

create or replace function public.resolve_issue(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.bb_require_staff();
  update public.court_issues set status = 'resolved' where id = p_id;
end $$;


-- ---------- MIGRACJA 4: gra (monety, sklep, dropy, obecność, statystyki) --

-- ---------- PROFIL: portfel, poziom, wygląd ---------------------------
alter table public.profiles add column if not exists coins int not null default 0;        -- OG Coins do wydania
alter table public.profiles add column if not exists xp int not null default 0;           -- suma zdobytych (poziom)
alter table public.profiles add column if not exists checkins int not null default 0;     -- ile razy meldował się na boiskach
alter table public.profiles add column if not exists frame text;                          -- założona ramka karty
alter table public.profiles add column if not exists owned jsonb not null default '[]'::jsonb;  -- kupione ramki
alter table public.profiles add column if not exists invited_by uuid;

-- ---------- OG COINS: księga -------------------------------------------
create table if not exists public.coin_ledger (
  id          bigint generated always as identity primary key,
  player_id   uuid not null references public.profiles(id) on delete cascade,
  amount      int not null,
  reason      text not null,
  key         text not null,              -- klucz unikalności: ta sama nagroda tylko raz
  created_at  timestamptz not null default now(),
  unique (player_id, key)
);
alter table public.coin_ledger enable row level security;
drop policy if exists own on public.coin_ledger;
create policy own on public.coin_ledger for select using (player_id = auth.uid());

create or replace function public.bb_coin(p_player uuid, p_amount int, p_reason text, p_key text)
returns boolean language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if p_player is null or p_amount = 0 then return false; end if;
  insert into public.coin_ledger (player_id, amount, reason, key) values (p_player, p_amount, p_reason, p_key)
  on conflict (player_id, key) do nothing;
  get diagnostics n = row_count;
  if n = 0 then return false; end if;
  update public.profiles set coins = coins + p_amount, xp = xp + greatest(p_amount, 0) where id = p_player;
  return true;
end $$;
revoke execute on function public.bb_coin(uuid, int, text, text) from public, anon, authenticated;

-- ---------- POWIADOMIENIA -----------------------------------------------
create table if not exists public.notifications (
  id          bigint generated always as identity primary key,
  player_id   uuid not null references public.profiles(id) on delete cascade,
  kind        text not null,
  data        jsonb not null default '{}'::jsonb,
  link        text,
  read        boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists notifications_player on public.notifications (player_id, created_at desc);
alter table public.notifications enable row level security;
drop policy if exists own on public.notifications;
create policy own on public.notifications for select using (player_id = auth.uid());

create or replace function public.bb_notify(p_player uuid, p_kind text, p_data jsonb, p_link text)
returns void language sql security definer set search_path = public as $$
  insert into public.notifications (player_id, kind, data, link)
  select p_player, p_kind, coalesce(p_data, '{}'::jsonb), p_link where p_player is not null
$$;
create or replace function public.bb_notify_team(p_team uuid, p_kind text, p_data jsonb, p_link text, p_except uuid)
returns void language sql security definer set search_path = public as $$
  insert into public.notifications (player_id, kind, data, link)
  select id, p_kind, coalesce(p_data, '{}'::jsonb), p_link from public.profiles
   where team_id = p_team and (p_except is null or id <> p_except)
$$;
create or replace function public.bb_notify_staff(p_kind text, p_data jsonb, p_link text)
returns void language sql security definer set search_path = public as $$
  insert into public.notifications (player_id, kind, data, link)
  select id, p_kind, coalesce(p_data, '{}'::jsonb), p_link from public.profiles where is_admin
$$;
revoke execute on function public.bb_notify(uuid, text, jsonb, text) from public, anon, authenticated;
revoke execute on function public.bb_notify_team(uuid, text, jsonb, text, uuid) from public, anon, authenticated;
revoke execute on function public.bb_notify_staff(text, jsonb, text) from public, anon, authenticated;

create or replace function public.mark_notifications_read()
returns void language sql security definer set search_path = public as $$
  update public.notifications set read = true where player_id = auth.uid() and not read
$$;

-- ---------- KTO TERAZ GRA: meldowanie na boisku -------------------------
create table if not exists public.court_presence (
  id         bigint generated always as identity primary key,
  court_id   uuid not null references public.courts(id) on delete cascade,
  player_id  uuid not null references public.profiles(id) on delete cascade,
  at         timestamptz not null default now()
);
create index if not exists court_presence_at on public.court_presence (at desc);

-- Meldunek "jestem na boisku" (widoczny 2 h). Nie przejmuje boiska i nie wyzywa –
-- ale drużyna, która panuje na boisku, dostaje powiadomienie.
create or replace function public.check_in_court(p_court uuid, p_lat float8, p_lng float8)
returns void language plpgsql security definer set search_path = public as $$
declare me public.profiles; ct public.courts; d date := (now() at time zone 'Europe/Warsaw')::date; streak int := 1;
begin
  me := public.bb_me();
  select * into ct from public.courts where id = p_court and status = 'active';
  if ct.id is null then raise exception 'err_not_found'; end if;
  perform public.bb_check_dist(ct, p_lat, p_lng);
  if exists (select 1 from public.court_presence where court_id = p_court and player_id = me.id
              and at > now() - interval '2 hours') then return; end if;
  insert into public.court_presence (court_id, player_id) values (p_court, me.id);
  update public.profiles set checkins = checkins + 1 where id = me.id;
  -- nagroda dnia + seria dni z rzędu (3 dni: +5, 7 dni: +20)
  if public.bb_coin(me.id, 5, 'daily_checkin', 'daily:checkin:' || d) then
    while exists (select 1 from public.coin_ledger where player_id = me.id and key = 'daily:checkin:' || (d - streak)) loop
      streak := streak + 1;
    end loop;
    if streak % 7 = 0 then perform public.bb_coin(me.id, 20, 'streak7', 'streak7:' || d);
    elsif streak % 7 = 3 then perform public.bb_coin(me.id, 5, 'streak3', 'streak3:' || d); end if;
  end if;
  if ct.king_team_id is not null and (me.team_id is null or me.team_id <> ct.king_team_id) then
    perform public.bb_notify_team(ct.king_team_id, 'presence',
      jsonb_build_object('nick', me.nick, 'court', ct.name, 'team', (select tag from public.teams where id = me.team_id)),
      'map/' || p_court, null);
  end if;
end $$;

-- ---------- WYZWANIA I PRZEJĘCIA: poparcie drużyny + akceptacja admina --
alter table public.challenges add column if not exists kind text not null default 'challenge';   -- challenge | claim
alter table public.challenges add column if not exists created_by uuid;
alter table public.challenges alter column defender_team_id drop not null;
alter table public.challenges drop constraint if exists challenges_status_check;
alter table public.challenges add constraint challenges_status_check check (status in
  ('proposed','review','pending','accepted','reported','confirmed','walkover','expired','cancelled','void','rejected','claimed'));

create table if not exists public.challenge_backers (
  challenge_id  uuid not null references public.challenges(id) on delete cascade,
  player_id     uuid not null references public.profiles(id) on delete cascade,
  primary key (challenge_id, player_id)
);

-- wspólne sprawdzenie boiska + utworzenie zgłoszenia
create or replace function public.bb_new_action(p_me public.profiles, p_court uuid, p_kind text, p_time timestamptz)
returns uuid language plpgsql security definer set search_path = public as $$
declare ct public.courts; tm public.teams; nid uuid; cap boolean;
begin
  if p_me.team_id is null then raise exception 'err_no_team'; end if;
  select * into tm from public.teams where id = p_me.team_id;
  select * into ct from public.courts where id = p_court and status = 'active' for update;
  if ct.id is null then raise exception 'err_not_found'; end if;
  if ct.sport <> tm.sport then raise exception 'err_wrong_sport'; end if;
  if exists (select 1 from public.challenges where court_id = p_court
              and status in ('proposed','review','pending','accepted','reported')) then
    raise exception 'err_court_busy';
  end if;
  if p_kind = 'claim' then
    if ct.king_team_id is not null then raise exception 'err_court_taken'; end if;
  else
    if ct.king_team_id is null then raise exception 'err_court_free'; end if;
    if ct.king_team_id = p_me.team_id then raise exception 'err_own_court'; end if;
    if ct.protected_until is not null and ct.protected_until > now() then raise exception 'err_protected'; end if;
    if p_time < now() + interval '48 hours' or p_time > now() + interval '14 days' then raise exception 'err_bad_time'; end if;
  end if;
  cap := tm.captain_id = p_me.id;
  insert into public.challenges (court_id, challenger_team_id, defender_team_id, scheduled_at, accept_deadline, kind, created_by, status)
  values (p_court, p_me.team_id, case when p_kind = 'claim' then null else ct.king_team_id end,
          coalesce(p_time, now()), now() + interval '48 hours', p_kind, p_me.id,
          case when cap then 'review' else 'proposed' end)
  returning id into nid;
  insert into public.challenge_backers (challenge_id, player_id) values (nid, p_me.id);
  if p_kind = 'challenge' then
    insert into public.challenge_players (challenge_id, player_id, team_id) values (nid, p_me.id, p_me.team_id);
  end if;
  if cap then perform public.bb_notify_staff('review_needed', jsonb_build_object('court', ct.name, 'team', tm.tag, 'kind', p_kind), 'admin');
  else perform public.bb_notify_team(p_me.team_id, 'support_needed', jsonb_build_object('court', ct.name, 'nick', p_me.nick, 'kind', p_kind), 'matches', p_me.id);
  end if;
  return nid;
end $$;
revoke execute on function public.bb_new_action(public.profiles, uuid, text, timestamptz) from public, anon, authenticated;

-- Wyzwanie: zgłasza kapitan (od razu do admina) albo zawodnik (potrzeba 3 głosów z drużyny)
create or replace function public.create_challenge(p_court uuid, p_time timestamptz)
returns uuid language plpgsql security definer set search_path = public as $$
begin
  return public.bb_new_action(public.bb_me(), p_court, 'challenge', p_time);
end $$;

-- Przejęcie wolnego boiska: trzeba być na miejscu; też do akceptacji admina
create or replace function public.claim_court(p_court uuid, p_lat float8, p_lng float8)
returns void language plpgsql security definer set search_path = public as $$
declare me public.profiles; ct public.courts;
begin
  me := public.bb_me();
  select * into ct from public.courts where id = p_court;
  if ct.id is null then raise exception 'err_not_found'; end if;
  perform public.bb_check_dist(ct, p_lat, p_lng);
  perform public.bb_new_action(me, p_court, 'claim', null);
end $$;

-- Poparcie zgłoszenia przez zawodnika drużyny; 3 głosy → trafia do admina
create or replace function public.support_challenge(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me public.profiles; c public.challenges; n int;
begin
  me := public.bb_me();
  select * into c from public.challenges where id = p_id for update;
  if c.id is null then raise exception 'err_not_found'; end if;
  if c.status <> 'proposed' then raise exception 'err_bad_state'; end if;
  if me.team_id is null or me.team_id <> c.challenger_team_id then raise exception 'err_not_in_match'; end if;
  insert into public.challenge_backers (challenge_id, player_id) values (p_id, me.id) on conflict do nothing;
  select count(*) into n from public.challenge_backers where challenge_id = p_id;
  if n >= 3 or public.bb_is_captain(me.id, c.challenger_team_id) then
    update public.challenges set status = 'review' where id = p_id;
    perform public.bb_notify_staff('review_needed',
      jsonb_build_object('court', (select name from public.courts where id = c.court_id),
                         'team', (select tag from public.teams where id = c.challenger_team_id), 'kind', c.kind), 'admin');
  end if;
end $$;

-- Admin / sędzia akceptuje lub odrzuca zgłoszenie
create or replace function public.admin_review_challenge(p_id uuid, p_approve boolean, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare me public.profiles; c public.challenges; ct public.courts; r record;
begin
  me := public.bb_require_staff();
  select * into c from public.challenges where id = p_id for update;
  if c.id is null then raise exception 'err_not_found'; end if;
  if c.status not in ('proposed','review') then raise exception 'err_bad_state'; end if;
  select * into ct from public.courts where id = c.court_id for update;
  if not p_approve then
    update public.challenges set status = 'rejected', note = nullif(p_note,''), resolved_at = now(), resolved_by = me.id where id = p_id;
    perform public.bb_notify_team(c.challenger_team_id, 'action_rejected', jsonb_build_object('court', ct.name, 'kind', c.kind, 'note', p_note), 'matches', null);
    return;
  end if;
  if c.kind = 'claim' then
    if ct.king_team_id is not null then raise exception 'err_court_taken'; end if;
    update public.courts set king_team_id = c.challenger_team_id, king_since = now(), defenses = 0,
           protected_until = now() + interval '24 hours' where id = c.court_id;
    insert into public.court_history (court_id, team_id, event, challenge_id) values (c.court_id, c.challenger_team_id, 'claim', p_id);
    update public.challenges set status = 'claimed', winner_team_id = c.challenger_team_id, resolved_at = now(), resolved_by = me.id where id = p_id;
    for r in select player_id from public.challenge_backers where challenge_id = p_id loop
      perform public.bb_coin(r.player_id, 15, 'claim', 'claim:' || p_id);
    end loop;
    perform public.bb_notify_team(c.challenger_team_id, 'claim_approved', jsonb_build_object('court', ct.name), 'map/' || c.court_id, null);
  else
    if ct.king_team_id is distinct from c.defender_team_id then raise exception 'err_bad_state'; end if;
    if c.scheduled_at < now() + interval '1 hour' then raise exception 'err_bad_time'; end if;
    update public.challenges set status = 'pending', accept_deadline = least(now() + interval '48 hours', scheduled_at) where id = p_id;
    perform public.bb_coin(c.created_by, 10, 'challenge', 'challenge:' || p_id);
    perform public.bb_notify_team(c.defender_team_id, 'challenged',
      jsonb_build_object('court', ct.name, 'team', (select tag from public.teams where id = c.challenger_team_id)), 'matches', null);
    perform public.bb_notify_team(c.challenger_team_id, 'challenge_approved', jsonb_build_object('court', ct.name), 'matches', null);
  end if;
end $$;

-- wycofanie: autor zgłoszenia albo kapitan, dopóki rywal nie przyjął
create or replace function public.cancel_challenge(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me public.profiles; c public.challenges;
begin
  me := public.bb_me();
  select * into c from public.challenges where id = p_id for update;
  if c.id is null then raise exception 'err_not_found'; end if;
  if c.status not in ('proposed','review','pending') then raise exception 'err_bad_state'; end if;
  if not (c.created_by = me.id or public.bb_is_captain(me.id, c.challenger_team_id)) then raise exception 'err_not_captain'; end if;
  update public.challenges set status = 'cancelled', resolved_at = now() where id = p_id;
end $$;

-- Rozliczenie meczu: boisko + monety + powiadomienia
create or replace function public.bb_finalize(p_id uuid, p_winner uuid, p_status text, p_note text, p_by uuid)
returns void language plpgsql security definer set search_path = public as $$
declare c public.challenges; r record; cname text;
begin
  select * into c from public.challenges where id = p_id for update;
  if c.status not in ('pending','accepted','reported') then return; end if;
  select name into cname from public.courts where id = c.court_id;

  update public.challenges
     set status = p_status, winner_team_id = p_winner,
         note = coalesce(p_note, note), resolved_at = now(), resolved_by = p_by
   where id = p_id;

  if c.status in ('accepted','reported') and p_status <> 'void' then
    update public.profiles set ghost_count = ghost_count + 1
     where id in (select player_id from public.challenge_players
                   where challenge_id = p_id and checked_in_at is null);
  end if;

  if p_winner is null then return; end if;

  if p_winner = c.challenger_team_id then
    update public.courts
       set king_team_id = p_winner, king_since = now(), defenses = 0,
           protected_until = now() + interval '24 hours'
     where id = c.court_id;
    insert into public.court_history (court_id, team_id, event, challenge_id)
    values (c.court_id, p_winner, 'capture', p_id);
  else
    update public.courts
       set defenses = defenses + 1, protected_until = now() + interval '24 hours'
     where id = c.court_id;
    insert into public.court_history (court_id, team_id, event, challenge_id)
    values (c.court_id, p_winner, 'defend', p_id);
  end if;

  -- OG Coins: zameldowani zawodnicy zwycięzców +25, przegranych +5
  for r in select player_id, team_id from public.challenge_players where challenge_id = p_id and checked_in_at is not null loop
    perform public.bb_coin(r.player_id, case when r.team_id = p_winner then 25 else 5 end,
                           case when r.team_id = p_winner then 'win' else 'played' end, 'match:' || p_id);
  end loop;
  perform public.bb_notify_team(c.challenger_team_id, 'result', jsonb_build_object('court', cname, 'won', p_winner = c.challenger_team_id), 'matches', null);
  perform public.bb_notify_team(c.defender_team_id, 'result', jsonb_build_object('court', cname, 'won', p_winner = c.defender_team_id), 'matches', null);
end $$;
revoke execute on function public.bb_finalize(uuid, uuid, text, text, uuid) from public, anon, authenticated;

create or replace function public.resolve_expired()
returns int language plpgsql security definer set search_path = public as $$
declare c record; n int := 0;
begin
  -- zgłoszenie bez 3 głosów drużyny przez 48 h → wygasa
  update public.challenges set status = 'expired', note = 'no_support', resolved_at = now()
   where status = 'proposed' and created_at + interval '48 hours' < now();
  -- "król" nie odpowiedział w 48 h → walkower dla wyzywających + duch dla kapitana
  for c in select * from public.challenges where status = 'pending' and accept_deadline < now() loop
    update public.profiles set ghost_count = ghost_count + 1
     where id = (select captain_id from public.teams where id = c.defender_team_id);
    perform public.bb_finalize(c.id, c.challenger_team_id, 'walkover', 'no_response', null);
    n := n + 1;
  end loop;
  for c in select * from public.challenges
            where status = 'accepted' and scheduled_at + interval '48 hours' < now() loop
    perform public.bb_finalize(c.id, null, 'expired', 'no_report', null);
    n := n + 1;
  end loop;
  return n;
end $$;

-- ---------- STATYSTYKI ZAWODNIKA PO MECZU (do akceptacji admina) --------
create table if not exists public.match_stats (
  challenge_id  uuid not null references public.challenges(id) on delete cascade,
  player_id     uuid not null references public.profiles(id) on delete cascade,
  team_id       uuid,
  stats         jsonb not null,           -- kosz: pts, reb, ast, stl, blk · piłka: goals, ast, saves
  status        text not null default 'pending' check (status in ('pending','approved','rejected')),
  note          text,
  reviewed_by   uuid,
  created_at    timestamptz not null default now(),
  primary key (challenge_id, player_id)
);

create or replace function public.bb_valid_stats(p jsonb) returns boolean language plpgsql immutable as $$
declare r record; n int := 0;
begin
  if jsonb_typeof(p) <> 'object' then return false; end if;
  for r in select * from jsonb_each(p) loop
    n := n + 1;
    if jsonb_typeof(r.value) <> 'number' or (r.value)::int not between 0 and 200 then return false; end if;
  end loop;
  return n between 1 and 10;
end $$;

create or replace function public.submit_match_stats(p_id uuid, p_stats jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare me public.profiles; c public.challenges;
begin
  me := public.bb_me();
  select * into c from public.challenges where id = p_id;
  if c.id is null or c.kind <> 'challenge' then raise exception 'err_not_found'; end if;
  if c.status not in ('accepted','reported','confirmed') then raise exception 'err_bad_state'; end if;
  if me.team_id is null or me.team_id not in (c.challenger_team_id, c.defender_team_id) then raise exception 'err_not_in_match'; end if;
  if not public.bb_valid_stats(p_stats) then raise exception 'err_bad_stats'; end if;
  if exists (select 1 from public.match_stats where challenge_id = p_id and player_id = me.id and status = 'approved') then
    raise exception 'err_bad_state';
  end if;
  insert into public.match_stats (challenge_id, player_id, team_id, stats) values (p_id, me.id, me.team_id, p_stats)
  on conflict (challenge_id, player_id) do update set stats = excluded.stats, status = 'pending', note = null, created_at = now();
end $$;

-- admin: akceptuje, odrzuca albo poprawia (p_stats = nowe wartości)
create or replace function public.review_match_stats(p_id uuid, p_player uuid, p_approve boolean, p_stats jsonb, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare me public.profiles;
begin
  me := public.bb_require_staff();
  if p_stats is not null and not public.bb_valid_stats(p_stats) then raise exception 'err_bad_stats'; end if;
  update public.match_stats
     set stats = coalesce(p_stats, stats), status = case when p_approve then 'approved' else 'rejected' end,
         note = nullif(p_note,''), reviewed_by = me.id
   where challenge_id = p_id and player_id = p_player;
  if p_approve then perform public.bb_coin(p_player, 5, 'stats', 'stats:' || p_id); end if;
  perform public.bb_notify(p_player, case when p_approve then 'stats_approved' else 'stats_rejected' end, '{}'::jsonb, 'player/me');
end $$;

-- ---------- SKILLE: admin ustawia paski bezpośrednio ---------------------
create or replace function public.admin_set_skills(p_player uuid, p_sport text, p_skills jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  perform public.bb_require_staff();
  if p_sport not in ('basketball','football') or jsonb_typeof(p_skills) <> 'object' then raise exception 'err_bad_skills'; end if;
  for r in select * from jsonb_each(p_skills) loop
    if jsonb_typeof(r.value) <> 'number' or (r.value)::int not between 25 and 99 then raise exception 'err_bad_skills'; end if;
  end loop;
  update public.profiles
     set skills = coalesce(skills, '{}'::jsonb) || jsonb_build_object(p_sport, p_skills),
         skills_pending = null, skills_pending_sport = null, skills_status = 'approved'
   where id = p_player;
  perform public.bb_notify(p_player, 'skills_updated', '{}'::jsonb, 'player/me');
end $$;

-- ---------- ODZNAKI SPECJALNE (nadawane przez admina) -------------------
create table if not exists public.player_badges (
  player_id   uuid not null references public.profiles(id) on delete cascade,
  code        text not null,
  note        text,
  granted_at  timestamptz not null default now(),
  primary key (player_id, code)
);
create or replace function public.grant_badge(p_player uuid, p_code text, p_note text, p_on boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.bb_require_admin();
  if p_on then
    insert into public.player_badges (player_id, code, note) values (p_player, left(p_code, 40), nullif(p_note,''))
    on conflict (player_id, code) do update set note = excluded.note;
    perform public.bb_notify(p_player, 'badge', jsonb_build_object('code', p_code), 'player/me');
  else
    delete from public.player_badges where player_id = p_player and code = p_code;
  end if;
end $$;

-- ---------- AKTUALNOŚCI / REKLAMY / KONKURSY na stronie startowej -------
create table if not exists public.posts (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null default 'news' check (kind in ('news','ad','contest')),
  title       text not null check (char_length(title) between 2 and 120),
  body        text,
  image_url   text,
  link_url    text,
  active      boolean not null default true,
  pinned      boolean not null default false,
  created_at  timestamptz not null default now()
);
create or replace function public.save_post(p_id uuid, p_data jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare nid uuid := coalesce(p_id, gen_random_uuid());
begin
  perform public.bb_require_admin();
  insert into public.posts (id, kind, title, body, image_url, link_url, active, pinned)
  values (nid, coalesce(p_data->>'kind','news'), left(trim(p_data->>'title'), 120), nullif(left(coalesce(p_data->>'body',''), 2000), ''),
          nullif(trim(coalesce(p_data->>'image_url','')), ''), nullif(trim(coalesce(p_data->>'link_url','')), ''),
          coalesce((p_data->>'active')::boolean, true), coalesce((p_data->>'pinned')::boolean, false))
  on conflict (id) do update set kind = excluded.kind, title = excluded.title, body = excluded.body,
    image_url = excluded.image_url, link_url = excluded.link_url, active = excluded.active, pinned = excluded.pinned;
  return nid;
end $$;
create or replace function public.delete_post(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin perform public.bb_require_admin(); delete from public.posts where id = p_id; end $$;

-- ---------- SKLEP: ramki, ułatwienia, nagrody od sponsorów ---------------
create table if not exists public.shop_items (
  id         uuid primary key default gen_random_uuid(),
  code       text unique,
  kind       text not null check (kind in ('cosmetic','perk','reward')),
  title      text not null,
  descr      text,
  cost       int not null check (cost > 0),
  stock      int,                        -- null = bez limitu
  image_url  text,
  sponsor    text,
  active     boolean not null default true,
  sort       int not null default 100
);
create table if not exists public.purchases (
  id          uuid primary key default gen_random_uuid(),
  player_id   uuid not null references public.profiles(id) on delete cascade,
  item_id     uuid not null references public.shop_items(id) on delete cascade,
  cost        int not null,
  status      text not null check (status in ('done','pending','fulfilled','cancelled')),
  note        text,
  created_at  timestamptz not null default now()
);
alter table public.purchases enable row level security;
drop policy if exists own_or_staff on public.purchases;
create policy own_or_staff on public.purchases for select using (
  player_id = auth.uid() or exists (select 1 from public.profiles where id = auth.uid() and (is_admin or is_moderator)));

create or replace function public.buy_item(p_item uuid, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare me public.profiles; it public.shop_items; pid uuid := gen_random_uuid();
begin
  me := public.bb_me();
  select * into it from public.shop_items where id = p_item and active for update;
  if it.id is null then raise exception 'err_not_found'; end if;
  if it.stock is not null and it.stock <= 0 then raise exception 'err_out_of_stock'; end if;
  if me.coins < it.cost then raise exception 'err_no_coins'; end if;
  if it.kind = 'cosmetic' and me.owned ? it.code then raise exception 'err_already_owned'; end if;
  insert into public.purchases (id, player_id, item_id, cost, status, note)
  values (pid, me.id, it.id, it.cost, case when it.kind = 'cosmetic' then 'done' else 'pending' end, nullif(left(coalesce(p_note,''), 200), ''));
  perform public.bb_coin(me.id, -it.cost, 'buy', 'buy:' || pid);
  if it.stock is not null then update public.shop_items set stock = stock - 1 where id = it.id; end if;
  if it.kind = 'cosmetic' then
    update public.profiles set owned = owned || to_jsonb(it.code), frame = it.code where id = me.id;
  else
    perform public.bb_notify_staff('purchase', jsonb_build_object('nick', me.nick, 'item', it.title), 'admin');
  end if;
end $$;

create or replace function public.equip_frame(p_code text)
returns void language plpgsql security definer set search_path = public as $$
declare me public.profiles;
begin
  me := public.bb_me();
  if p_code is not null and p_code <> '' and not (me.owned ? p_code) then raise exception 'err_not_allowed'; end if;
  update public.profiles set frame = nullif(p_code, '') where id = me.id;
end $$;

-- admin: zrealizowane / anulowane (zwrot monet)
create or replace function public.admin_purchase(p_id uuid, p_fulfilled boolean)
returns void language plpgsql security definer set search_path = public as $$
declare pu public.purchases;
begin
  perform public.bb_require_staff();
  select * into pu from public.purchases where id = p_id for update;
  if pu.id is null or pu.status <> 'pending' then raise exception 'err_bad_state'; end if;
  if p_fulfilled then
    update public.purchases set status = 'fulfilled' where id = p_id;
  else
    update public.purchases set status = 'cancelled' where id = p_id;
    perform public.bb_coin(pu.player_id, pu.cost, 'refund', 'refund:' || p_id);
    update public.shop_items set stock = stock + 1 where id = pu.item_id and stock is not null;
  end if;
  perform public.bb_notify(pu.player_id, case when p_fulfilled then 'purchase_done' else 'purchase_cancelled' end, '{}'::jsonb, 'shop');
end $$;

create or replace function public.save_shop_item(p_id uuid, p_data jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare nid uuid := coalesce(p_id, gen_random_uuid());
begin
  perform public.bb_require_admin();
  insert into public.shop_items (id, kind, title, descr, cost, stock, image_url, sponsor, active, sort)
  values (nid, coalesce(p_data->>'kind','reward'), left(trim(p_data->>'title'), 80), nullif(left(coalesce(p_data->>'descr',''), 400), ''),
          (p_data->>'cost')::int, nullif(p_data->>'stock','')::int, nullif(trim(coalesce(p_data->>'image_url','')), ''),
          nullif(trim(coalesce(p_data->>'sponsor','')), ''), coalesce((p_data->>'active')::boolean, true), coalesce((p_data->>'sort')::int, 100))
  on conflict (id) do update set title = excluded.title, descr = excluded.descr, cost = excluded.cost, stock = excluded.stock,
    image_url = excluded.image_url, sponsor = excluded.sponsor, active = excluded.active, sort = excluded.sort;
  return nid;
end $$;

-- startowa zawartość sklepu (nagrody rzeczowe są wyłączone, dopóki admin ich nie potwierdzi)
insert into public.shop_items (code, kind, title, descr, cost, stock, active, sort) values
  ('frame_gold',  'cosmetic', 'Złota ramka karty',    'Twoja karta zawodnika w złocie.', 150, null, true, 10),
  ('frame_fire',  'cosmetic', 'Ramka „On Fire”',      'Ognista ramka dla tych, którzy są w gazie.', 300, null, true, 11),
  ('frame_ice',   'cosmetic', 'Ramka „Ice Cold”',     'Lodowa ramka dla chłodnych głów.', 300, null, true, 12),
  ('frame_neon',  'cosmetic', 'Ramka „Neon Court”',   'Neonowa ramka – widać Cię z daleka.', 500, null, true, 13),
  ('perk_reschedule', 'perk', 'Przeniesienie meczu',  'Jednorazowa zmiana terminu wyzwania (zatwierdza admin).', 200, null, true, 20),
  ('perk_shield',     'perk', 'Tarcza 48 h',          'Wasze boisko nie może być wyzwane przez 48 h (włącza admin).', 400, null, true, 21),
  ('perk_visit',      'perk', 'Wizyta OG SPOT',       'Wskaż boisko – przyjedziemy je ocenić w pierwszej kolejności.', 800, null, true, 22),
  ('reward_net',      'reward', 'Metalowa siatka na Twoje boisko', 'Przykładowa nagroda – włącz po ustaleniu ze sponsorem.', 1500, 5, false, 30),
  ('reward_ball',     'reward', 'Piłka meczowa',      'Przykładowa nagroda – włącz po ustaleniu ze sponsorem.', 2500, 3, false, 31)
on conflict (code) do nothing;

-- ---------- DROPY: nagrody zostawione na boiskach ------------------------
create table if not exists public.drops (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  hint        text,
  prize       text,
  coins       int not null default 0,
  image_url   text,
  status      text not null default 'active' check (status in ('active','claimed','ended')),
  claimed_by  uuid references public.profiles(id) on delete set null,
  claimed_at  timestamptz,
  created_at  timestamptz not null default now()
);
create table if not exists public.drop_codes (     -- kody są tajne: brak polityki odczytu
  drop_id  uuid primary key references public.drops(id) on delete cascade,
  code     text not null
);
create table if not exists public.drop_attempts (
  drop_id uuid not null, player_id uuid not null, at timestamptz not null default now()
);
alter table public.drop_codes enable row level security;
alter table public.drop_attempts enable row level security;

create or replace function public.create_drop(p_data jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare nid uuid := gen_random_uuid();
begin
  perform public.bb_require_admin();
  if char_length(trim(coalesce(p_data->>'code',''))) < 4 then raise exception 'err_bad_request'; end if;
  insert into public.drops (id, title, hint, prize, coins, image_url)
  values (nid, left(trim(p_data->>'title'), 100), nullif(left(coalesce(p_data->>'hint',''), 500), ''),
          nullif(left(coalesce(p_data->>'prize',''), 200), ''), coalesce((p_data->>'coins')::int, 0),
          nullif(trim(coalesce(p_data->>'image_url','')), ''));
  insert into public.drop_codes (drop_id, code) values (nid, lower(trim(p_data->>'code')));
  insert into public.notifications (player_id, kind, data, link)
  select id, 'drop_new', jsonb_build_object('title', p_data->>'title'), 'home' from public.profiles;
  return nid;
end $$;

create or replace function public.claim_drop(p_id uuid, p_code text)
returns boolean language plpgsql security definer set search_path = public as $$
declare me public.profiles; d public.drops;
begin
  me := public.bb_me();
  select * into d from public.drops where id = p_id for update;
  if d.id is null or d.status <> 'active' then raise exception 'err_drop_gone'; end if;
  if (select count(*) from public.drop_attempts where drop_id = p_id and player_id = me.id and at > now() - interval '1 day') >= 5 then
    raise exception 'err_drop_attempts';
  end if;
  insert into public.drop_attempts (drop_id, player_id) values (p_id, me.id);
  if not exists (select 1 from public.drop_codes where drop_id = p_id and code = lower(trim(coalesce(p_code,'')))) then
    return false;
  end if;
  update public.drops set status = 'claimed', claimed_by = me.id, claimed_at = now() where id = p_id;
  perform public.bb_coin(me.id, greatest(d.coins, 0) + 20, 'drop', 'drop:' || p_id);
  perform public.bb_notify_staff('drop_claimed', jsonb_build_object('nick', me.nick, 'title', d.title), 'admin');
  return true;
end $$;

create or replace function public.end_drop(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin perform public.bb_require_admin(); update public.drops set status = 'ended' where id = p_id and status = 'active'; end $$;

-- ---------- POLECENIA: kto Cię zaprosił ----------------------------------
create or replace function public.set_referrer(p_nick text)
returns void language plpgsql security definer set search_path = public as $$
declare me public.profiles; ref public.profiles;
begin
  me := public.bb_me();
  if me.invited_by is not null then raise exception 'err_bad_state'; end if;
  select * into ref from public.profiles where lower(nick) = lower(trim(p_nick)) and id <> me.id limit 1;
  if ref.id is null then raise exception 'err_not_found'; end if;
  if ref.created_at > me.created_at then raise exception 'err_bad_request'; end if;
  update public.profiles set invited_by = ref.id where id = me.id;
  perform public.bb_coin(ref.id, 30, 'referral', 'ref:' || me.id);
  perform public.bb_coin(me.id, 10, 'referred', 'referred');
  perform public.bb_notify(ref.id, 'referral', jsonb_build_object('nick', me.nick), 'shop');
end $$;

-- ---------- AUTOMATYCZNE NAGRODY (wyzwalacze) ----------------------------
create or replace function public.bb_trg_coins() returns trigger
language plpgsql security definer set search_path = public as $$
declare d text := ((now() at time zone 'Europe/Warsaw')::date)::text;
begin
  if tg_table_name = 'court_ratings' then
    perform public.bb_coin(new.player_id, 5, 'rate', 'rate:' || new.court_id);
  elsif tg_table_name = 'court_issues' then
    perform public.bb_coin(new.player_id, 3, 'issue', 'daily:issue:' || d);
  elsif tg_table_name = 'games' then
    perform public.bb_coin(new.host_id, 5, 'game', 'daily:game:' || d);
  elsif tg_table_name = 'game_players' then
    perform public.bb_coin(new.player_id, 5, 'game', 'daily:game:' || d);
    perform public.bb_notify((select host_id from public.games where id = new.game_id and host_id <> new.player_id), 'game_joined',
      jsonb_build_object('nick', (select nick from public.profiles where id = new.player_id)), 'games');
  elsif tg_table_name = 'teams' then
    perform public.bb_coin(new.captain_id, 50, 'team_create', 'team_create');
  elsif tg_table_name = 'profiles' then
    if old.team_id is null and new.team_id is not null then perform public.bb_coin(new.id, 20, 'team_join', 'team_join'); end if;
    if old.position is null and new.position is not null then perform public.bb_coin(new.id, 10, 'profile', 'profile'); end if;
  elsif tg_table_name = 'courts' then
    if old.status = 'pending' and new.status = 'active' then perform public.bb_coin(new.added_by, 30, 'court_added', 'court:' || new.id); end if;
  elsif tg_table_name = 'team_requests' then
    if new.kind = 'invite' then
      perform public.bb_notify(new.player_id, 'team_invite', jsonb_build_object('team', (select tag from public.teams where id = new.team_id)), 'home');
    else
      perform public.bb_notify((select captain_id from public.teams where id = new.team_id), 'team_request',
        jsonb_build_object('nick', (select nick from public.profiles where id = new.player_id)), 'team/' || new.team_id);
    end if;
  end if;
  return new;
end $$;

do $$ declare t text; begin
  foreach t in array array['court_ratings','court_issues','games','game_players','teams','team_requests'] loop
    execute format('drop trigger if exists bb_coins on public.%I', t);
    execute format('create trigger bb_coins after insert on public.%I for each row execute function public.bb_trg_coins()', t);
  end loop;
  drop trigger if exists bb_coins on public.profiles;
  create trigger bb_coins after update of team_id, position on public.profiles for each row execute function public.bb_trg_coins();
  drop trigger if exists bb_coins on public.courts;
  create trigger bb_coins after update of status on public.courts for each row execute function public.bb_trg_coins();
end $$;

-- ---------- RLS + realtime dla tabel publicznych -------------------------
do $$ declare t text; begin
  foreach t in array array['court_presence','challenge_backers','match_stats','player_badges','posts','shop_items','drops'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists read_all on public.%I', t);
    execute format('create policy read_all on public.%I for select using (true)', t);
  end loop;
  foreach t in array array['court_presence','challenge_backers','match_stats','player_badges','posts','shop_items','drops','notifications','purchases'] loop
    begin execute format('alter publication supabase_realtime add table public.%I', t);
    exception when others then null; end;
  end loop;
end $$;


-- ---------- UPRAWNIENIA DO FUNKCJI -----------------------------------

revoke execute on function public.bb_finalize(uuid, uuid, text, text, uuid) from public, anon, authenticated;
revoke execute on function public.bb_check_dist(public.courts, float8, float8) from public, anon, authenticated;
revoke execute on function public.bb_new_user() from public, anon, authenticated;
grant execute on function public.resolve_expired() to anon, authenticated;

-- ---------- OPCJONALNIE: automatyczne rozliczanie co 10 min ----------
-- Database → Extensions → włącz "pg_cron", potem uruchom:
-- select cron.schedule('bbkort-resolve', '*/10 * * * *', $$select public.resolve_expired()$$);
