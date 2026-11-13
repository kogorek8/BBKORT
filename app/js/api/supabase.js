// Backend produkcyjny – Supabase (logowanie, baza, realtime)
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';

export async function create(cfg) {
  const sb = createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  let session = (await sb.auth.getSession()).data.session;
  let changeCb = null;
  sb.auth.onAuthStateChange((_e, s) => { session = s; changeCb && changeCb(); });

  // pobiera całą tabelę partiami po 1000 wierszy (limit Supabase)
  async function all(table, optional = false) {
    const out = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb.from(table).select('*').range(from, from + 999);
      if (error) { if (optional) return out; throw new Error(error.message); }
      out.push(...data);
      if (data.length < 1000) return out;
    }
  }

  return {
    mode: 'supabase',
    now: () => Date.now(),
    canImport: () => !!session,
    async load() {
      // tabele z migracji 2 i 3 są opcjonalne – ich brak nie psuje aplikacji
      const [teams, profiles, courts, challenges, challenge_players, court_history,
        court_ratings, court_reviews, team_requests, games, game_players, court_issues] = await Promise.all([
        all('teams'), all('profiles'), all('courts'), all('challenges'), all('challenge_players'), all('court_history'),
        all('court_ratings', true), all('court_reviews', true), all('team_requests', true),
        all('games', true), all('game_players', true), all('court_issues', true),
      ]);
      return { teams, profiles, courts, challenges, challenge_players, court_history,
        court_ratings, court_reviews, team_requests, games, game_players, court_issues };
    },
    async me(data) {
      if (!session) return null;
      return data.profiles.find((p) => p.id === session.user.id) || { id: session.user.id, nick: session.user.email, _missing: true };
    },
    async rpc(name, args) {
      const { data, error } = await sb.rpc(name, args || {});
      if (error) throw new Error(error.message);
      return data;
    },
    async signIn(email, password) {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw new Error(error.message);
    },
    async signUp(email, password, nick) {
      const { data, error } = await sb.auth.signUp({ email, password, options: { data: { nick } } });
      if (error) throw new Error(error.message);
      return { needsConfirm: !data.session };
    },
    async resetPassword(email) {
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.href.split('#')[0] });
      if (error) throw new Error(error.message);
    },
    async signOut() { await sb.auth.signOut(); },
    onChange(cb) {
      changeCb = cb;
      sb.channel('bbkort-all')
        .on('postgres_changes', { event: '*', schema: 'public' }, () => cb())
        .subscribe();
    },
  };
}
