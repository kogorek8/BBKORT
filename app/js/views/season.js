// SEZON i ODZNAKI
import { t } from '../i18n.js';
import { SEASONS, SPORTS, SPORT_ICON, BADGES, BADGE_TIERS, SPECIAL_BADGES, SEASON_POINTS, STAT_KEYS, seasonAt } from '../rules.js';
import { esc, bind, teamTag, fmtDay, fmtLeft } from '../ui.js';
import { store, seasonStandings, seasonScorers, badgesOf, specialBadges, now, ui, setSport } from '../state.js';

export function badgeChip(b, big = false) {
  const tn = b.tier ? BADGE_TIERS[b.tier - 1] : 'locked';
  return `<div class="badge2 ${tn} ${big ? 'big' : ''}" title="${esc(t('bd_' + b.code + '_d'))}">
    <span class="b-ic">${b.icon}</span><span class="b-name">${t('bd_' + b.code)}</span>
    <span class="b-tier">${b.tier ? t('bt_' + tn) : `${b.value}/${b.tiers[0]}`}</span></div>`;
}
export const specialChip = (b) => `<div class="badge2 special" title="${esc(b.note || '')}"><span class="b-ic">🌟</span><span class="b-name">${t('sb_' + b.code)}</span><span class="b-tier">${esc(b.note || t('bt_special'))}</span></div>`;

export function seasonBanner() {
  const se = seasonAt(now());
  return `<a class="season-banner s-${se.code}" href="#/season"><span class="sb-ic">${se.icon}</span>
    <div><div class="small">${t('season_now')}</div><b>${t('se_' + se.code)} ${se.year}</b><div class="small">${t('season_ends', { t: fmtLeft(se.end - now()) })}</div></div><span class="chev">›</span></a>`;
}

export function renderSeason(root) {
  const se = seasonAt(now());
  const sports = ui.sport === 'all' ? SPORTS : [ui.sport];
  const me = store.me;
  root.innerHTML = `
    <div class="season-hero s-${se.code}"><div class="sh-ic">${se.icon}</div>
      <div class="small">${t('season_now')} · ${fmtDay(new Date(se.start).toISOString())} – ${fmtDay(new Date(se.end - 864e5).toISOString())}</div>
      <h1>${t('se_' + se.code)} ${se.year}</h1><p>${t('se_' + se.code + '_d')}</p>
      <div class="pill">⏳ ${t('season_ends', { t: fmtLeft(se.end - now()) })}</div></div>

    <h3>🎁 ${t('season_rewards')}</h3>
    <div class="rewards">${[1, 2, 3].map((i) => `<div class="reward r${i}"><span>${['🥇', '🥈', '🥉'][i - 1]}</span><div><b>${t('sr_' + i + '_t')}</b><div class="small muted">${t('sr_' + i + '_d')}</div></div></div>`).join('')}
      <div class="reward"><span>🌟</span><div><b>${t('sr_mvp_t')}</b><div class="small muted">${t('sr_mvp_d')}</div></div></div></div>
    <p class="small muted">${t('season_points', SEASON_POINTS)}</p>

    <div class="seg wide">${['all', ...SPORTS].map((s) => `<button data-act="sport" data-s="${s}" class="${ui.sport === s ? 'on' : ''}">${s === 'all' ? t('all') : SPORT_ICON[s] + ' ' + t('sport_' + s)}</button>`).join('')}</div>
    ${sports.map((s) => {
      const { rows } = seasonStandings(s);
      const sc = seasonScorers(s);
      return `<h3>${SPORT_ICON[s]} ${t('season_table')}</h3>
        <div class="ltable-wrap"><table class="ltable"><thead><tr><th>#</th><th class="l">${t('team')}</th><th>${t('pts')}</th><th title="${t('wins')}">W</th><th>⚔️</th><th>🛡️</th></tr></thead>
        <tbody>${rows.map((r) => `<tr class="${r.pos === 1 && r.pts ? 'lead' : ''}" style="--c:${esc(r.team.color)}"><td class="pos">${r.pts ? (['🥇', '🥈', '🥉'][r.pos - 1] || r.pos) : r.pos}</td>
          <td class="l"><a href="#/team/${esc(r.team.id)}">${teamTag(r.team)} <span class="tname">${esc(r.team.name)}</span></a></td><td><b>${r.pts}</b></td><td>${r.wins}</td><td>${r.captures}</td><td>${r.defends}</td></tr>`).join('') || `<tr><td colspan="6" class="muted">${t('no_teams')}</td></tr>`}</tbody></table></div>
        ${sc.length ? `<h4>🔥 ${t('season_scorers_' + STAT_KEYS[s][0])}</h4><ul class="ledger">${sc.map((x, i) => `<li><span>${i + 1}. <a href="#/player/${esc(x.p.id)}">${esc(x.p.nick)}</a> <span class="muted small">(${x.n} ${t('matches_played').toLowerCase()})</span></span><b>${x.total}</b></li>`).join('')}</ul>` : ''}`;
    }).join('')}

    <h3>🗓️ ${t('seasons_all')}</h3>
    <div class="seasons">${SEASONS.map((x) => `<div class="season-card s-${x.code} ${x.code === se.code ? 'now' : ''}"><span>${x.icon}</span><div><b>${t('se_' + x.code)}</b><div class="small">${t('se_' + x.code + '_d')}</div></div></div>`).join('')}</div>

    <h3>🏅 ${t('badges_title')}</h3>
    <p class="small muted">${t('badges_hint')}</p>
    <div class="badges-grid">${(me ? badgesOf(me) : BADGES.map((b) => ({ ...b, tier: 0, value: 0 }))).map((b) => `<div class="badge-row">${badgeChip(b, true)}
      <div class="small muted">${t('bd_' + b.code + '_d')}<br>${b.tiers.map((n, i) => `<span class="tierdot ${BADGE_TIERS[i]} ${b.tier > i ? 'on' : ''}">${n}</span>`).join(' ')}</div></div>`).join('')}</div>
    <h4>🌟 ${t('badges_special')}</h4>
    <div class="badges-wrap">${SPECIAL_BADGES.map((c) => { const has = me && specialBadges(me.id).find((b) => b.code === c); return `<div class="badge2 ${has ? 'special' : 'locked'}"><span class="b-ic">🌟</span><span class="b-name">${t('sb_' + c)}</span><span class="b-tier">${t('sb_' + c + '_d')}</span></div>`; }).join('')}</div>`;
  bind(root, { sport: (d) => { setSport(d.s); renderSeason(root); } });
}
