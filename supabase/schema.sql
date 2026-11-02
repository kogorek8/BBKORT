-- =====================================================================
--  BBKORT – schemat bazy danych dla Supabase (PostgreSQL)
--  Uruchom CAŁY plik w: Supabase → SQL Editor → New query → Run.
--
--  Zasady gry są egzekwowane PO STRONIE SERWERA (funkcje RPC poniżej),
--  więc nikt nie może "przejąć" boiska edytując dane z przeglądarki.
--  Stałe zasad (promień, terminy) są też w app/js/rules.js – trzymaj je
--  w zgodzie.
--
--    promień check-in / przejęcia ............ 150 m
--    akceptacja wyzwania przez "króla" ....... 24 h (lub do startu meczu)
--    potwierdzenie wyniku przez kapitanów ...... 24 h
--    ochrona boiska po przejęciu / obronie ..... 24 h
--    check-in otwarty ........................... 30 min przed – 30 min po starcie
--    walkower możliwy ........................... 30 min po starcie
--    mecz bez wyniku wygasa ..................... 24 h po starcie
--
--  Po utworzeniu konta admina nadaj mu uprawnienia:
--    update public.profiles set is_admin = true where nick = 'TWÓJ_NICK';
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- TABELE ----------------------------------------------------

create table if not exists public.teams (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique check (char_length(name) between 3 and 40),
  tag         text not null unique check (char_length(tag) between 2 and 4),
  color       text not null default '#ff7a1a',
  captain_id  uuid,
  rating      numeric,                       -- zarezerwowane: wzór ustalimy później
  created_at  timestamptz not null default now()
);

create table if not exists public.profiles (
  id                  uuid primary key references auth.users(id) on delete cascade,
  nick                text not null check (char_length(nick) between 2 and 24),
  team_id             uuid references public.teams(id) on delete set null,
  position            text check (position in ('PG','SG','SF','PF','C')),
  number              int  check (number between 0 and 99),
  height_cm           int  check (height_cm between 120 and 240),
  is_admin            boolean not null default false,
  skills              jsonb,                 -- zatwierdzone przez admina
  skills_pending      jsonb,                 -- czekają na akceptację
  skills_video        text,                  -- link do filmiku (opcjonalnie)
  skills_status       text not null default 'none'
                      check (skills_status in ('none','pending','approved','rejected')),
  skills_note         text,                  -- komentarz admina
  skills_submitted_at timestamptz,
  ghost_count         int not null default 0, -- ile razy był "duchem"
  created_at          timestamptz not null default now()
);

do $$ begin
  alter table public.teams
    add constraint teams_captain_fk foreign key (captain_id)
    references public.profiles(id) on delete set null;
exception when duplicate_object then null; end $$;

create table if not exists public.courts (
  id               uuid primary key default gen_random_uuid(),
  external_id      text unique,              -- osm:way/123 | g:PlaceId
  name             text not null default '',
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
  id                    uuid primary key default gen_random_uuid(),
  court_id              uuid not null references public.courts(id) on delete cascade,
  challenger_team_id    uuid not null references public.teams(id) on delete cascade,
  defender_team_id      uuid not null references public.teams(id) on delete cascade,
  scheduled_at          timestamptz not null,
  status                text not null default 'pending' check (status in
                        ('pending','accepted','reported','disputed',
                         'confirmed','walkover','expired','cancelled','void')),
  accept_deadline       timestamptz not null,
  score_challenger      int,
  score_defender        int,
  reported_by_team      uuid,
  reported_at           timestamptz,
  confirm_deadline      timestamptz,
  challenger_confirmed  boolean not null default false,
  defender_confirmed    boolean not null default false,
  winner_team_id        uuid,
  note                  text,
  resolved_at           timestamptz,
  created_at            timestamptz not null default now()
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
create or replace function public.bb_finalize(p_id uuid, p_winner uuid, p_status text, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare c public.challenges;
begin
  select * into c from public.challenges where id = p_id for update;
  if c.status not in ('pending','accepted','reported','disputed') then return; end if;

  update public.challenges
     set status = p_status, winner_team_id = p_winner,
         note = coalesce(p_note, note), resolved_at = now()
   where id = p_id;

  -- DUCHY: zapisani na mecz, którzy nie zameldowali się na boisku
  if c.status in ('accepted','reported','disputed') then
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

create or replace function public.update_profile(p_nick text, p_position text, p_number int, p_height int)
returns void language plpgsql security definer set search_path = public as $$
declare me public.profiles;
begin
  me := public.bb_me();
  update public.profiles
     set nick = coalesce(nullif(trim(p_nick),''), nick),
         position = p_position, number = p_number, height_cm = p_height
   where id = me.id;
end $$;

create or replace function public.submit_skills(p_skills jsonb, p_video text)
returns void language plpgsql security definer set search_path = public as $$
declare me public.profiles; r record; n int := 0;
begin
  me := public.bb_me();
  if jsonb_typeof(p_skills) <> 'object' then raise exception 'err_bad_skills'; end if;
  for r in select * from jsonb_each(p_skills) loop
    n := n + 1;
    if jsonb_typeof(r.value) <> 'number' or (r.value)::int not between 25 and 99 then
      raise exception 'err_bad_skills';
    end if;
  end loop;
  if n = 0 or n > 30 then raise exception 'err_bad_skills'; end if;
  update public.profiles
     set skills_pending = p_skills, skills_video = nullif(trim(coalesce(p_video,'')),''),
         skills_status = 'pending', skills_note = null, skills_submitted_at = now()
   where id = me.id;
end $$;

create or replace function public.review_skills(p_player uuid, p_approve boolean, p_note text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.bb_require_admin();
  if p_approve then
    update public.profiles
       set skills = coalesce(skills_pending, skills), skills_pending = null,
           skills_status = 'approved', skills_note = nullif(p_note,'')
     where id = p_player and skills_status = 'pending';
  else
    update public.profiles
       set skills_pending = null, skills_status = 'rejected', skills_note = nullif(p_note,'')
     where id = p_player and skills_status = 'pending';
  end if;
end $$;

-- ---------- RPC: DRUŻYNY ----------------------------------------------

create or replace function public.create_team(p_name text, p_tag text, p_color text)
returns uuid language plpgsql security definer set search_path = public as $$
declare me public.profiles; nid uuid;
begin
  me := public.bb_me();
  if me.team_id is not null then raise exception 'err_already_in_team'; end if;
  if exists (select 1 from public.teams where lower(name) = lower(trim(p_name))
                                           or upper(tag) = upper(trim(p_tag))) then
    raise exception 'err_team_exists';
  end if;
  insert into public.teams (name, tag, color, captain_id)
  values (trim(p_name), upper(trim(p_tag)), coalesce(p_color,'#ff7a1a'), me.id)
  returning id into nid;
  update public.profiles set team_id = nid where id = me.id;
  return nid;
end $$;

create or replace function public.join_team(p_team uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me public.profiles;
begin
  me := public.bb_me();
  if me.team_id is not null then raise exception 'err_already_in_team'; end if;
  if not exists (select 1 from public.teams where id = p_team) then raise exception 'err_not_found'; end if;
  update public.profiles set team_id = p_team where id = me.id;
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
-- Pomija duplikaty: ten sam external_id albo boisko w promieniu ~40 m.
create or replace function public.import_courts(p_courts jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare r jsonb; n int := 0; la float8; ln float8;
begin
  perform public.bb_me();
  if jsonb_typeof(p_courts) <> 'array' or jsonb_array_length(p_courts) > 300 then
    raise exception 'err_bad_request';
  end if;
  for r in select * from jsonb_array_elements(p_courts) loop
    la := (r->>'lat')::float8; ln := (r->>'lng')::float8;
    continue when la is null or ln is null;
    continue when exists (select 1 from public.courts where external_id = r->>'external_id');
    continue when exists (select 1 from public.courts
                           where abs(lat - la) < 0.0006 and abs(lng - ln) < 0.0009
                             and public.bb_dist_m(lat, lng, la, ln) < 40);
    insert into public.courts (external_id, name, lat, lng, address, source)
    values (r->>'external_id', left(coalesce(r->>'name',''), 80), la, ln,
            left(coalesce(r->>'address',''), 120), coalesce(r->>'source','manual'));
    n := n + 1;
  end loop;
  return n;
end $$;

-- Przejęcie WOLNEGO boiska (trzeba fizycznie być na miejscu)
create or replace function public.claim_court(p_court uuid, p_lat float8, p_lng float8)
returns void language plpgsql security definer set search_path = public as $$
declare me public.profiles; ct public.courts;
begin
  me := public.bb_me();
  if me.team_id is null then raise exception 'err_no_team'; end if;
  select * into ct from public.courts where id = p_court for update;
  if ct.id is null then raise exception 'err_not_found'; end if;
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
declare me public.profiles; ct public.courts; nid uuid;
begin
  me := public.bb_me();
  if me.team_id is null then raise exception 'err_no_team'; end if;
  if not public.bb_is_captain(me.id, me.team_id) then raise exception 'err_not_captain'; end if;
  select * into ct from public.courts where id = p_court for update;
  if ct.id is null then raise exception 'err_not_found'; end if;
  if ct.king_team_id is null then raise exception 'err_court_free'; end if;
  if ct.king_team_id = me.team_id then raise exception 'err_own_court'; end if;
  if ct.protected_until is not null and ct.protected_until > now() then raise exception 'err_protected'; end if;
  if exists (select 1 from public.challenges where court_id = p_court
              and status in ('pending','accepted','reported','disputed')) then
    raise exception 'err_court_busy';
  end if;
  if p_time < now() + interval '60 minutes' or p_time > now() + interval '7 days' then
    raise exception 'err_bad_time';
  end if;
  insert into public.challenges (court_id, challenger_team_id, defender_team_id, scheduled_at, accept_deadline)
  values (p_court, me.team_id, ct.king_team_id, p_time, least(now() + interval '24 hours', p_time))
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
  perform public.bb_finalize(p_id, c.challenger_team_id, 'walkover', 'forfeit');
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

-- Kapitan wpisuje wynik; sam automatycznie go potwierdza. Drugi kapitan ma 24 h.
create or replace function public.report_result(p_id uuid, p_score_challenger int, p_score_defender int)
returns void language plpgsql security definer set search_path = public as $$
declare me public.profiles; c public.challenges; side text; a int; b int;
begin
  me := public.bb_me();
  select * into c from public.challenges where id = p_id for update;
  if c.id is null then raise exception 'err_not_found'; end if;
  if c.status <> 'accepted' then raise exception 'err_bad_state'; end if;
  if public.bb_is_captain(me.id, c.challenger_team_id) then side := 'c';
  elsif public.bb_is_captain(me.id, c.defender_team_id) then side := 'd';
  else raise exception 'err_not_captain'; end if;
  if now() < c.scheduled_at - interval '30 minutes' then raise exception 'err_too_early'; end if;
  select count(*) filter (where team_id = c.challenger_team_id and checked_in_at is not null),
         count(*) filter (where team_id = c.defender_team_id   and checked_in_at is not null)
    into a, b from public.challenge_players where challenge_id = p_id;
  if a = 0 or b = 0 then raise exception 'err_need_checkins'; end if;
  if p_score_challenger is null or p_score_defender is null
     or p_score_challenger < 0 or p_score_defender < 0
     or p_score_challenger = p_score_defender then
    raise exception 'err_bad_score';
  end if;
  update public.challenges
     set status = 'reported', score_challenger = p_score_challenger, score_defender = p_score_defender,
         reported_by_team = case side when 'c' then c.challenger_team_id else c.defender_team_id end,
         reported_at = now(), confirm_deadline = now() + interval '24 hours',
         challenger_confirmed = (side = 'c'), defender_confirmed = (side = 'd')
   where id = p_id;
end $$;

create or replace function public.confirm_result(p_id uuid, p_agree boolean)
returns void language plpgsql security definer set search_path = public as $$
declare me public.profiles; c public.challenges; w uuid;
begin
  me := public.bb_me();
  select * into c from public.challenges where id = p_id for update;
  if c.id is null then raise exception 'err_not_found'; end if;
  if c.status <> 'reported' then raise exception 'err_bad_state'; end if;
  if not c.challenger_confirmed and public.bb_is_captain(me.id, c.challenger_team_id) then
    update public.challenges set challenger_confirmed = p_agree where id = p_id;
  elsif not c.defender_confirmed and public.bb_is_captain(me.id, c.defender_team_id) then
    update public.challenges set defender_confirmed = p_agree where id = p_id;
  else
    raise exception 'err_not_captain';
  end if;
  if not p_agree then
    update public.challenges set status = 'disputed' where id = p_id;
    return;
  end if;
  w := case when c.score_challenger > c.score_defender then c.challenger_team_id else c.defender_team_id end;
  perform public.bb_finalize(p_id, w, 'confirmed', null);
end $$;

-- Walkower: 30 min po starcie, my jesteśmy na miejscu, rywala nie ma
create or replace function public.claim_walkover(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me public.profiles; c public.challenges; mine uuid; other uuid; a int; b int;
begin
  me := public.bb_me();
  select * into c from public.challenges where id = p_id for update;
  if c.id is null then raise exception 'err_not_found'; end if;
  if c.status <> 'accepted' then raise exception 'err_bad_state'; end if;
  if public.bb_is_captain(me.id, c.challenger_team_id) then mine := c.challenger_team_id; other := c.defender_team_id;
  elsif public.bb_is_captain(me.id, c.defender_team_id) then mine := c.defender_team_id; other := c.challenger_team_id;
  else raise exception 'err_not_captain'; end if;
  if now() < c.scheduled_at + interval '30 minutes' then raise exception 'err_too_early'; end if;
  select count(*) filter (where team_id = mine  and checked_in_at is not null),
         count(*) filter (where team_id = other and checked_in_at is not null)
    into a, b from public.challenge_players where challenge_id = p_id;
  if a = 0 then raise exception 'err_need_checkins'; end if;
  if b > 0 then raise exception 'err_opponent_present'; end if;
  perform public.bb_finalize(p_id, mine, 'walkover', 'no_show');
end $$;

-- Rozlicza przeterminowane wyzwania (wywoływane przez aplikację co jakiś czas;
-- opcjonalnie przez pg_cron – patrz koniec pliku).
create or replace function public.resolve_expired()
returns int language plpgsql security definer set search_path = public as $$
declare c record; n int := 0; a int; b int;
begin
  -- 1) "Król" nie odpowiedział na wyzwanie → walkower dla wyzywających
  for c in select * from public.challenges where status = 'pending' and accept_deadline < now() loop
    update public.profiles set ghost_count = ghost_count + 1
     where id = (select captain_id from public.teams where id = c.defender_team_id);
    perform public.bb_finalize(c.id, c.challenger_team_id, 'walkover', 'no_response');
    n := n + 1;
  end loop;

  -- 2) Mecz zaakceptowany, ale nikt nie wpisał wyniku przez 24 h od startu
  for c in select * from public.challenges
            where status = 'accepted' and scheduled_at + interval '24 hours' < now() loop
    select count(*) filter (where team_id = c.challenger_team_id and checked_in_at is not null),
           count(*) filter (where team_id = c.defender_team_id   and checked_in_at is not null)
      into a, b from public.challenge_players where challenge_id = c.id;
    if a > 0 and b = 0 then perform public.bb_finalize(c.id, c.challenger_team_id, 'walkover', 'no_show');
    elsif b > 0 and a = 0 then perform public.bb_finalize(c.id, c.defender_team_id, 'walkover', 'no_show');
    else perform public.bb_finalize(c.id, null, 'expired', 'no_report');
    end if;
    n := n + 1;
  end loop;

  -- 3) Wynik wpisany, drugi kapitan nie potwierdził w 24 h → walkower dla tego, kto potwierdził
  for c in select * from public.challenges where status = 'reported' and confirm_deadline < now() loop
    if c.challenger_confirmed and not c.defender_confirmed then
      update public.profiles set ghost_count = ghost_count + 1
       where id = (select captain_id from public.teams where id = c.defender_team_id);
      perform public.bb_finalize(c.id, c.challenger_team_id, 'walkover', 'no_confirm');
    elsif c.defender_confirmed and not c.challenger_confirmed then
      update public.profiles set ghost_count = ghost_count + 1
       where id = (select captain_id from public.teams where id = c.challenger_team_id);
      perform public.bb_finalize(c.id, c.defender_team_id, 'walkover', 'no_confirm');
    else
      perform public.bb_finalize(c.id, null, 'expired', 'no_confirm');
    end if;
    n := n + 1;
  end loop;
  return n;
end $$;

-- ---------- RPC: ADMIN ------------------------------------------------

create or replace function public.admin_resolve(p_id uuid, p_winner uuid)
returns void language plpgsql security definer set search_path = public as $$
declare c public.challenges;
begin
  perform public.bb_require_admin();
  select * into c from public.challenges where id = p_id;
  if c.id is null then raise exception 'err_not_found'; end if;
  if c.status not in ('pending','accepted','reported','disputed') then raise exception 'err_bad_state'; end if;
  if p_winner is null then
    perform public.bb_finalize(p_id, null, 'void', 'admin');
  elsif p_winner in (c.challenger_team_id, c.defender_team_id) then
    perform public.bb_finalize(p_id, p_winner, 'confirmed', 'admin');
  else
    raise exception 'err_bad_request';
  end if;
end $$;

create or replace function public.admin_reset_court(p_court uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.bb_require_admin();
  update public.challenges set status = 'cancelled', note = 'admin', resolved_at = now()
   where court_id = p_court and status in ('pending','accepted','reported','disputed');
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

-- ---------- UPRAWNIENIA DO FUNKCJI -----------------------------------

revoke execute on function public.bb_finalize(uuid, uuid, text, text) from public, anon, authenticated;
revoke execute on function public.bb_check_dist(public.courts, float8, float8) from public, anon, authenticated;
revoke execute on function public.bb_new_user() from public, anon, authenticated;
grant execute on function public.resolve_expired() to anon, authenticated;

-- ---------- OPCJONALNIE: automatyczne rozliczanie co 10 min ----------
-- Database → Extensions → włącz "pg_cron", potem uruchom:
-- select cron.schedule('bbkort-resolve', '*/10 * * * *', $$select public.resolve_expired()$$);
