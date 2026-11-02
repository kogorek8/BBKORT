// Karta umiejętności w stylu gier koszykarskich (skala 25–99)
export const SKILL_GROUPS = [
  { key: 'g_shooting',   items: ['close', 'mid', 'three', 'ft'] },
  { key: 'g_playmaking', items: ['handle', 'pass', 'speedBall'] },
  { key: 'g_defense',    items: ['perimD', 'interiorD', 'steal', 'block'] },
  { key: 'g_athletic',   items: ['speed', 'vertical', 'strength', 'stamina'] },
  { key: 'g_rebounding', items: ['offReb', 'defReb'] },
];
export const ALL_SKILLS = SKILL_GROUPS.flatMap((g) => g.items);
export const POSITIONS = ['PG', 'SG', 'SF', 'PF', 'C'];

const avg = (a) => a.reduce((s, x) => s + x, 0) / a.length;

export function defaultSkills() {
  return Object.fromEntries(ALL_SKILLS.map((k) => [k, 50]));
}

// OVR: mocne strony liczą się bardziej (jak w grach)
export function ovr(skills) {
  if (!skills) return null;
  const v = ALL_SKILLS.map((k) => Number(skills[k])).filter((x) => !isNaN(x)).sort((a, b) => b - a);
  if (!v.length) return null;
  return Math.round(0.6 * avg(v.slice(0, 8)) + 0.4 * avg(v));
}

export function groupAvg(skills, group) {
  if (!skills) return null;
  return Math.round(avg(group.items.map((k) => Number(skills[k]) || 0)));
}

export function tier(v) {
  if (v == null) return 't-none';
  if (v >= 90) return 't-elite';
  if (v >= 80) return 't-gold';
  if (v >= 70) return 't-green';
  if (v >= 60) return 't-yellow';
  return 't-low';
}

// RATING DRUŻYNY – TYMCZASOWY wzór (średni OVR zatwierdzonych zawodników).
// Docelowy wzór ustalimy później – wystarczy podmienić tę jedną funkcję.
export function teamRating(members) {
  const o = members.map((m) => ovr(m.skills)).filter((x) => x != null);
  if (!o.length) return null;
  return Math.round(avg(o));
}
