-- BBKORT – CZĘŚĆ 5 z 5. Uruchamiaj po kolei: 1, 2, 3, 4, 5.
-- (Ten sam kod co schema.sql, tylko podzielony na krótsze kawałki – łatwiej skopiować na iPadzie.)

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

-- ---------- UPRAWNIENIA DO FUNKCJI -----------------------------------

revoke execute on function public.bb_finalize(uuid, uuid, text, text, uuid) from public, anon, authenticated;
revoke execute on function public.bb_check_dist(public.courts, float8, float8) from public, anon, authenticated;
revoke execute on function public.bb_new_user() from public, anon, authenticated;
grant execute on function public.resolve_expired() to anon, authenticated;

-- ---------- OPCJONALNIE: automatyczne rozliczanie co 10 min ----------
-- Database → Extensions → włącz "pg_cron", potem uruchom:
-- select cron.schedule('bbkort-resolve', '*/10 * * * *', $$select public.resolve_expired()$$);
