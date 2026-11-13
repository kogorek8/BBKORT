-- BBKORT – CZĘŚĆ 4 z 5. Uruchamiaj po kolei: 1, 2, 3, 4, 5.
-- (Ten sam kod co schema.sql, tylko podzielony na krótsze kawałki – łatwiej skopiować na iPadzie.)

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

