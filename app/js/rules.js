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

// OCENA BOISKA – kryteria (gwiazdki 1–5). Tymczasowe – podmień na reguły z planu BBKORT.
// Klucz = nazwa w bazie, tekst = i18n "cr_<klucz>". Można dodawać/usuwać bez zmian w bazie.
export const COURT_CRITERIA = ['surface', 'hoops', 'lighting', 'access', 'vibe'];
