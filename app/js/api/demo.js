// =====================================================================
//  TRYB DEMO – wszystko w localStorage tej przeglądarki.
//  Logika 1:1 z funkcjami RPC w supabase/schema.sql.
// =====================================================================
import { RULES, OPEN_STATUSES, SPORTS, REVIEW_AREAS, OG_MIN_TOTAL, OG_MIN, distM, H, M } from '../rules.js';
import { skillKeys } from '../skills.js';

const KEY = 'bbkort_demo_v4';
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
    ['t1', 'Baranówka Ballers', 'BRB', '#ff7a1a', 'basketball', 'u1'],
    ['t2', 'Nowe Miasto Hoopers', 'NMH', '#2ec4b6', 'basketball', 'u4'],
    ['t3', 'Drabinianka Dunk', 'DRD', '#9b5de5', 'basketball', 'u7'],
    ['t4', 'Zalesie Kings', 'ZLK', '#f15bb5', 'basketball', 'u9'],
    ['f1', 'Staromieście FC', 'SFC', '#3a86ff', 'football', 'u20'],
    ['f2', 'Pobitno United', 'PBU', '#ef233c', 'football', 'u23'],
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
    protected_until: null, defenses, status: 'active', added_by: null, photo_url: null, created_at: iso(now - 40 * day),
  });
  const courts = [
    C('c1', 'Bulwary nad Wisłokiem – kosz', 'basketball', 50.0335, 22.0010, 'Bulwary', 't1', 9, 4),
    C('c2', 'Park Papieski', 'basketball', 50.0155, 21.9960, 'ul. Sikorskiego', 't2', 3, 1),
    C('c3', 'Baranówka – orlik (kosz)', 'basketball', 50.0560, 21.9850, 'ul. Obrońców Poczty Gdańskiej', 't3', 6, 2),
    C('c4', 'Nowe Miasto – boisko osiedlowe', 'basketball', 50.0190, 22.0200, 'ul. Podwisłocze', 't4', 12, 6),
    C('c5', 'Lisia Góra', 'basketball', 50.0240, 22.0000, 'ul. Kwiatkowskiego', null),
    C('c6', 'Zalesie – boisko', 'basketball', 50.0080, 22.0330, 'ul. Zelwerowicza', null),
    C('c10', 'Bulwary nad Wisłokiem – kosz 2', 'basketball', 50.0352, 22.0035, 'Bulwary', 't1', 5, 1),
    C('c7', 'Orlik Staromieście', 'football', 50.0620, 22.0000, 'ul. Partyzantów', 'f1', 8, 3),
    C('c8', 'Orlik Pobitno', 'football', 50.0430, 22.0300, 'ul. Konfederatów Barskich', 'f2', 4, 1),
    C('c9', 'Boisko Drabinianka', 'football', 50.0150, 22.0180, 'ul. Graniczna', null),
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

  const court_ratings = [
    ['c1', 'u1', { comfort: 5, return: 5, vibe: 5 }, 'Najlepsze kosze w mieście, wieczorem tłoczno.'],
    ['c1', 'u4', { comfort: 4, return: 5, vibe: 4 }, 'Słabe światło po 20:00.'],
    ['c2', 'u7', { comfort: 3, return: 4, vibe: 4 }, null],
    ['c3', 'u9', { comfort: 5, return: 4, vibe: 4 }, 'Orlik zamykany o 22.'],
    ['c7', 'u23', { comfort: 4, return: 3, vibe: 4 }, 'Trzeba rezerwować u gospodarza.'],
    ['c5', 'u2', { comfort: 2, return: 4, vibe: 5 }, 'Super klimat, ale nierówny asfalt.'],
  ].map(([court_id, player_id, scores, comment], i) => ({ court_id, player_id, scores, comment, created_at: iso(now - (i + 1) * day) }));

  const dstr = (ms) => new Date(ms).toISOString().slice(0, 10);
  const court_reviews = [
    { court_id: 'c1', reviewer_id: 'admin', visited_at: dstr(now - 20 * day), valid_until: dstr(now + 345 * day),
      scores: { surface: 22, hoop: 18, space: 12, lines: 8, access: 9, surroundings: 4, regular: 4, players: 9 }, total: 86,
      hazard: false, og_spot: true, og_number: 1,
      summary: 'Równa nawierzchnia poliuretanowa, piłka odbija równo we wszystkich 5 punktach. Kosz na przepisowej wysokości, sztywna obręcz. Boisko żyje – wieczorami zawsze ktoś gra.',
      pros: ['Równe odbicie piłki na całym polu', 'Solidna obręcz i nowa siatka', 'Dostępne 24/7, bez opłat'],
      cons: ['Słabe oświetlenie po zmroku', 'Brak cienia latem'],
      suggestions: [{ text: 'Doświetlić strefę pod koszem', kind: 'invest' }, { text: 'Odmalować linię rzutów wolnych', kind: 'cheap' }],
      photos: [], video_url: 'https://www.youtube.com/', updated_at: iso(now - 19 * day) },
    { court_id: 'c3', reviewer_id: 'admin', visited_at: dstr(now - 9 * day), valid_until: dstr(now + 356 * day),
      scores: { surface: 19, hoop: 10, space: 13, lines: 9, access: 6, surroundings: 4, regular: 4, players: 7 }, total: 72,
      hazard: false, og_spot: false, og_number: null,
      summary: 'Dobre boisko z dużą przestrzenią, ale kosz wymaga naprawy: luźna obręcz i brak siatki. Po poprawkach zapraszamy do ponownej oceny.',
      pros: ['Dużo miejsca do wybiegania', 'Czytelne linie'],
      cons: ['Luźna obręcz', 'Zamykane o 22:00'],
      suggestions: [{ text: 'Dokręcić mocowanie obręczy', kind: 'urgent' }, { text: 'Założyć metalową siatkę', kind: 'cheap' }],
      photos: [], video_url: null, updated_at: iso(now - 8 * day) },
  ];
  const team_requests = [{ team_id: 't1', player_id: 'u11', kind: 'request', created_at: iso(now - 5 * H) }];
  const games = [
    { id: 'g1', court_id: 'c1', host_id: 'u2', sport: 'basketball', starts_at: iso(now + 3 * H), slots: 6, level: 'all', note: 'Luźne 3 na 3, każdy mile widziany', status: 'open', created_at: iso(now - 2 * H) },
    { id: 'g2', court_id: 'c5', host_id: 'u6', sport: 'basketball', starts_at: iso(now + 27 * H), slots: 10, level: 'mid', note: 'Gramy 5 na 5, weźcie wodę', status: 'open', created_at: iso(now - 1 * H) },
    { id: 'g3', court_id: 'c9', host_id: 'u21', sport: 'football', starts_at: iso(now + 50 * H), slots: 12, level: 'beginner', note: null, status: 'open', created_at: iso(now - 3 * H) },
  ];
  const game_players = [['g1', 'u2'], ['g1', 'u5'], ['g1', 'u8'], ['g2', 'u6'], ['g2', 'u1'], ['g2', 'u4'], ['g2', 'u10'], ['g3', 'u21'], ['g3', 'u24']]
    .map(([game_id, player_id]) => ({ game_id, player_id, joined_at: iso(now - H) }));
  const court_issues = [{ id: 1, court_id: 'c3', player_id: 'u8', text: 'Obręcz się rusza, brak siatki', status: 'open', created_at: iso(now - 2 * day) }];

  return {
    version: 4, time_offset: 0, fake_gps: true, current_user: 'admin',
    teams, profiles, courts, challenges, challenge_players, court_history, court_ratings,
    court_reviews, team_requests, games, game_players, court_issues,
  };
}

export function create() {
  let S;
  try { S = JSON.parse(localStorage.getItem(KEY)); } catch { S = null; }
  if (!S || S.version !== 4) S = seed();

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
  const joinTeam = (tid, pid) => {
    const x = S.profiles.find((q) => q.id === pid);
    if (x.team_id) throw err('err_already_in_team');
    Object.assign(x, { team_id: tid, sport: team(tid).sport });
    S.team_requests = S.team_requests.filter((r) => r.player_id !== pid);
  };
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
    join_team({ p_team }) { return R.request_join({ p_team }); },
    request_join({ p_team }) {
      const p = me();
      if (p.team_id) throw err('err_already_in_team');
      if (!team(p_team)) throw err('err_not_found');
      if (S.team_requests.some((r) => r.team_id === p_team && r.player_id === p.id && r.kind === 'invite')) { joinTeam(p_team, p.id); return 'joined'; }
      if (!S.team_requests.some((r) => r.team_id === p_team && r.player_id === p.id)) S.team_requests.push({ team_id: p_team, player_id: p.id, kind: 'request', created_at: iso(now()) });
      return 'requested';
    },
    invite_player({ p_player }) {
      const p = me();
      if (!p.team_id || !isCap(p.id, p.team_id)) throw err('err_not_captain');
      const x = S.profiles.find((q) => q.id === p_player);
      if (!x) throw err('err_not_found');
      if (x.team_id) throw err('err_player_in_team');
      if (S.team_requests.some((r) => r.team_id === p.team_id && r.player_id === p_player && r.kind === 'request')) { joinTeam(p.team_id, p_player); return 'joined'; }
      if (!S.team_requests.some((r) => r.team_id === p.team_id && r.player_id === p_player)) S.team_requests.push({ team_id: p.team_id, player_id: p_player, kind: 'invite', created_at: iso(now()) });
      return 'invited';
    },
    respond_team_request({ p_team, p_player, p_accept }) {
      const p = me();
      const r = S.team_requests.find((x) => x.team_id === p_team && x.player_id === p_player);
      if (!r) throw err('err_not_found');
      const cap = isCap(p.id, p_team);
      if (!cap && p.id !== p_player) throw err('err_not_allowed');
      if (p_accept) {
        if ((r.kind === 'request' && !cap) || (r.kind === 'invite' && p.id !== p_player)) throw err('err_not_allowed');
        joinTeam(p_team, p_player);
      } else S.team_requests = S.team_requests.filter((x) => x !== r);
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
          address: (r.address || '').slice(0, 120), source: r.source || 'manual', status: 'active', added_by: null, photo_url: null,
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
    // ---- oceny boisk
    rate_court({ p_court, p_scores, p_comment }) {
      const p = me();
      getCourt(p_court);
      const vals = Object.values(p_scores || {});
      if (!vals.length || vals.length > 12 || vals.some((v) => !Number.isInteger(v) || v < 1 || v > 5)) throw err('err_bad_rating');
      S.court_ratings = S.court_ratings.filter((r) => !(r.court_id === p_court && r.player_id === p.id));
      S.court_ratings.push({ court_id: p_court, player_id: p.id, scores: p_scores, comment: (p_comment || '').trim().slice(0, 280) || null, created_at: iso(now()) });
    },
    admin_delete_rating({ p_court, p_player }) {
      admin();
      S.court_ratings = S.court_ratings.filter((r) => !(r.court_id === p_court && r.player_id === p_player));
    },
    // ---- OG SPOT: oficjalna karta boiska
    save_court_review({ p_court, p_data }) {
      const p = staff();
      getCourt(p_court);
      const sc = p_data?.scores || {};
      let total = 0;
      for (const a of REVIEW_AREAS) {
        const v = Number(sc[a.key]);
        if (!Number.isInteger(v) || v < 0 || v > a.max) throw err('err_bad_review');
        total += v;
      }
      const hazard = !!p_data.hazard;
      const og = total >= OG_MIN_TOTAL && !hazard && Object.entries(OG_MIN).every(([k, m]) => sc[k] >= m);
      const old = S.court_reviews.find((r) => r.court_id === p_court);
      let num = old?.og_number ?? null;
      if (og && num == null) num = Math.max(0, ...S.court_reviews.map((r) => r.og_number || 0)) + 1;
      const vis = p_data.visited_at || new Date(now()).toISOString().slice(0, 10);
      const until = new Date(Date.parse(vis) + 365 * 24 * H).toISOString().slice(0, 10);
      S.court_reviews = S.court_reviews.filter((r) => r.court_id !== p_court);
      S.court_reviews.push({
        court_id: p_court, reviewer_id: p.id, visited_at: vis, valid_until: until, scores: sc, total, hazard, og_spot: og, og_number: num,
        summary: (p_data.summary || '').trim() || null, pros: p_data.pros || [], cons: p_data.cons || [],
        suggestions: p_data.suggestions || [], photos: p_data.photos || [], video_url: (p_data.video_url || '').trim() || null, updated_at: iso(now()),
      });
      if ('photo_url' in p_data) getCourt(p_court).photo_url = (p_data.photo_url || '').trim() || null;
    },
    delete_court_review({ p_court }) { admin(); S.court_reviews = S.court_reviews.filter((r) => r.court_id !== p_court); },
    // ---- boiska zgłaszane przez graczy
    suggest_court({ p_name, p_sport, p_lat, p_lng, p_address }) {
      const p = me();
      if (!SPORTS.includes(p_sport) || p_lat == null || p_lng == null || (p_name || '').trim().length < 3) throw err('err_bad_request');
      if (S.courts.some((c) => c.sport === p_sport && distM(c.lat, c.lng, p_lat, p_lng) < 40)) throw err('err_court_exists');
      const isStaff = p.is_admin || p.is_moderator;
      const id = 'c' + uid();
      S.courts.push({ id, external_id: null, name: p_name.trim().slice(0, 80), sport: p_sport, lat: p_lat, lng: p_lng, address: (p_address || '').slice(0, 120),
        source: 'user', status: isStaff ? 'active' : 'pending', added_by: p.id, photo_url: null,
        king_team_id: null, king_since: null, protected_until: null, defenses: 0, created_at: iso(now()) });
      return id;
    },
    review_court({ p_court, p_approve }) {
      staff();
      const c = getCourt(p_court);
      if (c.status !== 'pending') return;
      if (p_approve) c.status = 'active'; else S.courts = S.courts.filter((x) => x.id !== p_court);
    },
    // ---- otwarte gry
    create_game({ p_court, p_time, p_slots, p_level, p_note }) {
      const p = me();
      const c = getCourt(p_court);
      const t = T(p_time);
      if (isNaN(t) || t < now() - 10 * M || t > now() + 30 * 24 * H) throw err('err_bad_time_game');
      if (!Number.isInteger(p_slots) || p_slots < 2 || p_slots > 40) throw err('err_bad_request');
      const id = 'g' + uid();
      S.games.push({ id, court_id: c.id, host_id: p.id, sport: c.sport, starts_at: iso(t), slots: p_slots, level: p_level || 'all', note: (p_note || '').trim().slice(0, 200) || null, status: 'open', created_at: iso(now()) });
      S.game_players.push({ game_id: id, player_id: p.id, joined_at: iso(now()) });
      return id;
    },
    join_game({ p_game }) {
      const p = me();
      const g = S.games.find((x) => x.id === p_game && x.status === 'open');
      if (!g) throw err('err_not_found');
      if (S.game_players.some((x) => x.game_id === g.id && x.player_id === p.id)) return;
      if (S.game_players.filter((x) => x.game_id === g.id).length >= g.slots) throw err('err_game_full');
      S.game_players.push({ game_id: g.id, player_id: p.id, joined_at: iso(now()) });
    },
    leave_game({ p_game }) {
      const p = me();
      const g = S.games.find((x) => x.id === p_game);
      if (!g) return;
      if (g.host_id === p.id || p.is_admin) g.status = 'cancelled';
      else S.game_players = S.game_players.filter((x) => !(x.game_id === g.id && x.player_id === p.id));
    },
    // ---- usterki
    report_issue({ p_court, p_text }) {
      const p = me();
      getCourt(p_court);
      if ((p_text || '').trim().length < 3) throw err('err_bad_request');
      S.court_issues.push({ id: Date.now(), court_id: p_court, player_id: p.id, text: p_text.trim().slice(0, 300), status: 'open', created_at: iso(now()) });
    },
    resolve_issue({ p_id }) { staff(); const i = S.court_issues.find((x) => String(x.id) === String(p_id)); if (i) i.status = 'resolved'; },
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
      S.court_ratings = S.court_ratings.filter((r) => r.court_id !== p_court);
    },
  };

  const changed = () => { save(); changeCb && changeCb(); };

  return {
    mode: 'demo',
    now,
    canImport: () => true,
    async load() {
      const { teams, profiles, courts, challenges, challenge_players, court_history, court_ratings,
        court_reviews, team_requests, games, game_players, court_issues } = S;
      return clone({ teams, profiles, courts, challenges, challenge_players, court_history, court_ratings,
        court_reviews, team_requests, games, game_players, court_issues });
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
