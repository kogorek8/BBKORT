// =====================================================================
//  TRYB DEMO – wszystko w localStorage tej przeglądarki.
//  Logika 1:1 z funkcjami RPC w supabase/schema.sql.
// =====================================================================
import { RULES, OPEN_STATUSES, SPORTS, REVIEW_AREAS, OG_MIN_TOTAL, OG_MIN, distM, H, M } from '../rules.js';
import { skillKeys } from '../skills.js';

const KEY = 'bbkort_demo_v5';
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
    ghost_count: 0, coins: 0, xp: 0, checkins: 0, frame: null, owned: [], invited_by: null, created_at: iso(now - 20 * day + n * H), ...extra,
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
    kind: 'challenge', created_by: null, referee_id: null, challenger_report: null, defender_report: null, score_challenger: null, score_defender: null,
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

  // --- "gra": monety, obecność, zgłoszenia do akceptacji, statystyki, sklep, dropy, aktualności
  const wallet = { u1: [340, 520, 22, 'frame_gold'], u2: [95, 95, 6], u4: [210, 400, 15, 'frame_fire'], u7: [120, 180, 9], u9: [260, 610, 31, 'frame_neon'], u20: [80, 140, 7], u23: [150, 230, 12], u5: [20, 20, 1], u11: [0, 0, 0] };
  for (const p of profiles) { const w = wallet[p.id]; if (w) Object.assign(p, { coins: w[0], xp: w[1], checkins: w[2], frame: w[3] || null, owned: w[3] ? [w[3]] : [] }); }
  profiles.find((p) => p.id === 'u2').invited_by = 'u1';
  const dkey = (i) => { const d = new Date(now - i * day); const z = (x) => String(x).padStart(2, '0'); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`; };
  const coin_ledger = [1, 2].map((i) => ({ id: i, player_id: 'u1', amount: 5, reason: 'daily_checkin', key: 'daily:checkin:' + dkey(i), created_at: iso(now - i * day) }))
    .concat([{ id: 10, player_id: 'u1', amount: 25, reason: 'win', key: 'match:x', created_at: iso(now - 3 * day) }, { id: 11, player_id: 'u1', amount: 50, reason: 'team_create', key: 'team_create', created_at: iso(now - 30 * day) }]);
  const court_presence = [['c1', 'u5', 25], ['c1', 'u8', 40], ['c5', 'u10', 10], ['c9', 'u21', 55]].map(([court_id, player_id, m], i) => ({ id: i + 1, court_id, player_id, at: iso(now - m * M) }));
  challenges.push(
    ch({ id: 'ch5', court_id: 'c2', challenger_team_id: 't1', defender_team_id: 't2', scheduled_at: iso(now + 4 * day), status: 'proposed',
      accept_deadline: iso(now + 48 * H), created_by: 'u2', created_at: iso(now - 2 * H) }),
    ch({ id: 'ch6', kind: 'claim', court_id: 'c6', challenger_team_id: 't4', defender_team_id: null, scheduled_at: iso(now - 1 * H), status: 'review',
      accept_deadline: iso(now + 47 * H), created_by: 'u9', created_at: iso(now - 1 * H) }),
  );
  challenges.forEach((c) => { if (!c.created_by) c.created_by = teams.find((t) => t.id === c.challenger_team_id)?.captain_id; });
  const challenge_backers = [['ch5', 'u2'], ['ch6', 'u9']].map(([challenge_id, player_id]) => ({ challenge_id, player_id }));
  const match_stats = [
    { challenge_id: 'ch3', player_id: 'u4', team_id: 't2', stats: { pts: 12, reb: 4, ast: 3, stl: 2, blk: 0 }, status: 'approved', note: null, reviewed_by: 'admin', created_at: iso(now - 3 * day) },
    { challenge_id: 'ch3', player_id: 'u7', team_id: 't3', stats: { pts: 11, reb: 6, ast: 1, stl: 1, blk: 1 }, status: 'approved', note: null, reviewed_by: 'admin', created_at: iso(now - 3 * day) },
    { challenge_id: 'ch4', player_id: 'u23', team_id: 'f2', stats: { goals: 3, ast: 1, saves: 0 }, status: 'pending', note: null, reviewed_by: null, created_at: iso(now - 17 * H) },
  ];
  const player_badges = [{ player_id: 'u9', code: 'og_founder', note: 'Pierwsza drużyna w BBKORT', granted_at: iso(now - 12 * day) }];
  const posts = [
    { id: 'p1', kind: 'contest', title: 'Konkurs miesiąca: najwięcej meldunków na boiskach', body: 'Zawodnik z największą liczbą meldunków w tym miesiącu wygrywa metalową siatkę na swoje boisko. Liczy się każdy dzień!', image_url: null, link_url: null, active: true, pinned: true, created_at: iso(now - 2 * day) },
    { id: 'p2', kind: 'news', title: 'Ruszamy z kartami OG SPOT w Rzeszowie', body: 'Pierwsze boiska sprawdzone: Bulwary i Baranówka. Zgłaszajcie kolejne!', image_url: null, link_url: '#/spots', active: true, pinned: false, created_at: iso(now - 5 * day) },
    { id: 'p3', kind: 'ad', title: 'Tu może być Twoja marka', body: 'Miejsce dla partnera sezonu – sklep sportowy, lokalna firma, klub.', image_url: null, link_url: null, active: true, pinned: false, created_at: iso(now - 6 * day) },
  ];
  const shop_items = [
    ['frame_gold', 'cosmetic', 'Złota ramka karty', 'Twoja karta zawodnika w złocie.', 150, null, true],
    ['frame_fire', 'cosmetic', 'Ramka „On Fire”', 'Ognista ramka dla tych, którzy są w gazie.', 300, null, true],
    ['frame_ice', 'cosmetic', 'Ramka „Ice Cold”', 'Lodowa ramka dla chłodnych głów.', 300, null, true],
    ['frame_neon', 'cosmetic', 'Ramka „Neon Court”', 'Neonowa ramka – widać Cię z daleka.', 500, null, true],
    ['perk_reschedule', 'perk', 'Przeniesienie meczu', 'Jednorazowa zmiana terminu wyzwania (zatwierdza admin).', 200, null, true],
    ['perk_shield', 'perk', 'Tarcza 48 h', 'Wasze boisko nie może być wyzwane przez 48 h (włącza admin).', 400, null, true],
    ['perk_visit', 'perk', 'Wizyta OG SPOT', 'Wskaż boisko – przyjedziemy je ocenić w pierwszej kolejności.', 800, null, true],
    ['reward_net', 'reward', 'Metalowa siatka na Twoje boisko', 'Nagroda od partnera sezonu (przykład).', 1500, 5, true],
    ['reward_ball', 'reward', 'Piłka meczowa', 'Nagroda od partnera sezonu (przykład).', 2500, 3, true],
  ].map(([code, kind, title, descr, cost, stock, active], i) => ({ id: 'it' + i, code, kind, title, descr, cost, stock, image_url: null, sponsor: kind === 'reward' ? 'Partner sezonu' : null, active, sort: 10 + i }));
  const purchases = [{ id: 'pu1', player_id: 'u4', item_id: 'it5', cost: 400, status: 'pending', note: 'Park Papieski', created_at: iso(now - 6 * H) }];
  const drops = [{ id: 'd1', title: 'Drop #1: piłka pod koszem', hint: 'Boisko nad rzeką, tam gdzie kosz patrzy na most. Kod jest na naklejce pod ławką.', prize: 'Piłka do streetballa', coins: 100, image_url: null, status: 'active', claimed_by: null, claimed_at: null, created_at: iso(now - 20 * H) }];
  const drop_codes = { d1: 'og-2027' };
  const notifications = [
    { id: 1, player_id: 'u1', kind: 'presence', data: { nick: 'Mateusz', court: 'Bulwary nad Wisłokiem – kosz', team: 'NMH' }, link: 'map/c1', read: false, created_at: iso(now - 25 * M) },
    { id: 2, player_id: 'u1', kind: 'support_needed', data: { nick: 'Szymon', court: 'Park Papieski', kind: 'challenge' }, link: 'matches', read: false, created_at: iso(now - 2 * H) },
    { id: 3, player_id: 'u1', kind: 'drop_new', data: { title: 'Drop #1: piłka pod koszem' }, link: 'home', read: true, created_at: iso(now - 20 * H) },
  ];

  return {
    version: 5, time_offset: 0, fake_gps: true, current_user: 'admin',
    coin_ledger, court_presence, challenge_backers, match_stats, player_badges, posts, shop_items, purchases, drops, drop_codes, notifications,
    teams, profiles, courts, challenges, challenge_players, court_history, court_ratings,
    court_reviews, team_requests, games, game_players, court_issues,
  };
}

export function create() {
  let S;
  try { S = JSON.parse(localStorage.getItem(KEY)); } catch { S = null; }
  if (!S || S.version !== 5) S = seed();

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
  const today = () => { const d = new Date(now()); const z = (x) => String(x).padStart(2, '0'); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`; };
  const coin = (pid, amount, reason, key) => {
    const x = S.profiles.find((q) => q.id === pid);
    if (!x || !amount || S.coin_ledger.some((l) => l.player_id === pid && l.key === key)) return false;
    S.coin_ledger.push({ id: Date.now() + Math.random(), player_id: pid, amount, reason, key, created_at: iso(now()) });
    x.coins += amount; x.xp += Math.max(amount, 0);
    return true;
  };
  const notify = (pid, kind, data = {}, link = null) => { if (pid) S.notifications.unshift({ id: Date.now() + Math.random(), player_id: pid, kind, data, link, read: false, created_at: iso(now()) }); };
  const notifyTeam = (tid, kind, data, link, except) => S.profiles.filter((q) => q.team_id === tid && q.id !== except).forEach((q) => notify(q.id, kind, data, link));
  const notifyStaff = (kind, data, link) => S.profiles.filter((q) => q.is_admin).forEach((q) => notify(q.id, kind, data, link));
  const newAction = (p, c, kind, t) => {
    if (!p.team_id) throw err('err_no_team');
    const tm = team(p.team_id);
    if (c.sport !== tm.sport) throw err('err_wrong_sport');
    if (S.challenges.some((x) => x.court_id === c.id && OPEN_STATUSES.includes(x.status))) throw err('err_court_busy');
    if (kind === 'claim') { if (c.king_team_id) throw err('err_court_taken'); }
    else {
      if (!c.king_team_id) throw err('err_court_free');
      if (c.king_team_id === p.team_id) throw err('err_own_court');
      if (c.protected_until && T(c.protected_until) > now()) throw err('err_protected');
      if (isNaN(t) || t < now() + RULES.MIN_LEAD_MIN * M || t > now() + RULES.MAX_LEAD_DAYS * 24 * H) throw err('err_bad_time');
    }
    const cap = tm.captain_id === p.id;
    const id = 'ch' + uid();
    S.challenges.push({
      id, kind, created_by: p.id, court_id: c.id, challenger_team_id: p.team_id, defender_team_id: kind === 'claim' ? null : c.king_team_id,
      scheduled_at: iso(kind === 'claim' ? now() : t), status: cap ? 'review' : 'proposed', accept_deadline: iso(now() + RULES.ACCEPT_HOURS * H),
      referee_id: null, challenger_report: null, defender_report: null, score_challenger: null, score_defender: null,
      video_url: null, winner_team_id: null, note: null, resolved_by: null, resolved_at: null, created_at: iso(now()),
    });
    S.challenge_backers.push({ challenge_id: id, player_id: p.id });
    if (kind === 'challenge') S.challenge_players.push({ challenge_id: id, player_id: p.id, team_id: p.team_id, checked_in_at: null });
    if (cap) notifyStaff('review_needed', { court: c.name, team: tm.tag, kind }, 'admin');
    else notifyTeam(p.team_id, 'support_needed', { court: c.name, nick: p.nick, kind }, 'matches', p.id);
    return id;
  };
  const joinTeam = (tid, pid) => {
    const x = S.profiles.find((q) => q.id === pid);
    if (x.team_id) throw err('err_already_in_team');
    Object.assign(x, { team_id: tid, sport: team(tid).sport });
    coin(pid, 20, 'team_join', 'team_join');
    S.team_requests = S.team_requests.filter((r) => r.player_id !== pid);
  };
  const validScore = (a, b) => Number.isInteger(a) && Number.isInteger(b) && a >= 0 && b >= 0 && a !== b;

  function finalize(ch, winner, status, note, by) {
    if (!['pending', 'accepted', 'reported'].includes(ch.status)) return;
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
    S.challenge_players.filter((x) => x.challenge_id === ch.id && x.checked_in_at)
      .forEach((x) => coin(x.player_id, x.team_id === winner ? 25 : 5, x.team_id === winner ? 'win' : 'played', 'match:' + ch.id));
    notifyTeam(ch.challenger_team_id, 'result', { court: c.name, won: winner === ch.challenger_team_id }, 'matches');
    notifyTeam(ch.defender_team_id, 'result', { court: c.name, won: winner === ch.defender_team_id }, 'matches');
  }

  const R = {
    // ---- profil i skille
    update_profile({ p_nick, p_position, p_number, p_height, p_sport }) {
      const p = me();
      if (p_nick && p_nick.trim()) p.nick = p_nick.trim().slice(0, 24);
      if (!p.position && p_position) coin(p.id, 10, 'profile', 'profile');
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
      coin(p.id, 50, 'team_create', 'team_create');
      return id;
    },
    join_team({ p_team }) { return R.request_join({ p_team }); },
    request_join({ p_team }) {
      const p = me();
      if (p.team_id) throw err('err_already_in_team');
      if (!team(p_team)) throw err('err_not_found');
      if (S.team_requests.some((r) => r.team_id === p_team && r.player_id === p.id && r.kind === 'invite')) { joinTeam(p_team, p.id); return 'joined'; }
      if (!S.team_requests.some((r) => r.team_id === p_team && r.player_id === p.id)) { S.team_requests.push({ team_id: p_team, player_id: p.id, kind: 'request', created_at: iso(now()) }); notify(team(p_team).captain_id, 'team_request', { nick: p.nick }, 'team/' + p_team); }
      return 'requested';
    },
    invite_player({ p_player }) {
      const p = me();
      if (!p.team_id || !isCap(p.id, p.team_id)) throw err('err_not_captain');
      const x = S.profiles.find((q) => q.id === p_player);
      if (!x) throw err('err_not_found');
      if (x.team_id) throw err('err_player_in_team');
      if (S.team_requests.some((r) => r.team_id === p.team_id && r.player_id === p_player && r.kind === 'request')) { joinTeam(p.team_id, p_player); return 'joined'; }
      if (!S.team_requests.some((r) => r.team_id === p.team_id && r.player_id === p_player)) { S.team_requests.push({ team_id: p.team_id, player_id: p_player, kind: 'invite', created_at: iso(now()) }); notify(p_player, 'team_invite', { team: team(p.team_id).tag }, 'home'); }
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
      const p = me(), c = getCourt(p_court);
      checkDist(c, p_lat, p_lng);
      newAction(p, c, 'claim', null);
    },
    // ---- wyzwania (kapitan sam albo 3 zawodników; potem akceptacja admina)
    create_challenge({ p_court, p_time }) { return newAction(me(), getCourt(p_court), 'challenge', T(p_time)); },
    support_challenge({ p_id }) {
      const p = me(), ch = getCh(p_id);
      if (ch.status !== 'proposed') throw err('err_bad_state');
      if (p.team_id !== ch.challenger_team_id) throw err('err_not_in_match');
      if (!S.challenge_backers.some((b) => b.challenge_id === ch.id && b.player_id === p.id)) S.challenge_backers.push({ challenge_id: ch.id, player_id: p.id });
      if (S.challenge_backers.filter((b) => b.challenge_id === ch.id).length >= RULES.BACKERS || isCap(p.id, ch.challenger_team_id)) {
        ch.status = 'review';
        notifyStaff('review_needed', { court: getCourt(ch.court_id).name, team: team(ch.challenger_team_id)?.tag, kind: ch.kind }, 'admin');
      }
    },
    admin_review_challenge({ p_id, p_approve, p_note }) {
      const p = staff(), ch = getCh(p_id), c = getCourt(ch.court_id);
      if (!['proposed', 'review'].includes(ch.status)) throw err('err_bad_state');
      if (!p_approve) {
        Object.assign(ch, { status: 'rejected', note: p_note || null, resolved_at: iso(now()), resolved_by: p.id });
        notifyTeam(ch.challenger_team_id, 'action_rejected', { court: c.name, kind: ch.kind, note: p_note }, 'matches');
        return;
      }
      if (ch.kind === 'claim') {
        if (c.king_team_id) throw err('err_court_taken');
        Object.assign(c, { king_team_id: ch.challenger_team_id, king_since: iso(now()), defenses: 0, protected_until: iso(now() + RULES.PROTECTION_HOURS * H) });
        history(c.id, ch.challenger_team_id, 'claim', ch.id);
        Object.assign(ch, { status: 'claimed', winner_team_id: ch.challenger_team_id, resolved_at: iso(now()), resolved_by: p.id });
        S.challenge_backers.filter((b) => b.challenge_id === ch.id).forEach((b) => coin(b.player_id, 15, 'claim', 'claim:' + ch.id));
        notifyTeam(ch.challenger_team_id, 'claim_approved', { court: c.name }, 'map/' + c.id);
      } else {
        if (c.king_team_id !== ch.defender_team_id) throw err('err_bad_state');
        if (T(ch.scheduled_at) < now() + 60 * M) throw err('err_bad_time');
        Object.assign(ch, { status: 'pending', accept_deadline: iso(Math.min(now() + RULES.ACCEPT_HOURS * H, T(ch.scheduled_at))) });
        coin(ch.created_by, 10, 'challenge', 'challenge:' + ch.id);
        notifyTeam(ch.defender_team_id, 'challenged', { court: c.name, team: team(ch.challenger_team_id)?.tag }, 'matches');
        notifyTeam(ch.challenger_team_id, 'challenge_approved', { court: c.name }, 'matches');
      }
    },
    cancel_challenge({ p_id }) {
      const p = me(), ch = getCh(p_id);
      if (!['proposed', 'review', 'pending'].includes(ch.status)) throw err('err_bad_state');
      if (ch.created_by !== p.id && !isCap(p.id, ch.challenger_team_id)) throw err('err_not_captain');
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
        if (ch.status === 'proposed' && T(ch.created_at) + 48 * H < now()) { Object.assign(ch, { status: 'expired', note: 'no_support', resolved_at: iso(now()) }); continue; }
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
      coin(p.id, 5, 'rate', 'rate:' + p_court);
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
      if (p_approve) { c.status = 'active'; coin(c.added_by, 30, 'court_added', 'court:' + c.id); } else S.courts = S.courts.filter((x) => x.id !== p_court);
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
      coin(p.id, 5, 'game', 'daily:game:' + today());
      return id;
    },
    join_game({ p_game }) {
      const p = me();
      const g = S.games.find((x) => x.id === p_game && x.status === 'open');
      if (!g) throw err('err_not_found');
      if (S.game_players.some((x) => x.game_id === g.id && x.player_id === p.id)) return;
      if (S.game_players.filter((x) => x.game_id === g.id).length >= g.slots) throw err('err_game_full');
      S.game_players.push({ game_id: g.id, player_id: p.id, joined_at: iso(now()) });
      coin(p.id, 5, 'game', 'daily:game:' + today());
      notify(g.host_id, 'game_joined', { nick: p.nick }, 'games');
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
      coin(p.id, 3, 'issue', 'daily:issue:' + today());
      S.court_issues.push({ id: Date.now(), court_id: p_court, player_id: p.id, text: p_text.trim().slice(0, 300), status: 'open', created_at: iso(now()) });
    },
    resolve_issue({ p_id }) { staff(); const i = S.court_issues.find((x) => String(x.id) === String(p_id)); if (i) i.status = 'resolved'; },
    // ---- kto teraz gra
    check_in_court({ p_court, p_lat, p_lng }) {
      const p = me(), c = getCourt(p_court);
      checkDist(c, p_lat, p_lng);
      if (S.court_presence.some((x) => x.court_id === c.id && x.player_id === p.id && T(x.at) > now() - RULES.PRESENCE_HOURS * H)) return;
      S.court_presence.push({ id: Date.now(), court_id: c.id, player_id: p.id, at: iso(now()) });
      p.checkins++;
      if (coin(p.id, 5, 'daily_checkin', 'daily:checkin:' + today())) {
        let streak = 1;
        const dayKey = (i) => { const d = new Date(now() - i * 24 * H); const z = (x) => String(x).padStart(2, '0'); return `daily:checkin:${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`; };
        while (S.coin_ledger.some((l) => l.player_id === p.id && l.key === dayKey(streak))) streak++;
        if (streak % 7 === 0) coin(p.id, 20, 'streak7', 'streak7:' + today());
        else if (streak % 7 === 3) coin(p.id, 5, 'streak3', 'streak3:' + today());
      }
      if (c.king_team_id && c.king_team_id !== p.team_id) notifyTeam(c.king_team_id, 'presence', { nick: p.nick, court: c.name, team: team(p.team_id)?.tag }, 'map/' + c.id);
    },
    mark_notifications_read() { S.notifications.forEach((n) => { if (n.player_id === S.current_user) n.read = true; }); },
    // ---- statystyki po meczu
    submit_match_stats({ p_id, p_stats }) {
      const p = me(), ch = getCh(p_id);
      if (!['accepted', 'reported', 'confirmed'].includes(ch.status)) throw err('err_bad_state');
      if (![ch.challenger_team_id, ch.defender_team_id].includes(p.team_id)) throw err('err_not_in_match');
      const vals = Object.values(p_stats || {});
      if (!vals.length || vals.some((v) => !Number.isInteger(v) || v < 0 || v > 200)) throw err('err_bad_stats');
      if (S.match_stats.some((m) => m.challenge_id === ch.id && m.player_id === p.id && m.status === 'approved')) throw err('err_bad_state');
      S.match_stats = S.match_stats.filter((m) => !(m.challenge_id === ch.id && m.player_id === p.id));
      S.match_stats.push({ challenge_id: ch.id, player_id: p.id, team_id: p.team_id, stats: p_stats, status: 'pending', note: null, reviewed_by: null, created_at: iso(now()) });
    },
    review_match_stats({ p_id, p_player, p_approve, p_stats, p_note }) {
      const p = staff();
      const m = S.match_stats.find((x) => x.challenge_id === p_id && x.player_id === p_player);
      if (!m) return;
      Object.assign(m, { stats: p_stats || m.stats, status: p_approve ? 'approved' : 'rejected', note: p_note || null, reviewed_by: p.id });
      if (p_approve) coin(p_player, 5, 'stats', 'stats:' + p_id);
      notify(p_player, p_approve ? 'stats_approved' : 'stats_rejected', {}, 'player/me');
    },
    admin_set_skills({ p_player, p_sport, p_skills }) {
      staff();
      const x = S.profiles.find((q) => q.id === p_player);
      if (!x || Object.values(p_skills || {}).some((v) => typeof v !== 'number' || v < 25 || v > 99)) throw err('err_bad_skills');
      Object.assign(x, { skills: { ...(x.skills || {}), [p_sport]: p_skills }, skills_pending: null, skills_pending_sport: null, skills_status: 'approved' });
      notify(p_player, 'skills_updated', {}, 'player/me');
    },
    grant_badge({ p_player, p_code, p_note, p_on }) {
      admin();
      S.player_badges = S.player_badges.filter((b) => !(b.player_id === p_player && b.code === p_code));
      if (p_on) { S.player_badges.push({ player_id: p_player, code: p_code, note: p_note || null, granted_at: iso(now()) }); notify(p_player, 'badge', { code: p_code }, 'player/me'); }
    },
    // ---- aktualności / reklamy / konkursy
    save_post({ p_id, p_data }) {
      admin();
      const id = p_id || 'p' + uid();
      const old = S.posts.find((x) => x.id === id);
      const row = { id, kind: p_data.kind || 'news', title: (p_data.title || '').trim(), body: p_data.body || null, image_url: p_data.image_url || null, link_url: p_data.link_url || null,
        active: p_data.active !== false, pinned: !!p_data.pinned, created_at: old?.created_at || iso(now()) };
      if (row.title.length < 2) throw err('err_bad_request');
      S.posts = S.posts.filter((x) => x.id !== id); S.posts.push(row);
      return id;
    },
    delete_post({ p_id }) { admin(); S.posts = S.posts.filter((x) => x.id !== p_id); },
    // ---- sklep
    buy_item({ p_item, p_note }) {
      const p = me();
      const it = S.shop_items.find((x) => x.id === p_item && x.active);
      if (!it) throw err('err_not_found');
      if (it.stock != null && it.stock <= 0) throw err('err_out_of_stock');
      if (p.coins < it.cost) throw err('err_no_coins');
      if (it.kind === 'cosmetic' && p.owned.includes(it.code)) throw err('err_already_owned');
      const id = 'pu' + uid();
      S.purchases.push({ id, player_id: p.id, item_id: it.id, cost: it.cost, status: it.kind === 'cosmetic' ? 'done' : 'pending', note: (p_note || '').slice(0, 200) || null, created_at: iso(now()) });
      coin(p.id, -it.cost, 'buy', 'buy:' + id);
      if (it.stock != null) it.stock--;
      if (it.kind === 'cosmetic') { p.owned.push(it.code); p.frame = it.code; } else notifyStaff('purchase', { nick: p.nick, item: it.title }, 'admin');
    },
    equip_frame({ p_code }) {
      const p = me();
      if (p_code && !p.owned.includes(p_code)) throw err('err_not_allowed');
      p.frame = p_code || null;
    },
    admin_purchase({ p_id, p_fulfilled }) {
      staff();
      const pu = S.purchases.find((x) => x.id === p_id);
      if (!pu || pu.status !== 'pending') throw err('err_bad_state');
      pu.status = p_fulfilled ? 'fulfilled' : 'cancelled';
      if (!p_fulfilled) { coin(pu.player_id, pu.cost, 'refund', 'refund:' + pu.id); const it = S.shop_items.find((x) => x.id === pu.item_id); if (it && it.stock != null) it.stock++; }
      notify(pu.player_id, p_fulfilled ? 'purchase_done' : 'purchase_cancelled', {}, 'shop');
    },
    save_shop_item({ p_id, p_data }) {
      admin();
      const id = p_id || 'it' + uid();
      const old = S.shop_items.find((x) => x.id === id) || { code: null };
      const cost = parseInt(p_data.cost, 10);
      if (!(cost > 0) || (p_data.title || '').trim().length < 2) throw err('err_bad_request');
      const row = { ...old, id, kind: old.kind || p_data.kind || 'reward', title: p_data.title.trim(), descr: p_data.descr || null, cost,
        stock: p_data.stock === '' || p_data.stock == null ? null : parseInt(p_data.stock, 10), image_url: p_data.image_url || null, sponsor: p_data.sponsor || null,
        active: p_data.active !== false, sort: old.sort || 100 };
      S.shop_items = S.shop_items.filter((x) => x.id !== id); S.shop_items.push(row);
      return id;
    },
    // ---- dropy
    create_drop({ p_data }) {
      admin();
      if ((p_data.code || '').trim().length < 4 || (p_data.title || '').trim().length < 2) throw err('err_bad_request');
      const id = 'd' + uid();
      S.drops.push({ id, title: p_data.title.trim(), hint: p_data.hint || null, prize: p_data.prize || null, coins: parseInt(p_data.coins, 10) || 0, image_url: p_data.image_url || null,
        status: 'active', claimed_by: null, claimed_at: null, created_at: iso(now()) });
      S.drop_codes[id] = p_data.code.trim().toLowerCase();
      S.profiles.forEach((q) => notify(q.id, 'drop_new', { title: p_data.title }, 'home'));
      return id;
    },
    claim_drop({ p_id, p_code }) {
      const p = me();
      const d = S.drops.find((x) => x.id === p_id);
      if (!d || d.status !== 'active') throw err('err_drop_gone');
      if (S.drop_codes[d.id] !== (p_code || '').trim().toLowerCase()) return false;
      Object.assign(d, { status: 'claimed', claimed_by: p.id, claimed_at: iso(now()) });
      coin(p.id, Math.max(d.coins, 0) + 20, 'drop', 'drop:' + d.id);
      notifyStaff('drop_claimed', { nick: p.nick, title: d.title }, 'admin');
      return true;
    },
    end_drop({ p_id }) { admin(); const d = S.drops.find((x) => x.id === p_id); if (d && d.status === 'active') d.status = 'ended'; },
    set_referrer({ p_nick }) {
      const p = me();
      if (p.invited_by) throw err('err_bad_state');
      const r = S.profiles.find((q) => q.nick.toLowerCase() === (p_nick || '').trim().toLowerCase() && q.id !== p.id);
      if (!r) throw err('err_not_found');
      p.invited_by = r.id;
      coin(r.id, 30, 'referral', 'ref:' + p.id); coin(p.id, 10, 'referred', 'referred');
      notify(r.id, 'referral', { nick: p.nick }, 'shop');
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
      S.court_ratings = S.court_ratings.filter((r) => r.court_id !== p_court);
    },
  };

  const changed = () => { save(); changeCb && changeCb(); };

  return {
    mode: 'demo',
    now,
    canImport: () => true,
    async load() {
      const d = {};
      for (const k of ['teams', 'profiles', 'courts', 'challenges', 'challenge_players', 'court_history', 'court_ratings', 'court_reviews', 'team_requests',
        'games', 'game_players', 'court_issues', 'court_presence', 'challenge_backers', 'match_stats', 'player_badges', 'posts', 'shop_items', 'drops']) d[k] = S[k];
      // prywatne: tylko swoje (jak RLS w Supabase)
      const u = S.current_user, meP = S.profiles.find((p) => p.id === u);
      d.coin_ledger = S.coin_ledger.filter((l) => l.player_id === u);
      d.notifications = S.notifications.filter((n) => n.player_id === u).slice(0, 40);
      d.purchases = S.purchases.filter((x) => x.player_id === u || (meP && (meP.is_admin || meP.is_moderator)));
      return clone(d);
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
