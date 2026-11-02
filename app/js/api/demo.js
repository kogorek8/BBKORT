// =====================================================================
//  TRYB DEMO – wszystko w localStorage tej przeglądarki.
//  Logika 1:1 z funkcjami RPC w supabase/schema.sql.
// =====================================================================
import { RULES, OPEN_STATUSES, distM, H, M } from '../rules.js';
import { ALL_SKILLS } from '../skills.js';

const KEY = 'bbkort_demo_v1';
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const err = (code) => new Error(code);
const clone = (o) => JSON.parse(JSON.stringify(o));

function rng(seed) {
  return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
}

function genSkills(seed, base) {
  const r = rng(seed);
  return Object.fromEntries(ALL_SKILLS.map((k) => [k, Math.max(25, Math.min(99, Math.round(base - 15 + r() * 32)))]));
}

function seed() {
  const now = Date.now();
  const iso = (ms) => new Date(ms).toISOString();
  const teams = [
    { id: 't1', name: 'Mokotów Ballers', tag: 'MKB', color: '#ff7a1a', captain_id: 'u1' },
    { id: 't2', name: 'Praga Hoopers', tag: 'PRH', color: '#2ec4b6', captain_id: 'u4' },
    { id: 't3', name: 'Wola Dunk Squad', tag: 'WDS', color: '#9b5de5', captain_id: 'u7' },
    { id: 't4', name: 'Ursynów Kings', tag: 'URK', color: '#f15bb5', captain_id: 'u9' },
  ].map((t) => ({ ...t, rating: null, created_at: iso(now - 30 * 24 * H) }));

  const P = (id, nick, team_id, position, number, height_cm, base, extra = {}) => ({
    id, nick, team_id, position, number, height_cm, is_admin: false,
    skills: genSkills(id.charCodeAt(1) * 977 + number, base),
    skills_pending: null, skills_video: null, skills_status: 'approved', skills_note: null,
    skills_submitted_at: null, ghost_count: 0, created_at: iso(now - 20 * 24 * H), ...extra,
  });
  const profiles = [
    { ...P('admin', 'Admin (Ty)', null, null, null, null, 50), skills: null, skills_status: 'none', is_admin: true },
    P('u1', 'Kuba', 't1', 'PG', 3, 183, 82),
    P('u2', 'Szymon', 't1', 'SF', 23, 195, 76),
    P('u3', 'Filip', 't1', 'C', 12, 204, 70, {
      skills_status: 'pending', skills_submitted_at: iso(now - 3 * H),
      skills_video: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    }),
    P('u4', 'Olek', 't2', 'SG', 7, 188, 80),
    P('u5', 'Mateusz', 't2', 'PF', 34, 199, 72, { ghost_count: 2 }),
    P('u6', 'Igor', 't2', 'PG', 1, 178, 68),
    P('u7', 'Michał', 't3', 'SF', 9, 192, 78),
    P('u8', 'Paweł', 't3', 'C', 15, 207, 74),
    P('u9', 'Bartek', 't4', 'PG', 0, 181, 85),
    P('u10', 'Tymek', 't4', 'SG', 30, 186, 73),
    { ...P('u11', 'Nowy Gracz', null, 'SF', 8, 190, 50), skills: null, skills_status: 'none' },
  ];
  const u3 = profiles.find((p) => p.id === 'u3');
  u3.skills_pending = Object.fromEntries(Object.entries(u3.skills).map(([k, v]) => [k, Math.min(99, v + (k === 'block' ? 9 : k === 'defReb' ? 6 : 2))]));

  const C = (id, name, lat, lng, address, king, daysAgo, defenses = 0) => ({
    id, external_id: 'demo:' + id, name, lat, lng, address, source: 'demo',
    king_team_id: king, king_since: king ? iso(now - daysAgo * 24 * H) : null,
    protected_until: null, defenses, created_at: iso(now - 40 * 24 * H),
  });
  const courts = [
    C('c1', 'Pole Mokotowskie – kosz', 52.2128, 21.0005, 'al. Niepodległości', 't1', 9, 4),
    C('c2', 'Park Skaryszewski', 52.2418, 21.0510, 'al. Zieleniecka', 't2', 3, 1),
    C('c3', 'Orlik Wola', 52.2335, 20.9690, 'ul. Ogrodowa', 't3', 6, 2),
    C('c4', 'Kabaty – boisko osiedlowe', 52.1310, 21.0650, 'ul. Wąwozowa', 't4', 12, 6),
    C('c5', 'Bulwary Wiślane', 52.2400, 21.0300, 'Bulwar Flotylli Wiślanej', null),
    C('c6', 'Ochota – Park Szczęśliwicki', 52.2160, 20.9790, 'ul. Drawska', null),
  ];

  const challenges = [
    { id: 'ch1', court_id: 'c1', challenger_team_id: 't2', defender_team_id: 't1',
      scheduled_at: iso(now + 26 * H), status: 'pending', accept_deadline: iso(now + 20 * H),
      created_at: iso(now - 4 * H) },
    { id: 'ch2', court_id: 'c3', challenger_team_id: 't4', defender_team_id: 't3',
      scheduled_at: iso(now + 10 * M), status: 'accepted', accept_deadline: iso(now - 2 * H),
      created_at: iso(now - 8 * H) },
    { id: 'ch3', court_id: 'c2', challenger_team_id: 't3', defender_team_id: 't2',
      scheduled_at: iso(now - 3 * 24 * H), status: 'confirmed', accept_deadline: iso(now - 4 * 24 * H),
      score_challenger: 18, score_defender: 21, winner_team_id: 't2', resolved_at: iso(now - 3 * 24 * H + 2 * H),
      created_at: iso(now - 5 * 24 * H) },
  ].map((c) => ({
    score_challenger: null, score_defender: null, reported_by_team: null, reported_at: null,
    confirm_deadline: null, challenger_confirmed: false, defender_confirmed: false,
    winner_team_id: null, note: null, resolved_at: null, ...c,
  }));

  const challenge_players = [
    { challenge_id: 'ch1', player_id: 'u4', team_id: 't2', checked_in_at: null },
    { challenge_id: 'ch2', player_id: 'u9', team_id: 't4', checked_in_at: null },
    { challenge_id: 'ch2', player_id: 'u10', team_id: 't4', checked_in_at: null },
    { challenge_id: 'ch2', player_id: 'u7', team_id: 't3', checked_in_at: null },
    { challenge_id: 'ch2', player_id: 'u8', team_id: 't3', checked_in_at: null },
  ];

  const court_history = [
    { id: 1, court_id: 'c1', team_id: 't1', event: 'claim', challenge_id: null, at: iso(now - 9 * 24 * H) },
    { id: 2, court_id: 'c2', team_id: 't3', event: 'claim', challenge_id: null, at: iso(now - 9 * 24 * H) },
    { id: 3, court_id: 'c2', team_id: 't2', event: 'capture', challenge_id: null, at: iso(now - 3 * 24 * H) },
    { id: 4, court_id: 'c2', team_id: 't2', event: 'defend', challenge_id: 'ch3', at: iso(now - 3 * 24 * H + 2 * H) },
    { id: 5, court_id: 'c3', team_id: 't3', event: 'claim', challenge_id: null, at: iso(now - 6 * 24 * H) },
    { id: 6, court_id: 'c4', team_id: 't4', event: 'claim', challenge_id: null, at: iso(now - 12 * 24 * H) },
  ];

  return {
    version: 1, time_offset: 0, fake_gps: true, current_user: 'admin',
    teams, profiles, courts, challenges, challenge_players, court_history,
  };
}

export function create() {
  let S;
  try { S = JSON.parse(localStorage.getItem(KEY)); } catch { S = null; }
  if (!S || S.version !== 1) S = seed();

  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* ignore */ } };
  const now = () => Date.now() + S.time_offset;
  const iso = (ms) => new Date(ms).toISOString();
  const T = (s) => Date.parse(s);
  let changeCb = null;

  const me = () => {
    const p = S.profiles.find((x) => x.id === S.current_user);
    if (!p) throw err('err_auth');
    return p;
  };
  const admin = () => { const p = me(); if (!p.is_admin) throw err('err_not_admin'); return p; };
  const team = (id) => S.teams.find((t) => t.id === id);
  const isCap = (pid, tid) => team(tid)?.captain_id === pid;
  const getCourt = (id) => { const c = S.courts.find((x) => x.id === id); if (!c) throw err('err_not_found'); return c; };
  const getCh = (id) => { const c = S.challenges.find((x) => x.id === id); if (!c) throw err('err_not_found'); return c; };
  const checkDist = (c, lat, lng) => {
    if (S.fake_gps) return;
    if (lat == null || lng == null) throw err('err_no_gps');
    if (distM(lat, lng, c.lat, c.lng) > RULES.CHECKIN_RADIUS_M) throw err('err_too_far');
  };
  const checkins = (ch, tid) => S.challenge_players.filter((x) => x.challenge_id === ch.id && x.team_id === tid && x.checked_in_at).length;
  const ghost = (pid) => { const p = S.profiles.find((x) => x.id === pid); if (p) p.ghost_count++; };
  const history = (court_id, team_id, event, challenge_id = null) =>
    S.court_history.push({ id: Date.now() + Math.random(), court_id, team_id, event, challenge_id, at: iso(now()) });

  function finalize(ch, winner, status, note) {
    if (!OPEN_STATUSES.includes(ch.status)) return;
    const prev = ch.status;
    Object.assign(ch, { status, winner_team_id: winner, note: note ?? ch.note, resolved_at: iso(now()) });
    if (['accepted', 'reported', 'disputed'].includes(prev)) {
      S.challenge_players.filter((x) => x.challenge_id === ch.id && !x.checked_in_at).forEach((x) => ghost(x.player_id));
    }
    if (!winner) return;
    const c = S.courts.find((x) => x.id === ch.court_id);
    if (!c) return;
    if (winner === ch.challenger_team_id) {
      Object.assign(c, { king_team_id: winner, king_since: iso(now()), defenses: 0, protected_until: iso(now() + RULES.PROTECTION_HOURS * H) });
      history(c.id, winner, 'capture', ch.id);
    } else {
      c.defenses++;
      c.protected_until = iso(now() + RULES.PROTECTION_HOURS * H);
      history(c.id, winner, 'defend', ch.id);
    }
  }

  const R = {
    // ---- profil i skille
    update_profile({ p_nick, p_position, p_number, p_height }) {
      const p = me();
      if (p_nick && p_nick.trim()) p.nick = p_nick.trim().slice(0, 24);
      Object.assign(p, { position: p_position || null, number: p_number ?? null, height_cm: p_height ?? null });
    },
    submit_skills({ p_skills, p_video }) {
      const p = me();
      const vals = Object.values(p_skills || {});
      if (!vals.length || vals.some((v) => typeof v !== 'number' || v < RULES.MIN_SKILL || v > RULES.MAX_SKILL)) throw err('err_bad_skills');
      Object.assign(p, { skills_pending: p_skills, skills_video: (p_video || '').trim() || null, skills_status: 'pending', skills_note: null, skills_submitted_at: iso(now()) });
    },
    review_skills({ p_player, p_approve, p_note }) {
      admin();
      const p = S.profiles.find((x) => x.id === p_player);
      if (!p || p.skills_status !== 'pending') return;
      if (p_approve) Object.assign(p, { skills: p.skills_pending || p.skills, skills_pending: null, skills_status: 'approved', skills_note: p_note || null });
      else Object.assign(p, { skills_pending: null, skills_status: 'rejected', skills_note: p_note || null });
    },
    // ---- drużyny
    create_team({ p_name, p_tag, p_color }) {
      const p = me();
      if (p.team_id) throw err('err_already_in_team');
      const name = (p_name || '').trim(), tag = (p_tag || '').trim().toUpperCase();
      if (name.length < 3 || name.length > 40 || tag.length < 2 || tag.length > 4) throw err('err_bad_request');
      if (S.teams.some((t) => t.name.toLowerCase() === name.toLowerCase() || t.tag === tag)) throw err('err_team_exists');
      const id = 't' + uid();
      S.teams.push({ id, name, tag, color: p_color || '#ff7a1a', captain_id: p.id, rating: null, created_at: iso(now()) });
      p.team_id = id;
      return id;
    },
    join_team({ p_team }) {
      const p = me();
      if (p.team_id) throw err('err_already_in_team');
      if (!team(p_team)) throw err('err_not_found');
      p.team_id = p_team;
    },
    leave_team() {
      const p = me();
      const tid = p.team_id;
      if (!tid) return;
      p.team_id = null;
      if (isCap(p.id, tid)) {
        const next = S.profiles.filter((x) => x.team_id === tid).sort((a, b) => T(a.created_at) - T(b.created_at))[0];
        if (next) team(tid).captain_id = next.id;
        else {
          S.teams = S.teams.filter((t) => t.id !== tid);
          S.courts.forEach((c) => { if (c.king_team_id === tid) Object.assign(c, { king_team_id: null, king_since: null, protected_until: null, defenses: 0 }); });
          const dead = new Set(S.challenges.filter((c) => c.challenger_team_id === tid || c.defender_team_id === tid).map((c) => c.id));
          S.challenges = S.challenges.filter((c) => !dead.has(c.id));
          S.challenge_players = S.challenge_players.filter((x) => !dead.has(x.challenge_id));
        }
      }
    },
    kick_member({ p_player }) {
      const p = me();
      if (!p.team_id || !isCap(p.id, p.team_id)) throw err('err_not_captain');
      if (p_player === p.id) throw err('err_bad_request');
      const x = S.profiles.find((q) => q.id === p_player && q.team_id === p.team_id);
      if (x) x.team_id = null;
    },
    // ---- boiska
    import_courts({ p_courts }) {
      me();
      let n = 0;
      for (const r of p_courts || []) {
        if (r.lat == null || r.lng == null) continue;
        if (S.courts.some((c) => c.external_id === r.external_id)) continue;
        if (S.courts.some((c) => distM(c.lat, c.lng, r.lat, r.lng) < 40)) continue;
        S.courts.push({
          id: 'c' + uid(), external_id: r.external_id, name: (r.name || '').slice(0, 80), lat: r.lat, lng: r.lng,
          address: (r.address || '').slice(0, 120), source: r.source || 'manual',
          king_team_id: null, king_since: null, protected_until: null, defenses: 0, created_at: iso(now()),
        });
        n++;
      }
      return n;
    },
    claim_court({ p_court, p_lat, p_lng }) {
      const p = me();
      if (!p.team_id) throw err('err_no_team');
      const c = getCourt(p_court);
      if (c.king_team_id) throw err('err_court_taken');
      checkDist(c, p_lat, p_lng);
      Object.assign(c, { king_team_id: p.team_id, king_since: iso(now()), defenses: 0, protected_until: iso(now() + RULES.PROTECTION_HOURS * H) });
      history(c.id, p.team_id, 'claim');
    },
    // ---- wyzwania
    create_challenge({ p_court, p_time }) {
      const p = me();
      if (!p.team_id) throw err('err_no_team');
      if (!isCap(p.id, p.team_id)) throw err('err_not_captain');
      const c = getCourt(p_court);
      if (!c.king_team_id) throw err('err_court_free');
      if (c.king_team_id === p.team_id) throw err('err_own_court');
      if (c.protected_until && T(c.protected_until) > now()) throw err('err_protected');
      if (S.challenges.some((x) => x.court_id === c.id && OPEN_STATUSES.includes(x.status))) throw err('err_court_busy');
      const t = T(p_time);
      if (isNaN(t) || t < now() + RULES.MIN_LEAD_MIN * M || t > now() + RULES.MAX_LEAD_DAYS * 24 * H) throw err('err_bad_time');
      const id = 'ch' + uid();
      S.challenges.push({
        id, court_id: c.id, challenger_team_id: p.team_id, defender_team_id: c.king_team_id,
        scheduled_at: iso(t), status: 'pending', accept_deadline: iso(Math.min(now() + RULES.ACCEPT_HOURS * H, t)),
        score_challenger: null, score_defender: null, reported_by_team: null, reported_at: null, confirm_deadline: null,
        challenger_confirmed: false, defender_confirmed: false, winner_team_id: null, note: null, resolved_at: null,
        created_at: iso(now()),
      });
      S.challenge_players.push({ challenge_id: id, player_id: p.id, team_id: p.team_id, checked_in_at: null });
      return id;
    },
    cancel_challenge({ p_id }) {
      const p = me(), ch = getCh(p_id);
      if (ch.status !== 'pending') throw err('err_bad_state');
      if (!isCap(p.id, ch.challenger_team_id)) throw err('err_not_captain');
      Object.assign(ch, { status: 'cancelled', resolved_at: iso(now()) });
    },
    accept_challenge({ p_id }) {
      const p = me(), ch = getCh(p_id);
      if (ch.status !== 'pending') throw err('err_bad_state');
      if (!isCap(p.id, ch.defender_team_id)) throw err('err_not_captain');
      ch.status = 'accepted';
      if (!S.challenge_players.some((x) => x.challenge_id === ch.id && x.player_id === p.id))
        S.challenge_players.push({ challenge_id: ch.id, player_id: p.id, team_id: ch.defender_team_id, checked_in_at: null });
    },
    forfeit_challenge({ p_id }) {
      const p = me(), ch = getCh(p_id);
      if (!['pending', 'accepted'].includes(ch.status)) throw err('err_bad_state');
      if (!isCap(p.id, ch.defender_team_id)) throw err('err_not_captain');
      ch.status = 'pending';
      finalize(ch, ch.challenger_team_id, 'walkover', 'forfeit');
    },
    join_match({ p_id }) {
      const p = me(), ch = getCh(p_id);
      if (!['pending', 'accepted'].includes(ch.status)) throw err('err_bad_state');
      if (!p.team_id || ![ch.challenger_team_id, ch.defender_team_id].includes(p.team_id)) throw err('err_not_in_match');
      if (!S.challenge_players.some((x) => x.challenge_id === ch.id && x.player_id === p.id))
        S.challenge_players.push({ challenge_id: ch.id, player_id: p.id, team_id: p.team_id, checked_in_at: null });
    },
    leave_match({ p_id }) {
      const p = me(), ch = getCh(p_id);
      if (!['pending', 'accepted'].includes(ch.status)) throw err('err_bad_state');
      if (now() > T(ch.scheduled_at) - RULES.CHECKIN_BEFORE_MIN * M) throw err('err_too_late');
      S.challenge_players = S.challenge_players.filter((x) => !(x.challenge_id === ch.id && x.player_id === p.id && !x.checked_in_at));
    },
    check_in({ p_id, p_lat, p_lng }) {
      const p = me(), ch = getCh(p_id);
      if (ch.status !== 'accepted') throw err('err_bad_state');
      if (!p.team_id || ![ch.challenger_team_id, ch.defender_team_id].includes(p.team_id)) throw err('err_not_in_match');
      const t = T(ch.scheduled_at);
      if (now() < t - RULES.CHECKIN_BEFORE_MIN * M) throw err('err_too_early');
      if (now() > t + RULES.WALKOVER_GRACE_MIN * M) throw err('err_too_late');
      checkDist(getCourt(ch.court_id), p_lat, p_lng);
      let row = S.challenge_players.find((x) => x.challenge_id === ch.id && x.player_id === p.id);
      if (!row) S.challenge_players.push(row = { challenge_id: ch.id, player_id: p.id, team_id: p.team_id, checked_in_at: null });
      row.checked_in_at = row.checked_in_at || iso(now());
    },
    report_result({ p_id, p_score_challenger: a, p_score_defender: b }) {
      const p = me(), ch = getCh(p_id);
      if (ch.status !== 'accepted') throw err('err_bad_state');
      const side = isCap(p.id, ch.challenger_team_id) ? 'c' : isCap(p.id, ch.defender_team_id) ? 'd' : null;
      if (!side) throw err('err_not_captain');
      if (now() < T(ch.scheduled_at) - RULES.CHECKIN_BEFORE_MIN * M) throw err('err_too_early');
      if (!checkins(ch, ch.challenger_team_id) || !checkins(ch, ch.defender_team_id)) throw err('err_need_checkins');
      if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0 || a === b) throw err('err_bad_score');
      Object.assign(ch, {
        status: 'reported', score_challenger: a, score_defender: b,
        reported_by_team: side === 'c' ? ch.challenger_team_id : ch.defender_team_id,
        reported_at: iso(now()), confirm_deadline: iso(now() + RULES.CONFIRM_HOURS * H),
        challenger_confirmed: side === 'c', defender_confirmed: side === 'd',
      });
    },
    confirm_result({ p_id, p_agree }) {
      const p = me(), ch = getCh(p_id);
      if (ch.status !== 'reported') throw err('err_bad_state');
      if (!ch.challenger_confirmed && isCap(p.id, ch.challenger_team_id)) ch.challenger_confirmed = !!p_agree;
      else if (!ch.defender_confirmed && isCap(p.id, ch.defender_team_id)) ch.defender_confirmed = !!p_agree;
      else throw err('err_not_captain');
      if (!p_agree) { ch.status = 'disputed'; return; }
      finalize(ch, ch.score_challenger > ch.score_defender ? ch.challenger_team_id : ch.defender_team_id, 'confirmed', null);
    },
    claim_walkover({ p_id }) {
      const p = me(), ch = getCh(p_id);
      if (ch.status !== 'accepted') throw err('err_bad_state');
      let mine, other;
      if (isCap(p.id, ch.challenger_team_id)) [mine, other] = [ch.challenger_team_id, ch.defender_team_id];
      else if (isCap(p.id, ch.defender_team_id)) [mine, other] = [ch.defender_team_id, ch.challenger_team_id];
      else throw err('err_not_captain');
      if (now() < T(ch.scheduled_at) + RULES.WALKOVER_GRACE_MIN * M) throw err('err_too_early');
      if (!checkins(ch, mine)) throw err('err_need_checkins');
      if (checkins(ch, other)) throw err('err_opponent_present');
      finalize(ch, mine, 'walkover', 'no_show');
    },
    resolve_expired() {
      let n = 0;
      const capOf = (tid) => team(tid)?.captain_id;
      for (const ch of S.challenges) {
        if (ch.status === 'pending' && T(ch.accept_deadline) < now()) {
          ghost(capOf(ch.defender_team_id));
          finalize(ch, ch.challenger_team_id, 'walkover', 'no_response'); n++;
        } else if (ch.status === 'accepted' && T(ch.scheduled_at) + RULES.MATCH_EXPIRE_HOURS * H < now()) {
          const a = checkins(ch, ch.challenger_team_id), b = checkins(ch, ch.defender_team_id);
          if (a && !b) finalize(ch, ch.challenger_team_id, 'walkover', 'no_show');
          else if (b && !a) finalize(ch, ch.defender_team_id, 'walkover', 'no_show');
          else finalize(ch, null, 'expired', 'no_report');
          n++;
        } else if (ch.status === 'reported' && T(ch.confirm_deadline) < now()) {
          if (ch.challenger_confirmed && !ch.defender_confirmed) {
            ghost(capOf(ch.defender_team_id)); finalize(ch, ch.challenger_team_id, 'walkover', 'no_confirm');
          } else if (ch.defender_confirmed && !ch.challenger_confirmed) {
            ghost(capOf(ch.challenger_team_id)); finalize(ch, ch.defender_team_id, 'walkover', 'no_confirm');
          } else finalize(ch, null, 'expired', 'no_confirm');
          n++;
        }
      }
      return n;
    },
    // ---- admin
    admin_resolve({ p_id, p_winner }) {
      admin();
      const ch = getCh(p_id);
      if (!OPEN_STATUSES.includes(ch.status)) throw err('err_bad_state');
      if (!p_winner) finalize(ch, null, 'void', 'admin');
      else if ([ch.challenger_team_id, ch.defender_team_id].includes(p_winner)) finalize(ch, p_winner, 'confirmed', 'admin');
      else throw err('err_bad_request');
    },
    admin_reset_court({ p_court }) {
      admin();
      S.challenges.forEach((x) => { if (x.court_id === p_court && OPEN_STATUSES.includes(x.status)) Object.assign(x, { status: 'cancelled', note: 'admin', resolved_at: iso(now()) }); });
      Object.assign(getCourt(p_court), { king_team_id: null, king_since: null, protected_until: null, defenses: 0 });
      history(p_court, null, 'reset');
    },
    admin_delete_court({ p_court }) {
      admin();
      S.courts = S.courts.filter((c) => c.id !== p_court);
      const dead = new Set(S.challenges.filter((c) => c.court_id === p_court).map((c) => c.id));
      S.challenges = S.challenges.filter((c) => !dead.has(c.id));
      S.court_history = S.court_history.filter((h) => h.court_id !== p_court);
    },
  };

  const changed = () => { save(); changeCb && changeCb(); };

  return {
    mode: 'demo',
    now,
    canImport: () => true,
    async load() {
      const { teams, profiles, courts, challenges, challenge_players, court_history } = S;
      return clone({ teams, profiles, courts, challenges, challenge_players, court_history });
    },
    async me(data) { return data.profiles.find((p) => p.id === S.current_user) || null; },
    async rpc(name, args) {
      const fn = R[name];
      if (!fn) throw err('err_unknown');
      const res = fn(args || {});
      save();
      return res;
    },
    onChange(cb) { changeCb = cb; },
    async signOut() {},
    // --- narzędzia demo
    demo: {
      users: () => S.profiles.map((p) => ({ id: p.id, nick: p.nick, team: team(p.team_id)?.tag || '', captain: isCap(p.id, p.team_id), admin: p.is_admin })),
      currentUser: () => S.current_user,
      switchUser(id) { S.current_user = id; changed(); },
      shiftTime(ms) { S.time_offset += ms; R.resolve_expired(); changed(); },
      timeOffset: () => S.time_offset,
      fakeGps: () => S.fake_gps,
      setFakeGps(v) { S.fake_gps = !!v; changed(); },
      reset() { S = seed(); changed(); },
    },
  };
}
