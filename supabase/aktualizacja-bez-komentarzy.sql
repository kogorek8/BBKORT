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
select 'BBKORT migracja 2 OK' as wynik;
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
select 'BBKORT migracja 3 OK' as wynik;
