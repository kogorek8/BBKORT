select 'BBKORT czesc 3 z 5';
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
