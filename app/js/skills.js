// Karta zawodnika jak w grach: 6 głównych pasków (skala 25–99). Paski ustawia admin / sędzia.
export const SKILL_SETS = {
  basketball: [{ key: 'g_main', items: ['inside', 'shooting', 'playmaking', 'defense', 'rebounding', 'athleticism'] }],
  football: [{ key: 'g_main', items: ['pace', 'shot', 'passing', 'dribbling', 'defending', 'physical'] }],
};

export const POSITIONS = {
  basketball: ['PG', 'SG', 'SF', 'PF', 'C'],
  football: ['GK', 'DEF', 'MID', 'FWD'],
};

export const skillGroups = (sport) => SKILL_SETS[sport] || SKILL_SETS.basketball;
export const skillKeys = (sport) => skillGroups(sport).flatMap((g) => g.items);

const avg = (a) => a.reduce((s, x) => s + x, 0) / a.length;

export function defaultSkills(sport) {
  return Object.fromEntries(skillKeys(sport).map((k) => [k, 60]));
}

// zatwierdzone skille zawodnika dla danego sportu
export const skillsOf = (p, sport) => (p && p.skills && p.skills[sport || p.sport]) || null;

// OVR: trzy najmocniejsze strony liczą się bardziej (jak w grach)
export function ovr(values, sport) {
  if (!values) return null;
  const keys = sport ? skillKeys(sport) : Object.keys(values);
  const v = keys.map((k) => Number(values[k])).filter((x) => !isNaN(x)).sort((a, b) => b - a);
  if (!v.length) return null;
  return Math.round(0.6 * avg(v.slice(0, 3)) + 0.4 * avg(v));
}

export const playerOvr = (p, sport) => ovr(skillsOf(p, sport), sport || p?.sport);

export function groupAvg(values, group) {
  if (!values) return null;
  return Math.round(avg(group.items.map((k) => Number(values[k]) || 0)));
}

export function tier(v) {
  if (v == null) return 't-none';
  if (v >= 90) return 't-elite';
  if (v >= 80) return 't-gold';
  if (v >= 70) return 't-green';
  if (v >= 60) return 't-yellow';
  return 't-low';
}

// RATING DRUŻYNY – TYMCZASOWY wzór (średni OVR zawodników w sporcie drużyny)
export function teamRating(members, sport) {
  const o = members.map((m) => playerOvr(m, sport)).filter((x) => x != null);
  if (!o.length) return null;
  return Math.round(avg(o));
}
