// Zasady gry – muszą zgadzać się z supabase/schema.sql
export const M = 60 * 1000;
export const H = 60 * M;

export const RULES = {
  CHECKIN_RADIUS_M: 150,   // jak blisko boiska trzeba być
  ACCEPT_HOURS: 24,        // "król" ma tyle na przyjęcie wyzwania
  CONFIRM_HOURS: 24,       // drugi kapitan ma tyle na potwierdzenie wyniku
  PROTECTION_HOURS: 24,    // ochrona boiska po przejęciu / obronie
  CHECKIN_BEFORE_MIN: 30,  // check-in otwiera się X min przed startem
  WALKOVER_GRACE_MIN: 30,  // po X min od startu można żądać walkowera
  MATCH_EXPIRE_HOURS: 24,  // mecz bez wyniku wygasa po X h od startu
  MIN_LEAD_MIN: 60,        // wyzwanie najwcześniej za X min
  MAX_LEAD_DAYS: 7,        // wyzwanie najpóźniej za X dni
  MIN_SKILL: 25,
  MAX_SKILL: 99,
};

export const OPEN_STATUSES = ['pending', 'accepted', 'reported', 'disputed'];
export const WIN_STATUSES = ['confirmed', 'walkover'];

export function distM(lat1, lng1, lat2, lng2) {
  const r = (d) => (d * Math.PI) / 180;
  const a = Math.sin(r(lat2 - lat1) / 2) ** 2 +
    Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lng2 - lng1) / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(a));
}
