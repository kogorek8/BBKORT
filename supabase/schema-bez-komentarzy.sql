select 'BBKORT start';
create extension if not exists pgcrypto;
create table if not exists public.teams (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique check (char_length(name) between 3 and 40),
  tag         text not null unique check (char_length(tag) between 2 and 4),
  color       text not null default '#ff7a1a',
  sport       text not null default 'basketball' check (sport in ('basketball','football')),
  captain_id  uuid,
  rating      numeric,
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
  skills                jsonb not null default '{}'::jsonb,
  skills_pending        jsonb,
  skills_pending_sport  text,
  skills_video          text,
  skills_status         text not null default 'none'
                        check (skills_status in ('none','pending','approved','rejected')),
  skills_note           text,
  skills_submitted_at   timestamptz,
  ghost_count           int not null default 0,
  created_at            timestamptz not null default now()
);
do $$ begin
  alter table public.teams
    add constraint teams_captain_fk foreign key (captain_id)
    references public.profiles(id) on delete set null;
exception when duplicate_object then null; end $$;
create table if not exists public.courts (
  id               uuid primary key default gen_random_uuid(),
  external_id      text unique,
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
  referee_id          uuid references public.profiles(id) on delete set null,
  challenger_report   jsonb,
  defender_report     jsonb,
  score_challenger    int,
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
  event         text not null,
  challenge_id  uuid,
  at            timestamptz not null default now()
);
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
do $$ declare t text; begin
  foreach t in array array['teams','profiles','courts','challenges','challenge_players','court_history'] loop
    begin execute format('alter publication supabase_realtime add table public.%I', t);
    exception when others then null; end;
  end loop;
end $$;
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
create or replace function public.update_profile(p_nick text, p_position text, p_number int, p_height int, p_sport text)
returns void language plpgsql security definer set search_path = public as $$
declare me public.profiles;
begin
  me := public.bb_me();
  update public.profiles
     set nick = coalesce(nullif(trim(p_nick),''), nick),
         position = nullif(p_position,''), number = p_number, height_cm = p_height,
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
      delete from public.teams where id = me.team_id;
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
create or replace function public.forfeit_challenge(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me public.profiles; c public.challenges;
begin
  me := public.bb_me();
  select * into c from public.challenges where id = p_id;
  if c.id is null then raise exception 'err_not_found'; end if;
  if c.status not in ('pending','accepted') then raise exception 'err_bad_state'; end if;
  if not public.bb_is_captain(me.id, c.defender_team_id) then raise exception 'err_not_captain'; end if;
  update public.challenges set status = 'pending' where id = p_id;
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
create or replace function public.resolve_expired()
returns int language plpgsql security definer set search_path = public as $$
declare c record; n int := 0;
begin
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
create table if not exists public.court_ratings (
  court_id    uuid not null references public.courts(id) on delete cascade,
  player_id   uuid not null references public.profiles(id) on delete cascade,
  scores      jsonb not null,
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
create or replace function public.admin_delete_rating(p_court uuid, p_player uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.bb_require_admin();
  delete from public.court_ratings where court_id = p_court and player_id = p_player;
end $$;
alter table public.courts add column if not exists status text not null default 'active';
alter table public.courts add column if not exists added_by uuid references public.profiles(id) on delete set null;
alter table public.courts add column if not exists photo_url text;
do $$ begin
  alter table public.courts add constraint courts_status_chk check (status in ('active','pending'));
exception when duplicate_object then null; end $$;
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
  suggestions  jsonb not null default '[]'::jsonb,
  photos       jsonb not null default '[]'::jsonb,
  video_url    text,
  updated_at   timestamptz not null default now()
);
create sequence if not exists public.og_spot_number_seq;
create table if not exists public.team_requests (
  team_id     uuid not null references public.teams(id) on delete cascade,
  player_id   uuid not null references public.profiles(id) on delete cascade,
  kind        text not null check (kind in ('request','invite')),
  created_at  timestamptz not null default now(),
  primary key (team_id, player_id)
);
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
create table if not exists public.court_issues (
  id          bigint generated always as identity primary key,
  court_id    uuid not null references public.courts(id) on delete cascade,
  player_id   uuid references public.profiles(id) on delete set null,
  text        text not null check (char_length(text) between 3 and 300),
  status      text not null default 'open' check (status in ('open','resolved')),
  created_at  timestamptz not null default now()
);
do $$ declare t text; begin
  foreach t in array array['court_reviews','team_requests','games','game_players','court_issues'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists read_all on public.%I', t);
    execute format('create policy read_all on public.%I for select using (true)', t);
    begin execute format('alter publication supabase_realtime add table public.%I', t);
    exception when others then null; end;
  end loop;
end $$;
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
create or replace function public.join_team(p_team uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.request_join(p_team);
end $$;
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
    update public.games set status = 'cancelled' where id = p_game;
  else
    delete from public.game_players where game_id = p_game and player_id = me.id;
  end if;
end $$;
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
revoke execute on function public.bb_finalize(uuid, uuid, text, text, uuid) from public, anon, authenticated;
revoke execute on function public.bb_check_dist(public.courts, float8, float8) from public, anon, authenticated;
revoke execute on function public.bb_new_user() from public, anon, authenticated;
grant execute on function public.resolve_expired() to anon, authenticated;
