// Backend produkcyjny – Supabase (logowanie, baza, realtime)
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';

export async function create(cfg) {
  const sb = createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  let session = (await sb.auth.getSession()).data.session;
  let changeCb = null;
  sb.auth.onAuthStateChange((_e, s) => { session = s; changeCb && changeCb(); });

  // pobiera całą tabelę partiami po 1000 wierszy (limit Supabase); mod = dodatkowy filtr
  async function all(table, optional = false, mod = null) {
    const out = [];
    for (let from = 0; ; from += 1000) {
      let q = sb.from(table).select('*');
      if (mod) q = mod(q);
      const { data, error } = await q.range(from, from + 999);
      if (error) { if (optional) return out; throw new Error(error.message); }
      out.push(...data);
      if (data.length < 1000) return out;
    }
  }
  // jedna strona wyników (np. ostatnie powiadomienia)
  async function page(table, mod) {
    const { data, error } = await mod(sb.from(table).select('*'));
    return error ? [] : data;
  }

  return {
    mode: 'supabase',
    now: () => Date.now(),
    canImport: () => !!session,
    async load() {
      // tabele z migracji 2–4 są opcjonalne – ich brak nie psuje aplikacji
      const recent = new Date(Date.now() - 3 * 3600e3).toISOString();
      const names = ['court_ratings', 'court_reviews', 'team_requests', 'games', 'game_players', 'court_issues',
        'challenge_backers', 'match_stats', 'player_badges', 'posts', 'shop_items', 'drops', 'purchases', 'coin_ledger'];
      const [teams, profiles, courts, challenges, challenge_players, court_history, court_presence, notifications, ...opt] = await Promise.all([
        all('teams'), all('profiles'), all('courts'), all('challenges'), all('challenge_players'), all('court_history'),
        all('court_presence', true, (q) => q.gte('at', recent)),
        session ? page('notifications', (q) => q.order('created_at', { ascending: false }).limit(40)) : [],
        ...names.map((n) => all(n, true)),
      ]);
      const d = { teams, profiles, courts, challenges, challenge_players, court_history, court_presence, notifications };
      names.forEach((n, i) => (d[n] = opt[i]));
      return d;
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
