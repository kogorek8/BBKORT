// Karty umiejętności w stylu gier sportowych (skala 25–99), osobno dla każdego sportu
export const SKILL_SETS = {
  basketball: [
    { key: 'g_shooting',   items: ['close', 'mid', 'three', 'ft'] },
    { key: 'g_playmaking', items: ['handle', 'pass', 'speedBall'] },
    { key: 'g_defense',    items: ['perimD', 'interiorD', 'steal', 'block'] },
    { key: 'g_athletic',   items: ['speed', 'vertical', 'strength', 'stamina'] },
    { key: 'g_rebounding', items: ['offReb', 'defReb'] },
  ],
  football: [
    { key: 'f_pace',      items: ['acceleration', 'sprint'] },
    { key: 'f_shooting',  items: ['finishing', 'shotPower', 'longShots', 'penalties'] },
    { key: 'f_passing',   items: ['vision', 'shortPass', 'longPass', 'crossing'] },
    { key: 'f_dribbling', items: ['agility', 'ballControl', 'dribble'] },
    { key: 'f_defending', items: ['interceptions', 'tackle', 'marking', 'heading'] },
    { key: 'f_physical',  items: ['fStrength', 'fStamina', 'jumping'] },
    { key: 'f_goalkeeping', items: ['gkDiving', 'gkHandling', 'gkReflexes'] },
  ],
};

export const POSITIONS = {
  basketball: ['PG', 'SG', 'SF', 'PF', 'C'],
  football: ['GK', 'DEF', 'MID', 'FWD'],
};

export const skillGroups = (sport) => SKILL_SETS[sport] || SKILL_SETS.basketball;
export const skillKeys = (sport) => skillGroups(sport).flatMap((g) => g.items);

const avg = (a) => a.reduce((s, x) => s + x, 0) / a.length;

export function defaultSkills(sport) {
  return Object.fromEntries(skillKeys(sport).map((k) => [k, 50]));
}

// zatwierdzone skille zawodnika dla danego sportu
export const skillsOf = (p, sport) => (p && p.skills && p.skills[sport || p.sport]) || null;

// OVR: mocne strony liczą się bardziej (jak w grach)
// Piłka nożna: bramkarz liczony z umiejętności bramkarskich (+ fizyczność),
// zawodnik z pola – bez umiejętności bramkarskich.
function ovrKeys(sport, position) {
  if (sport !== 'football') return skillKeys(sport);
  const gk = skillGroups('football').find((g) => g.key === 'f_goalkeeping').items;
  if (position === 'GK') return [...gk, 'jumping', 'fStrength', 'agility'];
  return skillKeys('football').filter((k) => !gk.includes(k));
}

export function ovr(values, sport, position) {
  if (!values) return null;
  const keys = sport ? ovrKeys(sport, position) : Object.keys(values);
  const v = keys.map((k) => Number(values[k])).filter((x) => !isNaN(x)).sort((a, b) => b - a);
  if (!v.length) return null;
  const top = Math.min(8, Math.ceil(v.length * 0.6));
  return Math.round(0.6 * avg(v.slice(0, top)) + 0.4 * avg(v));
}

export const playerOvr = (p, sport) => ovr(skillsOf(p, sport), sport || p?.sport, p?.position);

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

// RATING DRUŻYNY – TYMCZASOWY wzór (średni OVR zatwierdzonych zawodników w sporcie drużyny).
// Docelowy wzór ustalimy później – wystarczy podmienić tę jedną funkcję.
export function teamRating(members, sport) {
  const o = members.map((m) => playerOvr(m, sport)).filter((x) => x != null);
  if (!o.length) return null;
  return Math.round(avg(o));
}
