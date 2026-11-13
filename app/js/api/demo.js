// =====================================================================
//  TRYB DEMO – wszystko w localStorage tej przeglądarki.
//  Logika 1:1 z funkcjami RPC w supabase/schema.sql.
// =====================================================================
import { RULES, OPEN_STATUSES, SPORTS, distM, H, M } from '../rules.js';
import { skillKeys } from '../skills.js';

const KEY = 'bbkort_demo_v2';
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const err = (code) => new Error(code);
const clone = (o) => JSON.parse(JSON.stringify(o));

function rng(seed) {
  return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
}
function genSkills(sport, seed, base) {
  const r = rng(seed);
  return Object.fromEntries(skillKeys(sport).map((k) => [k, Math.max(25, Math.min(99, Math.round(base - 15 + r() * 32)))]));
}

function seed() {
  const now = Date.now();
  const iso = (ms) => new Date(ms).toISOString();
  const day = 24 * H;
  const teams = [
    ['t1', 'Mokotów Ballers', 'MKB', '#ff7a1a', 'basketball', 'u1'],
    ['t2', 'Praga Hoopers', 'PRH', '#2ec4b6', 'basketball', 'u4'],
    ['t3', 'Wola Dunk Squad', 'WDS', '#9b5de5', 'basketball', 'u7'],
    ['t4', 'Ursynów Kings', 'URK', '#f15bb5', 'basketball', 'u9'],
    ['f1', 'Żoliborz FC', 'ZFC', '#3a86ff', 'football', 'u20'],
    ['f2', 'Grochów United', 'GRU', '#ef233c', 'football', 'u23'],
  ].map(([id, name, tag, color, sport, captain_id]) => ({ id, name, tag, color, sport, captain_id, rating: null, created_at: iso(now - 30 * day) }));

  let n = 0;
  const P = (id, nick, team_id, sport, position, number, height_cm, base, extra = {}) => ({
    id, nick, team_id, sport, position, number, height_cm, is_admin: false, is_moderator: false,
    skills: base ? { [sport]: genSkills(sport, 7919 * ++n + number, base) } : {},
    skills_pending: null, skills_pending_sport: null, skills_video: null,
    skills_status: base ? 'approved' : 'none', skills_note: null, skills_submitted_at: null,
    ghost_count: 0, created_at: iso(now - 20 * day + n * H), ...extra,
  });
  const profiles = [
    P('admin', 'Admin (Ty)', null, 'basketball', null, null, null, 0, { is_admin: true }),
    P('mod1', 'Sędzia Marek', null, 'football', null, null, null, 0, { is_moderator: true }),
    P('u1', 'Kuba', 't1', 'basketball', 'PG', 3, 183, 82),
    P('u2', 'Szymon', 't1', 'basketball', 'SF', 23, 195, 76),
    P('u3', 'Filip', 't1', 'basketball', 'C', 12, 204, 70, { skills_status: 'pending', skills_submitted_at: iso(now - 3 * H), skills_video: 'https://www.youtube.com/' }),
    P('u4', 'Olek', 't2', 'basketball', 'SG', 7, 188, 80),
    P('u5', 'Mateusz', 't2', 'basketball', 'PF', 34, 199, 72, { ghost_count: 2 }),
    P('u6', 'Igor', 't2', 'basketball', 'PG', 1, 178, 68),
    P('u7', 'Michał', 't3', 'basketball', 'SF', 9, 192, 78),
    P('u8', 'Paweł', 't3', 'basketball', 'C', 15, 207, 74),
    P('u9', 'Bartek', 't4', 'basketball', 'PG', 0, 181, 85),
    P('u10', 'Tymek', 't4', 'basketball', 'SG', 30, 186, 73),
    P('u20', 'Kacper', 'f1', 'football', 'MID', 8, 178, 81),
    P('u21', 'Antek', 'f1', 'football', 'FWD', 9, 182, 77),
    P('u22', 'Wiktor', 'f1', 'football', 'GK', 1, 190, 72),
    P('u23', 'Dawid', 'f2', 'football', 'FWD', 10, 176, 83),
    P('u24', 'Kuba S.', 'f2', 'football', 'DEF', 4, 185, 74),
    P('u11', 'Nowy Gracz', null, 'basketball', 'SF', 8, 190, 0),
  ];
  const u3 = profiles.find((p) => p.id === 'u3');
  u3.skills_pending = Object.fromEntries(Object.entries(u3.skills.basketball).map(([k, v]) => [k, Math.min(99, v + (k === 'block' ? 9 : k === 'defReb' ? 6 : 2))]));
  u3.skills_pending_sport = 'basketball';

  const C = (id, name, sport, lat, lng, address, king, daysAgo, defenses = 0) => ({
    id, external_id: 'demo:' + id, name, sport, lat, lng, address, source: 'demo',
    king_team_id: king, king_since: king ? iso(now - daysAgo * day) : null,
    protected_until: null, defenses, created_at: iso(now - 40 * day),
  });
  const courts = [
    C('c1', 'Pole Mokotowskie – kosz', 'basketball', 52.2128, 21.0005, 'al. Niepodległości', 't1', 9, 4),
    C('c2', 'Park Skaryszewski', 'basketball', 52.2418, 21.0510, 'al. Zieleniecka', 't2', 3, 1),
    C('c3', 'Orlik Wola – kosz', 'basketball', 52.2335, 20.9690, 'ul. Ogrodowa', 't3', 6, 2),
    C('c4', 'Kabaty – boisko osiedlowe', 'basketball', 52.1310, 21.0650, 'ul. Wąwozowa', 't4', 12, 6),
    C('c5', 'Bulwary Wiślane', 'basketball', 52.2400, 21.0300, 'Bulwar Flotylli Wiślanej', null),
    C('c6', 'Ochota – Park Szczęśliwicki', 'basketball', 52.2160, 20.9790, 'ul. Drawska', null),
    C('c10', 'Pole Mokotowskie – kosz 2', 'basketball', 52.2140, 21.0040, 'ul. Żwirki i Wigury', 't1', 5, 1),
    C('c7', 'Orlik Żoliborz', 'football', 52.2680, 20.9850, 'ul. Felińskiego', 'f1', 8, 3),
    C('c8', 'Orlik Grochów', 'football', 52.2450, 21.0880, 'ul. Grochowska', 'f2', 4, 1),
    C('c9', 'Boisko Pole Mokotowskie', 'football', 52.2110, 20.9960, 'al. Niepodległości', null),
  ];

  const ch = (o) => ({
    referee_id: null, challenger_report: null, defender_report: null, score_challenger: null, score_defender: null,
    video_url: null, winner_team_id: null, note: null, resolved_by: null, resolved_at: null, ...o,
  });
  const challenges = [
    ch({ id: 'ch1', court_id: 'c1', challenger_team_id: 't2', defender_team_id: 't1', scheduled_at: iso(now + 30 * H),
      status: 'pending', accept_deadline: iso(now + 30 * H), created_at: iso(now - 4 * H) }),
    ch({ id: 'ch2', court_id: 'c3', challenger_team_id: 't4', defender_team_id: 't3', scheduled_at: iso(now + 10 * M),
      status: 'accepted', accept_deadline: iso(now - 2 * H), referee_id: 'mod1', created_at: iso(now - 8 * H) }),
    ch({ id: 'ch3', court_id: 'c2', challenger_team_id: 't3', defender_team_id: 't2', scheduled_at: iso(now - 3 * day),
      status: 'confirmed', accept_deadline: iso(now - 4 * day), score_challenger: 18, score_defender: 21,
      winner_team_id: 't2', referee_id: 'mod1', resolved_by: 'mod1', resolved_at: iso(now - 3 * day + 2 * H), created_at: iso(now - 5 * day) }),
    ch({ id: 'ch4', court_id: 'c7', challenger_team_id: 'f2', defender_team_id: 'f1', scheduled_at: iso(now - 20 * H),
      status: 'reported', accept_deadline: iso(now - 30 * H), created_at: iso(now - 50 * H),
      challenger_report: { a: 4, b: 3, walkover: false, video: 'https://www.youtube.com/', at: iso(now - 18 * H) },
      // kapitanowie zgłosili różne wyniki – rozstrzyga sędzia
      defender_report: { a: 3, b: 4, walkover: false, video: null, at: iso(now - 17 * H) } }),
  ];

  const challenge_players = [
    ['ch1', 'u4', 't2', null],
    ['ch2', 'u9', 't4', null], ['ch2', 'u10', 't4', null], ['ch2', 'u7', 't3', null], ['ch2', 'u8', 't3', null],
    ['ch4', 'u23', 'f2', iso(now - 20 * H)], ['ch4', 'u24', 'f2', iso(now - 20 * H)],
    ['ch4', 'u20', 'f1', iso(now - 20 * H)], ['ch4', 'u21', 'f1', iso(now - 20 * H)],
  ].map(([challenge_id, player_id, team_id, checked_in_at]) => ({ challenge_id, player_id, team_id, checked_in_at }));

  const court_history = [
    ['c1', 't1', 'claim', null, 9], ['c10', 't1', 'claim', null, 5],
    ['c2', 't3', 'claim', null, 9], ['c2', 't2', 'capture', null, 3.2], ['c2', 't2', 'defend', 'ch3', 3],
    ['c3', 't3', 'claim', null, 6], ['c4', 't4', 'claim', null, 12],
    ['c7', 'f1', 'claim', null, 8], ['c8', 'f2', 'claim', null, 4],
  ].map(([court_id, team_id, event, challenge_id, d], i) => ({ id: i + 1, court_id, team_id, event, challenge_id, at: iso(now - d * day) }));

  return {
    version: 2, time_offset: 0, fake_gps: true, current_user: 'admin',
    teams, profiles, courts, challenges, challenge_players, court_history,
  };
}

export function create() {
  let S;
  try { S = JSON.parse(localStorage.getItem(KEY)); } catch { S = null; }
  if (!S || S.version !== 2) S = seed();

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
  const staff = () => { const p = me(); if (!p.is_admin && !p.is_moderator) throw err('err_not_staff'); return p; };
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
  const validScore = (a, b) => Number.isInteger(a) && Number.isInteger(b) && a >= 0 && b >= 0 && a !== b;

  function finalize(ch, winner, status, note, by) {
    if (!OPEN_STATUSES.includes(ch.status)) return;
    const prev = ch.status;
    Object.assign(ch, { status, winner_team_id: winner, note: note ?? ch.note, resolved_at: iso(now()), resolved_by: by || null });
    if (['accepted', 'reported'].includes(prev) && status !== 'void') {
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
    update_profile({ p_nick, p_position, p_number, p_height, p_sport }) {
      const p = me();
      if (p_nick && p_nick.trim()) p.nick = p_nick.trim().slice(0, 24);
      Object.assign(p, { position: p_position || null, number: p_number ?? null, height_cm: p_height ?? null });
      if (!p.team_id && SPORTS.includes(p_sport)) p.sport = p_sport;
    },
    submit_skills({ p_sport, p_skills, p_video }) {
      const p = me();
      if (!SPORTS.includes(p_sport)) throw err('err_bad_request');
      const vals = Object.values(p_skills || {});
      if (!vals.length || vals.some((v) => typeof v !== 'number' || v < RULES.MIN_SKILL || v > RULES.MAX_SKILL)) throw err('err_bad_skills');
      Object.assign(p, { skills_pending: p_skills, skills_pending_sport: p_sport, skills_video: (p_video || '').trim() || null,
        skills_status: 'pending', skills_note: null, skills_submitted_at: iso(now()) });
    },
    review_skills({ p_player, p_approve, p_note }) {
      staff();
      const p = S.profiles.find((x) => x.id === p_player);
      if (!p || p.skills_status !== 'pending') return;
      if (p_approve) p.skills = { ...(p.skills || {}), [p.skills_pending_sport]: p.skills_pending };
      Object.assign(p, { skills_pending: null, skills_pending_sport: null, skills_status: p_approve ? 'approved' : 'rejected', skills_note: p_note || null });
    },
    // ---- drużyny
    create_team({ p_name, p_tag, p_color, p_sport }) {
      const p = me();
      if (p.team_id) throw err('err_already_in_team');
      const name = (p_name || '').trim(), tag = (p_tag || '').trim().toUpperCase();
      if (!SPORTS.includes(p_sport) || name.length < 3 || name.length > 40 || tag.length < 2 || tag.length > 4) throw err('err_bad_request');
      if (S.teams.some((t) => t.name.toLowerCase() === name.toLowerCase() || t.tag === tag)) throw err('err_team_exists');
      const id = 't' + uid();
      S.teams.push({ id, name, tag, color: p_color || '#ff7a1a', sport: p_sport, captain_id: p.id, rating: null, created_at: iso(now()) });
      Object.assign(p, { team_id: id, sport: p_sport });
      return id;
    },
    join_team({ p_team }) {
      const p = me();
      if (p.team_id) throw err('err_already_in_team');
      const tm = team(p_team);
      if (!tm) throw err('err_not_found');
      Object.assign(p, { team_id: p_team, sport: tm.sport });
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
        const sp = r.sport || 'basketball';
        if (r.lat == null || r.lng == null || !SPORTS.includes(sp)) continue;
        if (S.courts.some((c) => c.external_id === r.external_id)) continue;
        if (S.courts.some((c) => c.sport === sp && distM(c.lat, c.lng, r.lat, r.lng) < 40)) continue;
        S.courts.push({
          id: 'c' + uid(), external_id: r.external_id, name: (r.name || '').slice(0, 80), sport: sp, lat: r.lat, lng: r.lng,
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
      if (c.sport !== team(p.team_id).sport) throw err('err_wrong_sport');
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
      if (c.sport !== team(p.team_id).sport) throw err('err_wrong_sport');
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
        referee_id: null, challenger_report: null, defender_report: null, score_challenger: null, score_defender: null,
        video_url: null, winner_team_id: null, note: null, resolved_by: null, resolved_at: null, created_at: iso(now()),
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
      finalize(ch, ch.challenger_team_id, 'walkover', 'forfeit', p.id);
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
    take_referee({ p_id, p_take }) {
      const p = staff(), ch = getCh(p_id);
      if (!OPEN_STATUSES.includes(ch.status)) throw err('err_bad_state');
      if (p_take) ch.referee_id = p.id;
      else if (ch.referee_id === p.id) ch.referee_id = null;
    },
    report_result({ p_id, p_score_challenger: a, p_score_defender: b, p_video, p_walkover }) {
      const p = me(), ch = getCh(p_id);
      if (!['accepted', 'reported'].includes(ch.status)) throw err('err_bad_state');
      let mine, other;
      if (isCap(p.id, ch.challenger_team_id)) [mine, other] = [ch.challenger_team_id, ch.defender_team_id];
      else if (isCap(p.id, ch.defender_team_id)) [mine, other] = [ch.defender_team_id, ch.challenger_team_id];
      else throw err('err_not_captain');
      const t = T(ch.scheduled_at);
      if (now() < t - RULES.CHECKIN_BEFORE_MIN * M) throw err('err_too_early');
      const video = (p_video || '').trim() || null;
      let rep;
      if (p_walkover) {
        if (now() < t + RULES.WALKOVER_GRACE_MIN * M) throw err('err_too_early');
        if (!checkins(ch, mine)) throw err('err_need_checkins');
        if (checkins(ch, other)) throw err('err_opponent_present');
        rep = { walkover: true, video, at: iso(now()) };
      } else {
        if (!validScore(a, b)) throw err('err_bad_score');
        rep = { a, b, walkover: false, video, at: iso(now()) };
      }
      if (mine === ch.challenger_team_id) ch.challenger_report = rep; else ch.defender_report = rep;
      ch.status = 'reported';
    },
    referee_result({ p_id, p_winner, p_score_challenger: a, p_score_defender: b, p_video, p_note }) {
      const p = staff(), ch = getCh(p_id);
      if (!['accepted', 'reported'].includes(ch.status)) throw err('err_bad_state');
      if (p_winner && ![ch.challenger_team_id, ch.defender_team_id].includes(p_winner)) throw err('err_bad_request');
      const hasScore = a != null && !isNaN(a);
      if (p_winner && hasScore && (!validScore(a, b) || (a > b) !== (p_winner === ch.challenger_team_id))) throw err('err_bad_score');
      const st = !p_winner ? 'void' : hasScore ? 'confirmed' : 'walkover';
      ch.referee_id = ch.referee_id || p.id;
      ch.score_challenger = st === 'confirmed' ? a : null;
      ch.score_defender = st === 'confirmed' ? b : null;
      if ((p_video || '').trim()) ch.video_url = p_video.trim();
      finalize(ch, p_winner || null, st, p_note || (st === 'walkover' ? 'no_show' : null), p.id);
    },
    resolve_expired() {
      let n = 0;
      for (const ch of S.challenges) {
        if (ch.status === 'pending' && T(ch.accept_deadline) < now()) {
          ghost(team(ch.defender_team_id)?.captain_id);
          finalize(ch, ch.challenger_team_id, 'walkover', 'no_response', null); n++;
        } else if (ch.status === 'accepted' && T(ch.scheduled_at) + RULES.MATCH_EXPIRE_HOURS * H < now()) {
          finalize(ch, null, 'expired', 'no_report', null); n++;
        }
      }
      return n;
    },
    // ---- admin
    admin_set_moderator({ p_player, p_on }) {
      admin();
      const p = S.profiles.find((x) => x.id === p_player);
      if (p) p.is_moderator = !!p_on;
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
      users: () => S.profiles.map((p) => ({
        id: p.id, nick: p.nick, team: team(p.team_id)?.tag || '', sport: p.sport,
        captain: isCap(p.id, p.team_id), admin: p.is_admin, moderator: p.is_moderator,
      })),
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
