// PANEL (admin + moderatorzy): wyniki do zatwierdzenia, skille, moderatorzy, narzędzia demo
import { api } from '../api/index.js';
import { t } from '../i18n.js';
import { H } from '../rules.js';
import { ovr, tier, skillsOf } from '../skills.js';
import { esc, bind, teamTag, fmtDate, fmtLeft, confirmBox } from '../ui.js';
import { store, act, reload, teamById, isAdmin, isStaff, teamChallenges, now, T, openIssues } from '../state.js';
import { CITY_PRESETS, tiles, fetchArea, parseCourts } from '../courts-import.js';
import { SPORTS } from '../rules.js';
import { getMapBounds } from './map.js';
import { SPORT_ICON } from '../rules.js';
import { toast } from '../ui.js';
import { skillBars } from './player.js';
import { challengeCard, challengeHandlers } from './matches.js';

let tab = 'results', q = '', importing = false;

const recentLine = (p) => {
  if (!p.team_id) return `<span class="muted">${t('free_agent')}</span>`;
  const ms = teamChallenges(p.team_id).filter((c) => c.winner_team_id).slice(0, 5);
  return ms.map((c) => `<span class="res ${c.winner_team_id === p.team_id ? 'w' : 'l'}">${c.winner_team_id === p.team_id ? 'W' : 'L'}</span>`).join('') || `<span class="muted">${t('no_matches')}</span>`;
};

function statsQueue() {
  const q = store.data.match_stats.filter((m) => m.status === 'pending');
  if (!q.length) return `<p class="muted small">${t('none')}</p>`;
  return q.map((m) => {
    const p = store.data.profiles.find((x) => x.id === m.player_id);
    const c = store.data.challenges.find((x) => x.id === m.challenge_id);
    const court = store.data.courts.find((x) => x.id === c?.court_id);
    return `<div class="review" data-stat="${esc(m.challenge_id)}|${esc(m.player_id)}">
      <div><a href="#/player/${esc(m.player_id)}"><b>${esc(p?.nick || '?')}</b></a> ${teamTag(teamById(m.team_id))} <span class="muted small">· ${esc(court?.name || '')} · ${fmtDate(c?.scheduled_at)}${c?.score_challenger != null ? ` · ${c.score_challenger}:${c.score_defender}` : ''}</span></div>
      <div class="stat-in">${Object.entries(m.stats).map(([k, v]) => `<label>${t('st_' + k)}<input type="number" min="0" max="200" data-k="${esc(k)}" value="${v}"></label>`).join('')}</div>
      <div class="small muted">${t('stats_edit_hint')}</div>
      <div class="row"><button class="btn primary small" data-act="stat-yes">✔ ${t('approve')}</button><button class="btn ghost danger small" data-act="stat-no">✖ ${t('reject')}</button></div></div>`;
  }).join('');
}

function gameTab() {
  const d = store.data;
  const orders = d.purchases.filter((x) => x.status === 'pending');
  return `
    <h3>📦 ${t('orders_pending')} (${orders.length})</h3>
    ${orders.map((o) => { const it = d.shop_items.find((i) => i.id === o.item_id); const p = d.profiles.find((x) => x.id === o.player_id);
      return `<div class="review"><div><b>${esc(it?.title || '?')}</b> · <a href="#/player/${esc(o.player_id)}">${esc(p?.nick || '?')}</a> <span class="muted small">· ${fmtDate(o.created_at)} · 🪙 ${o.cost}</span></div>
        ${o.note ? `<div class="small">„${esc(o.note)}”</div>` : ''}
        <div class="row"><button class="btn primary small" data-act="ord-yes" data-id="${esc(o.id)}">✔ ${t('order_done')}</button><button class="btn ghost danger small" data-act="ord-no" data-id="${esc(o.id)}">↩ ${t('order_refund')}</button></div></div>`; }).join('') || `<p class="muted small">${t('none')}</p>`}

    <h3>🎁 ${t('drops_admin')}</h3>
    <div class="review"><p class="small muted">${t('drops_admin_hint')}</p>
      <input id="dr-title" placeholder="${t('drop_f_title')}" maxlength="100"><input id="dr-prize" placeholder="${t('drop_f_prize')}" maxlength="200">
      <textarea id="dr-hint" rows="2" placeholder="${t('drop_f_hint')}"></textarea>
      <div class="row2"><input id="dr-code" placeholder="${t('drop_f_code')}"><input id="dr-coins" type="number" placeholder="${t('drop_f_coins')}" value="100"></div>
      <button class="btn primary" data-act="drop-add">＋ ${t('drop_publish')}</button></div>
    ${d.drops.slice().sort((a, b) => T(b.created_at) - T(a.created_at)).slice(0, 6).map((x) => `<div class="notice row-between"><span>${esc(x.title)} <span class="pill ${x.status === 'active' ? 'ok' : ''}">${t('dst_' + x.status)}</span>${x.claimed_by ? ` · ${esc(d.profiles.find((p) => p.id === x.claimed_by)?.nick || '?')}` : ''}</span>
      ${x.status === 'active' ? `<button class="btn small ghost" data-act="drop-end" data-id="${esc(x.id)}">${t('drop_end')}</button>` : ''}</div>`).join('')}

    <h3>📰 ${t('posts_admin')}</h3>
    <div class="review"><p class="small muted">${t('posts_admin_hint')}</p>
      <select id="po-kind"><option value="news">${t('pk_news')}</option><option value="contest">${t('pk_contest')}</option><option value="ad">${t('pk_ad')}</option></select>
      <input id="po-title" placeholder="${t('post_f_title')}" maxlength="120"><textarea id="po-body" rows="3" placeholder="${t('post_f_body')}"></textarea>
      <input id="po-img" placeholder="${t('post_f_img')}"><input id="po-link" placeholder="${t('post_f_link')}">
      <label class="check"><input type="checkbox" id="po-pin"> ${t('post_f_pin')}</label>
      <button class="btn primary" data-act="post-add">＋ ${t('post_publish')}</button></div>
    ${d.posts.slice().sort((a, b) => T(b.created_at) - T(a.created_at)).map((x) => `<div class="notice row-between"><span><span class="post-kind">${t('pk_' + x.kind)}</span> ${esc(x.title)}${x.pinned ? ' 📌' : ''}</span>
      <button class="btn small ghost danger" data-act="post-del" data-id="${esc(x.id)}">🗑️</button></div>`).join('')}

    <h3>🛒 ${t('shop_admin')}</h3>
    <div class="review"><p class="small muted">${t('shop_admin_hint')}</p>
      <input id="it-title" placeholder="${t('item_f_title')}" maxlength="80"><input id="it-descr" placeholder="${t('item_f_descr')}" maxlength="400">
      <div class="row2"><input id="it-cost" type="number" placeholder="${t('item_f_cost')}"><input id="it-stock" type="number" placeholder="${t('item_f_stock')}"></div>
      <input id="it-sponsor" placeholder="${t('item_f_sponsor')}"><input id="it-img" placeholder="${t('post_f_img')}">
      <button class="btn primary" data-act="item-add">＋ ${t('item_add')}</button></div>
    ${d.shop_items.slice().sort((a, b) => a.sort - b.sort).map((x) => `<div class="notice row-between"><span>${{ cosmetic: '🖼️', perk: '⚡', reward: '🎁' }[x.kind]} ${esc(x.title)} <span class="muted small">· 🪙 ${x.cost}${x.stock != null ? ` · ${t('in_stock', { n: x.stock })}` : ''}</span></span>
      <button class="btn small ${x.active ? 'ghost' : 'primary'}" data-act="item-toggle" data-id="${esc(x.id)}">${x.active ? t('item_hide') : t('item_show')}</button></div>`).join('')}`;
}

function resultsTab() {
  const toApprove = store.data.challenges.filter((c) => c.status === 'reported').sort((a, b) => T(a.scheduled_at) - T(b.scheduled_at));
  const noRef = store.data.challenges.filter((c) => ['pending', 'accepted'].includes(c.status) && !c.referee_id).sort((a, b) => T(a.scheduled_at) - T(b.scheduled_at));
  const mine = store.data.challenges.filter((c) => c.status === 'accepted' && c.referee_id === store.me.id);
  const review = store.data.challenges.filter((c) => ['review', 'proposed'].includes(c.status)).sort((a, b) => (a.status === 'review' ? -1 : 1) - (b.status === 'review' ? -1 : 1) || T(a.created_at) - T(b.created_at));
  return `
    <h3>🧑‍⚖️ ${t('actions_to_approve')} (${review.filter((c) => c.status === 'review').length})</h3>
    <p class="small muted">${t('actions_hint')}</p>
    ${review.length ? `<div class="matches">${review.map((c) => challengeCard(c)).join('')}</div>` : `<p class="muted small">${t('none')}</p>`}
    <h3>📊 ${t('stats_to_approve')} (${store.data.match_stats.filter((m) => m.status === 'pending').length})</h3>
    ${statsQueue()}
    <h3>📝 ${t('results_to_approve')} (${toApprove.length})</h3>
    ${toApprove.length ? `<div class="matches">${toApprove.map((c) => challengeCard(c)).join('')}</div>` : `<p class="muted small">${t('queue_empty')}</p>`}
    <h3>🧑‍⚖️ ${t('my_refereeing')} (${mine.length})</h3>
    ${mine.length ? `<div class="matches">${mine.map((c) => challengeCard(c)).join('')}</div>` : `<p class="muted small">${t('none')}</p>`}
    <h3>⚠️ ${t('need_referee')} (${noRef.length})</h3>
    ${noRef.length ? `<div class="matches">${noRef.map((c) => challengeCard(c)).join('')}</div>` : `<p class="muted small">${t('none')}</p>`}`;
}

function skillsTab() {
  const queue = store.data.profiles.filter((p) => p.skills_status === 'pending')
    .sort((a, b) => T(a.skills_submitted_at) - T(b.skills_submitted_at));
  if (!queue.length) return `<p class="muted small">${t('queue_empty')}</p>`;
  return queue.map((p) => {
    const tm = teamById(p.team_id);
    const sport = p.skills_pending_sport || p.sport;
    const old = skillsOf(p, sport);
    return `<div class="review">
      <div class="review-head">
        <a href="#/player/${esc(p.id)}"><b>${esc(p.nick)}</b></a> ${teamTag(tm)} <span class="muted small">${t('sport_' + sport)} · ${esc(p.position || '')} · ${fmtDate(p.skills_submitted_at)}</span>
        <div class="review-ovr"><span class="ovr ${tier(ovr(old, sport))}">${ovr(old, sport) ?? '—'}</span> → <span class="ovr ${tier(ovr(p.skills_pending, sport))}">${ovr(p.skills_pending, sport)}</span></div>
      </div>
      <div class="small">${t('last_results')}: ${recentLine(p)} ${p.ghost_count ? ` · 👻 ×${p.ghost_count}` : ''}</div>
      ${p.skills_video ? `<a class="btn ghost small" target="_blank" rel="noopener" href="${esc(p.skills_video)}">🎬 ${t('video')}</a>` : `<span class="small muted">${t('no_video')}</span>`}
      <details><summary>${t('show_diff')}</summary><div class="skills">${skillBars(p.skills_pending, old, sport)}</div></details>
      <input class="note" placeholder="${t('admin_note')}" id="note-${esc(p.id)}">
      <div class="row"><button class="btn primary" data-act="approve" data-id="${esc(p.id)}">✔ ${t('approve')}</button>
      <button class="btn ghost danger" data-act="reject" data-id="${esc(p.id)}">✖ ${t('reject')}</button></div>
    </div>`;
  }).join('');
}

function modsTab() {
  const ql = q.trim().toLowerCase();
  const people = store.data.profiles
    .filter((p) => !p.is_admin && (p.is_moderator || (ql && p.nick.toLowerCase().includes(ql))))
    .sort((a, b) => Number(b.is_moderator) - Number(a.is_moderator) || a.nick.localeCompare(b.nick));
  return `<p class="small muted">${t('mods_hint')}</p>
    <input type="search" id="mq" placeholder="${t('search_player')}" value="${esc(q)}">
    <div class="ulist">${people.map((p) => `<div class="uitem row-between">
      <span><b>${esc(p.nick)}</b> ${teamTag(teamById(p.team_id))} ${p.is_moderator ? `<span class="pill ok">🧑‍⚖️ ${t('moderator')}</span>` : ''}</span>
      <button class="btn small ${p.is_moderator ? 'ghost danger' : 'primary'}" data-act="mod" data-id="${esc(p.id)}" data-on="${p.is_moderator ? '0' : '1'}">${p.is_moderator ? t('remove_mod') : t('make_mod')}</button>
    </div>`).join('') || `<p class="muted small">${t('type_to_search')}</p>`}</div>`;
}

function courtsTab() {
  const n = (sp) => store.data.courts.filter((c) => c.sport === sp).length;
  return `<p class="small muted">${t('import_hint')}</p>
    <div class="stats">
      <div class="stat"><b>${n('basketball')}</b><span>${SPORT_ICON.basketball} ${t('sport_basketball')}</span></div>
      <div class="stat"><b>${n('football')}</b><span>${SPORT_ICON.football} ${t('sport_football')}</span></div>
    </div>
    <div class="review">
      <b>${t('import_city')}</b>
      <select id="city">${Object.keys(CITY_PRESETS).map((c) => `<option>${esc(c)}</option>`).join('')}</select>
      <div class="row"><button class="btn primary" data-act="import-city" ${importing ? 'disabled' : ''}>⬇️ ${t('import_go')}</button>
        <button class="btn" data-act="import-view" ${importing ? 'disabled' : ''}>🗺️ ${t('import_view')}</button></div>
      <div id="imp-status" class="small"></div>
    </div>
    <div class="review">
      <b>📂 ${t('file_import')}</b>
      <p class="small muted">${t('file_import_hint')}</p>
      <select id="fi-sport">${SPORTS.map((sp) => `<option value="${sp}">${SPORT_ICON[sp]} ${t('sport_' + sp)}</option>`).join('')}</select>
      <input type="file" id="fi-file" accept=".kml,.json,.geojson,.csv,.txt">
      <textarea id="fi-text" rows="3" placeholder="${t('file_import_ph')}"></textarea>
      <button class="btn primary" data-act="import-file">⬆️ ${t('file_import_go')}</button>
      <div id="fi-status" class="small"></div>
    </div>
    <h3>📥 ${t('pending_courts')} (${store.data.pending_courts.length})</h3>
    ${store.data.pending_courts.map((c) => `<div class="review"><b>${SPORT_ICON[c.sport]} ${esc(c.name)}</b>
      <div class="small muted">${esc(c.address || '')} · ${esc(store.data.profiles.find((p) => p.id === c.added_by)?.nick || '?')} ·
        <a href="https://www.google.com/maps?q=${c.lat},${c.lng}" target="_blank" rel="noopener">📍 ${t('see_on_map')}</a></div>
      <div class="row"><button class="btn primary small" data-act="court-yes" data-id="${esc(c.id)}">✔ ${t('approve')}</button>
      <button class="btn ghost danger small" data-act="court-no" data-id="${esc(c.id)}">✖ ${t('reject')}</button></div></div>`).join('') || `<p class="muted small">${t('none')}</p>`}
    <h3>🔧 ${t('issues_title')} (${openIssues().length})</h3>
    ${openIssues().map((i) => `<div class="review"><a href="#/map/${esc(i.court_id)}"><b>${esc(store.data.courts.find((c) => c.id === i.court_id)?.name || t('court_unnamed'))}</b></a>
      <div>${esc(i.text)}</div><div class="row"><button class="btn small" data-act="issue-ok" data-id="${esc(i.id)}">✔ ${t('issue_resolve')}</button></div></div>`).join('') || `<p class="muted small">${t('none')}</p>`}
    <p class="small muted">★ ${t('rv_where')}</p>`;
}

async function runImport(root, box, label) {
  if (importing) return;
  importing = true;
  const status = () => root.querySelector('#imp-status');
  const parts = tiles(box);
  let found = 0, added = 0, failed = 0;
  root.querySelectorAll('[data-act^=import]').forEach((b) => (b.disabled = true));
  for (let i = 0; i < parts.length; i++) {
    if (status()) status().textContent = `${label}: ${t('import_progress', { i: i + 1, n: parts.length, f: found, a: added })}`;
    try {
      const list = await fetchArea(parts[i]);
      found += list.length;
      for (let j = 0; j < list.length; j += 250) added += (await api.rpc('import_courts', { p_courts: list.slice(j, j + 250) })) || 0;
    } catch (e) { failed++; console.warn(e); }
    await new Promise((r) => setTimeout(r, 800)); // nie przeciążamy serwera OSM
  }
  importing = false;
  toast(t('import_done', { a: added, f: found }) + (failed ? ` · ${t('import_failed', { n: failed })}` : ''), failed && !found ? 'err' : 'ok');
  await reload();
}

function demoTab() {
  return `<div class="review">
    <p class="small muted">${t('demo_tools_hint')}</p>
    <div class="small">${t('demo_time')}: <b>${fmtDate(new Date(now()).toISOString())}</b>${api.demo.timeOffset() ? ` (+${fmtLeft(api.demo.timeOffset())})` : ''}</div>
    <div class="row"><button class="btn small" data-act="shift" data-h="0.5">+30 min</button>
      <button class="btn small" data-act="shift" data-h="1">+1 h</button>
      <button class="btn small" data-act="shift" data-h="48">+48 h</button></div>
    <label class="check"><input type="checkbox" id="fakegps" ${api.demo.fakeGps() ? 'checked' : ''}> ${t('demo_fake_gps')}</label>
    <button class="btn ghost danger small" data-act="reset">${t('demo_reset')}</button>
  </div>`;
}

export function renderAdmin(root) {
  if (!isStaff()) { root.innerHTML = `<p class="muted">${t('err_not_staff')}</p>`; return; }
  const tabs = [['results', '📝 ' + t('tab_results')], ['skills', '⏳ ' + t('tab_skills')],
    ['courts', '📍 ' + t('tab_courts')],
    ...(isAdmin() ? [['game', '🎮 ' + t('tab_game')]] : []),
    ...(isAdmin() ? [['mods', '🧑‍⚖️ ' + t('tab_mods')]] : []), ...(api.mode === 'demo' ? [['demo', '🧪 Demo']] : [])];
  if (!tabs.some(([k]) => k === tab)) tab = 'results';
  const body = { results: resultsTab, skills: skillsTab, courts: courtsTab, game: gameTab, mods: modsTab, demo: demoTab }[tab]();

  root.innerHTML = `
    <div class="page-head"><h1>🛠️ ${t('nav_admin')}</h1><span class="muted small">${isAdmin() ? 'Admin' : t('moderator')}</span></div>
    <div class="seg wide tabs">${tabs.map(([k, l]) => `<button data-act="tab" data-v="${k}" class="${tab === k ? 'on' : ''}">${l}</button>`).join('')}</div>
    ${body}`;

  const fg = root.querySelector('#fakegps');
  if (fg) fg.onchange = () => api.demo.setFakeGps(fg.checked);
  const mq = root.querySelector('#mq');
  if (mq) mq.oninput = () => { q = mq.value; renderAdmin(root); const i = root.querySelector('#mq'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); };
  const note = (id) => root.querySelector('#note-' + CSS.escape(id))?.value || '';
  const v = (sel) => root.querySelector(sel)?.value || '';
  const reviewStat = (el, ok) => {
    const box = el.closest('[data-stat]');
    const [cid, pid] = box.dataset.stat.split('|');
    const stats = Object.fromEntries([...box.querySelectorAll('input[data-k]')].map((i) => [i.dataset.k, parseInt(i.value, 10) || 0]));
    return act('review_match_stats', { p_id: cid, p_player: pid, p_approve: ok, p_stats: stats, p_note: null }, ok ? 'ok_approved_action' : 'ok_saved');
  };
  bind(root, {
    ...challengeHandlers,
    tab: (d) => { tab = d.v; renderAdmin(root); },
    approve: (d) => act('review_skills', { p_player: d.id, p_approve: true, p_note: note(d.id) }, 'ok_approved'),
    reject: (d) => act('review_skills', { p_player: d.id, p_approve: false, p_note: note(d.id) }, 'ok_rejected'),
    mod: (d) => act('admin_set_moderator', { p_player: d.id, p_on: d.on === '1' }, 'ok_saved'),
    'stat-yes': (d, el) => reviewStat(el, true),
    'stat-no': (d, el) => reviewStat(el, false),
    'ord-yes': (d) => act('admin_purchase', { p_id: d.id, p_fulfilled: true }, 'ok_saved'),
    'ord-no': (d) => act('admin_purchase', { p_id: d.id, p_fulfilled: false }, 'ok_saved'),
    'drop-add': () => act('create_drop', { p_data: { title: v('#dr-title'), prize: v('#dr-prize'), hint: v('#dr-hint'), code: v('#dr-code'), coins: parseInt(v('#dr-coins'), 10) || 0 } }, 'ok_drop_added'),
    'drop-end': (d) => act('end_drop', { p_id: d.id }, 'ok_saved'),
    'post-add': () => act('save_post', { p_id: null, p_data: { kind: v('#po-kind'), title: v('#po-title'), body: v('#po-body'), image_url: v('#po-img'), link_url: v('#po-link'), pinned: root.querySelector('#po-pin').checked, active: true } }, 'ok_saved'),
    'post-del': async (d) => { if (await confirmBox(t('delete_q'))) act('delete_post', { p_id: d.id }, 'ok_saved'); },
    'item-add': () => act('save_shop_item', { p_id: null, p_data: { kind: 'reward', title: v('#it-title'), descr: v('#it-descr'), cost: parseInt(v('#it-cost'), 10), stock: v('#it-stock'), sponsor: v('#it-sponsor'), image_url: v('#it-img'), active: true } }, 'ok_saved'),
    'item-toggle': (d) => { const it = store.data.shop_items.find((i) => i.id === d.id); return act('save_shop_item', { p_id: it.id, p_data: { ...it, stock: it.stock ?? '', active: !it.active } }, 'ok_saved'); },
    'court-yes': (d) => act('review_court', { p_court: d.id, p_approve: true }, 'ok_saved'),
    'court-no': (d) => act('review_court', { p_court: d.id, p_approve: false }, 'ok_saved'),
    'issue-ok': (d) => act('resolve_issue', { p_id: Number(d.id) || d.id }, 'ok_saved'),
    shift: (d) => api.demo.shiftTime(Number(d.h) * H),
    'import-file': async () => {
      const f = root.querySelector('#fi-file').files[0];
      const text = f ? await f.text() : root.querySelector('#fi-text').value;
      const st = root.querySelector('#fi-status');
      let list = [];
      try { list = parseCourts(text || '', root.querySelector('#fi-sport').value); } catch (e) { return toast(t('file_import_bad'), 'err'); }
      if (!list.length) return toast(t('file_import_none'), 'err');
      let added = 0;
      for (let j = 0; j < list.length; j += 250) {
        st.textContent = `${Math.min(j + 250, list.length)}/${list.length}…`;
        const r = await act('import_courts', { p_courts: list.slice(j, j + 250) });
        if (r == null) return;
        added += Number(r) || 0;
      }
      toast(t('import_done', { a: added, f: list.length }), 'ok');
    },
    'import-city': () => { const c = root.querySelector('#city').value; runImport(root, CITY_PRESETS[c], c); },
    'import-view': () => {
      const b = getMapBounds();
      if (!b) return toast(t('import_open_map'), 'err');
      const area = (b.getNorth() - b.getSouth()) * (b.getEast() - b.getWest());
      if (area > 1.5) return toast(t('import_too_big'), 'err');
      runImport(root, [b.getSouth(), b.getWest(), b.getNorth(), b.getEast()], t('import_view'));
    },
    reset: async () => { if (await confirmBox(t('demo_reset') + '?')) api.demo.reset(); },
  });
}
