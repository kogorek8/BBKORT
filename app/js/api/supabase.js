// Backend produkcyjny – Supabase (logowanie, baza, realtime)
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';

export async function create(cfg) {
  const sb = createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  let session = (await sb.auth.getSession()).data.session;
  let changeCb = null;
  sb.auth.onAuthStateChange((_e, s) => { session = s; changeCb && changeCb(); });

  async function all(table) {
    const { data, error } = await sb.from(table).select('*');
    if (error) throw new Error(error.message);
    return data;
  }

  return {
    mode: 'supabase',
    now: () => Date.now(),
    canImport: () => !!session,
    async load() {
      const [teams, profiles, courts, challenges, challenge_players, court_history] = await Promise.all(
        ['teams', 'profiles', 'courts', 'challenges', 'challenge_players', 'court_history'].map(all));
      return { teams, profiles, courts, challenges, challenge_players, court_history };
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
