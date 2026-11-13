-- =====================================================================
--  BBKORT – MIGRACJA 4: "gra" – OG Coins, sklep i nagrody, dropy,
--  "kto teraz gra", powiadomienia, statystyki po meczu, wyzwania
--  i przejęcia do akceptacji admina, odznaki, aktualności/reklamy.
--  Bezpieczna do wielokrotnego uruchomienia. Wymaga migracji 2 i 3.
-- =====================================================================

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

select 'BBKORT migracja 4 OK' as wynik;
