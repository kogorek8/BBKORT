// Zasady gry – muszą zgadzać się z supabase/schema.sql
export const M = 60 * 1000;
export const H = 60 * M;

export const RULES = {
  CHECKIN_RADIUS_M: 150,   // jak blisko boiska trzeba być
  ACCEPT_HOURS: 48,        // "król" ma tyle na przyjęcie wyzwania
  PROTECTION_HOURS: 24,    // ochrona boiska po przejęciu / obronie
  CHECKIN_BEFORE_MIN: 30,  // check-in otwiera się X min przed startem
  WALKOVER_GRACE_MIN: 30,  // po X min od startu można żądać walkowera
  MATCH_EXPIRE_HOURS: 48,  // mecz bez zgłoszonego wyniku wygasa po X h od startu
  MIN_LEAD_MIN: 48 * 60,   // wyzwanie najwcześniej za 48 h (czas na akceptację admina i odpowiedź króla)
  MAX_LEAD_DAYS: 14,       // wyzwanie najpóźniej za X dni
  BACKERS: 3,              // ilu zawodników musi poprzeć zgłoszenie (kapitan – wystarczy sam)
  PRESENCE_HOURS: 2,       // jak długo widać meldunek "gram teraz"
  MIN_SKILL: 25,
  MAX_SKILL: 99,
};

export const OPEN_STATUSES = ['proposed', 'review', 'pending', 'accepted', 'reported'];

// Sporty
export const SPORTS = ['basketball', 'football'];
export const SPORT_ICON = { basketball: '🏀', football: '⚽' };

// Strefy terenu: siatka ~1 x 1 km. Strefa należy do drużyny z największą liczbą boisk w niej.
export const ZONE_LAT = 0.009;
export const ZONE_LNG = 0.0145;
export const WIN_STATUSES = ['confirmed', 'walkover'];

export function distM(lat1, lng1, lat2, lng2) {
  const r = (d) => (d * Math.PI) / 180;
  const a = Math.sin(r(lat2 - lat1) / 2) ** 2 +
    Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lng2 - lng1) / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(a));
}

// OPINIA ZAWODNIKÓW o boisku (gwiazdki 1–5) – zgodnie z planem: komfort, chęć powrotu, klimat
export const COURT_CRITERIA = ['comfort', 'return', 'vibe'];

// OFICJALNA KARTA BOISKA "OG SPOT" – 100 pkt w 8 obszarach (z biznesplanu)
export const REVIEW_AREAS = [
  { key: 'surface', max: 25 },      // równość, przyczepność i stan 15 + równomierność odbicia 10
  { key: 'hoop', max: 20 },         // oględziny, wysokość, obręcz, tablica, mocowania, siatka
  { key: 'space', max: 15 },        // wymiary pola, przeszkody, miejsce do wybiegania
  { key: 'lines', max: 10 },        // granice, linia wolnych, łuk, czytelność
  { key: 'access', max: 10 },       // godziny, opłaty, zasady wejścia
  { key: 'surroundings', max: 5 },  // ławki, odpady, miejsce na rzeczy, cień
  { key: 'regular', max: 5 },       // utrzymanie, współdzielenie, kontakt do zarządcy
  { key: 'players', max: 10 },      // średnia ocen zawodników: komfort, chęć powrotu, klimat
];
// Znak OG SPOT: min. 75/100, brak zagrożeń oraz min. 3/5 (60%) osobno za nawierzchnię, kosz i przestrzeń
export const OG_MIN_TOTAL = 75;
export const OG_MIN = { surface: 15, hoop: 12, space: 9 };
export const SUGGESTION_KINDS = ['urgent', 'cheap', 'invest'];
export const GAME_LEVELS = ['all', 'beginner', 'mid', 'pro'];

// ---------- STATYSTYKI PO MECZU (zgłasza zawodnik, zatwierdza admin) ----------
export const STAT_KEYS = { basketball: ['pts', 'reb', 'ast', 'stl', 'blk'], football: ['goals', 'ast', 'saves'] };

// ---------- OG COINS: za co i ile (zgodne z supabase/migracja-4-gra.sql) ----------
export const COIN_TABLE = [
  ['daily_checkin', 5], ['game', 5], ['rate', 5], ['issue', 3], ['profile', 10], ['team_join', 20], ['team_create', 50],
  ['challenge', 10], ['claim', 15], ['played', 5], ['win', 25], ['stats', 5], ['court_added', 30], ['referral', 30],
  ['streak3', 5], ['streak7', 20], ['drop', 20],
];
// codzienne misje (klucze w księdze monet)
export const DAILY_MISSIONS = [
  { key: 'daily:checkin:', reason: 'daily_checkin', coins: 5, href: '#/map' },
  { key: 'daily:game:', reason: 'game', coins: 5, href: '#/games' },
  { key: 'daily:issue:', reason: 'issue', coins: 3, href: '#/map' },
];

// ---------- POZIOMY (z sumy zdobytych monet) ----------
export const LEVEL_TITLES = [[1, 'lv_rookie'], [3, 'lv_bench'], [6, 'lv_starter'], [10, 'lv_leader'], [15, 'lv_star'], [22, 'lv_mvp'], [30, 'lv_legend']];
export function levelOf(xp = 0) {
  const lvl = Math.floor(Math.sqrt(xp / 20)) + 1;
  const cur = (lvl - 1) ** 2 * 20, next = lvl ** 2 * 20;
  const title = [...LEVEL_TITLES].reverse().find(([n]) => lvl >= n)[1];
  return { lvl, title, pct: Math.round(((xp - cur) / (next - cur)) * 100), toNext: next - xp };
}

// ---------- SEZONY (4 w roku; miesiące 1–12) ----------
export const SEASONS = [
  { code: 'winter', icon: '❄️', months: [11, 12, 1, 2] },   // Sezon Zimowy – przygotowania, hale, budowanie składów
  { code: 'spring', icon: '🌱', months: [3, 4, 5] },         // Wiosenne Otwarcie – pierwsze przejęcia
  { code: 'summer', icon: '☀️', months: [6, 7, 8] },         // Letnia Liga Boisk – główny sezon
  { code: 'finals', icon: '🏆', months: [9, 10] },           // Finały Jesieni – mistrz roku
];
export function seasonAt(ms) {
  const d = new Date(ms), m = d.getMonth() + 1, y = d.getFullYear();
  const s = SEASONS.find((x) => x.months.includes(m));
  const first = s.months[0], last = s.months[s.months.length - 1];
  const startY = first > last && m <= last ? y - 1 : y;          // sezon zimowy przechodzi przez Nowy Rok
  const endY = first > last && m >= first ? y + 1 : y;
  return { ...s, year: endY, start: new Date(startY, first - 1, 1).getTime(), end: new Date(endY, last, 1).getTime() };
}
// punkty sezonu drużyny
export const SEASON_POINTS = { win: 3, capture: 2, defend: 1, claim: 1 };

// ---------- ODZNAKI (poziomy: brąz / srebro / złoto / Hall of Fame) ----------
export const BADGE_TIERS = ['bronze', 'silver', 'gold', 'hof'];
export const BADGES = [
  { code: 'court_general', icon: '🧭', metric: 'checkins', tiers: [3, 15, 50, 150] },   // meldunki na boiskach
  { code: 'closer', icon: '🏁', metric: 'wins', tiers: [1, 5, 15, 40] },               // wygrane mecze
  { code: 'lockdown', icon: '🔒', metric: 'defenses', tiers: [1, 3, 10, 25] },         // obrony boiska
  { code: 'conqueror', icon: '⚔️', metric: 'captures', tiers: [1, 3, 8, 20] },         // boiska zdobyte w meczu
  { code: 'bucket', icon: '🔥', metric: 'best', tiers: [10, 20, 30, 40] },             // rekord punktów / goli w meczu
  { code: 'floor_general', icon: '🤝', metric: 'games', tiers: [1, 5, 15, 40] },       // zorganizowane gry
  { code: 'scout', icon: '🔭', metric: 'opinions', tiers: [1, 5, 15, 40] },            // opinie o boiskach
  { code: 'iron_man', icon: '🦾', metric: 'played', tiers: [3, 10, 25, 60] },          // rozegrane mecze (zameldowany)
  { code: 'recruiter', icon: '📣', metric: 'referrals', tiers: [1, 3, 10, 25] },       // polecone osoby
  { code: 'drop_hunter', icon: '🎁', metric: 'drops', tiers: [1, 2, 4, 8] },           // znalezione dropy
];
// odznaki specjalne – nadaje admin (np. po sezonie)
export const SPECIAL_BADGES = ['season_mvp', 'season_champion', 'og_founder', 'fair_play', 'court_hero'];
export const FRAMES = ['frame_gold', 'frame_fire', 'frame_ice', 'frame_neon'];
