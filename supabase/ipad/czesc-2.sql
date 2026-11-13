select 'BBKORT czesc 2 z 5';
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
