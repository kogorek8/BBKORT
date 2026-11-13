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
  MIN_LEAD_MIN: 60,        // wyzwanie najwcześniej za X min
  MAX_LEAD_DAYS: 7,        // wyzwanie najpóźniej za X dni
  MIN_SKILL: 25,
  MAX_SKILL: 99,
};

export const OPEN_STATUSES = ['pending', 'accepted', 'reported'];

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
