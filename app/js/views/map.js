// Mapa boisk – tryb "King of the Court" z terenem drużyn
import { CONFIG } from '../config.js';
import { api } from '../api/index.js';
import { t } from '../i18n.js';
import { RULES, SPORTS, SPORT_ICON, COURT_CRITERIA, distM } from '../rules.js';
import { geo, currentPos } from '../geo.js';
import { fetchArea, googleSatelliteUrl } from '../courts-import.js';
import { esc, bind, modal, toast, fmtDate, fmtDay, fmtLeft, fmtDist, teamTag, localInputValue, confirmBox } from '../ui.js';
import {
  store, act, reload, now, T, teamById, myTeam, isCaptainOf, isAdmin, openChallengeForCourt, courtName, courtHistory,
  courtById, errText, ui, setSport, sportOk, zones, standings, lastCapture, rerender, courtRating, myCourtRating, profileById,
  isOgSpot, reviewOf, upcomingGames, openIssues, isStaff,
} from '../state.js';
import { reviewBlock, ogBadge, openReviewEditor } from './spots.js';
import { gameCard, gameHandlers, openCreateGame } from './games.js';

let map, markers, zoneLayer, meMarker, meCircle, layers = {}, curLayer = null;
let openCourtId = null, followedFirstFix = false, userMoved = false, showZones = true, ogOnly = false;
const PREF = 'bbkort_layer';
const POLAND = [[48.9, 14.0], [55.0, 24.3]];

function buildLayers() {
  const esri = (path, o = {}) => L.tileLayer(`https://server.arcgisonline.com/ArcGIS/rest/services/${path}/MapServer/tile/{z}/{y}/{x}`, { maxZoom: 20, maxNativeZoom: 19, ...o });
  const labels = () => [esri('Reference/World_Transportation', { opacity: 0.6 }), esri('Reference/World_Boundaries_and_Places')];

  // DARMOWO: ortofotomapa Geoportalu (Polska) na podkładzie Esri (reszta świata)
  layers.sat = L.layerGroup([
    esri('World_Imagery', { attribution: 'Imagery © Esri, Maxar, Earthstar Geographics' }),
    L.tileLayer.wms('https://mapy.geoportal.gov.pl/wss/service/PZGIK/ORTO/WMS/StandardResolution', {
      layers: 'Raster', format: 'image/jpeg', version: '1.3.0', maxZoom: 20, maxNativeZoom: 19,
      bounds: L.latLngBounds(POLAND), attribution: 'Ortofotomapa © GUGiK / geoportal.gov.pl',
    }),
    ...labels(),
  ]);
  layers.esri = L.layerGroup([esri('World_Imagery', { attribution: 'Imagery © Esri, Maxar, Earthstar Geographics' }), ...labels()]);
  layers.map = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 20, maxNativeZoom: 19, attribution: '© OpenStreetMap' });
  if (CONFIG.MAPBOX_TOKEN) {
    layers.mapbox = L.tileLayer(`https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/tiles/512/{z}/{x}/{y}@2x?access_token=${encodeURIComponent(CONFIG.MAPBOX_TOKEN)}`,
      { tileSize: 512, zoomOffset: -1, maxZoom: 21, attribution: '© Mapbox © OpenStreetMap' });
  }
  if (CONFIG.MAPTILER_KEY) {
    layers.maptiler = L.tileLayer(`https://api.maptiler.com/maps/hybrid/256/{z}/{x}/{y}.jpg?key=${encodeURIComponent(CONFIG.MAPTILER_KEY)}`,
      { maxZoom: 21, attribution: '© MapTiler © OpenStreetMap' });
  }
}

export function initMap() {
  map = L.map('map', { zoomControl: false }).setView(CONFIG.DEFAULT_CENTER, CONFIG.DEFAULT_ZOOM);
  L.control.zoom({ position: 'bottomright' }).addTo(map);
  buildLayers();

  let pref = 'sat';
  try { pref = localStorage.getItem(PREF) || 'sat'; } catch { /* ignore */ }
  setLayer(layers[pref] ? pref : 'sat');
  if (CONFIG.GOOGLE_MAPS_API_KEY) {
    googleSatelliteUrl().then((url) => {
      if (!url) return;
      layers.gsat = L.tileLayer(url, { maxZoom: 21, attribution: 'Imagery & map data © Google' });
      if (pref === 'gsat') setLayer('gsat');
    }).catch(() => {});
  }

  zoneLayer = L.layerGroup().addTo(map);
  // grupowanie pinezek, gdy boisk jest dużo (liczba w kółku → przybliż)
  markers = L.markerClusterGroup
    ? L.markerClusterGroup({ maxClusterRadius: 45, disableClusteringAtZoom: 15, showCoverageOnHover: false,
      iconCreateFunction: (cl) => L.divIcon({ className: '', html: `<div class="cluster">${cl.getChildCount()}</div>`, iconSize: [40, 40] }) })
    : L.layerGroup();
  markers.addTo(map);
  map.on('dragstart zoomstart', () => (userMoved = true));
  map.on('moveend', scheduleImport);

  geo.listeners.add(updateMe);
  if (geo.pos) updateMe(geo.pos);

  const ctr = document.getElementById('map-controls');
  ctr.innerHTML = `
    <button class="fab" data-act="layer" title="${t('map_layer')}">🛰️</button>
    <button class="fab" data-act="zones" title="${t('map_zones')}">🚩</button>
    <button class="fab" data-act="locate" title="${t('map_locate')}">📍</button>
    <button class="fab" data-act="search" title="${t('map_search')}">🔍</button>
    <button class="fab add" data-act="add" title="${t('add_court')}">＋</button>
    <div class="map-status" id="map-status"></div>`;
  bind(ctr, {
    layer: () => {
      const order = ['sat', 'esri', 'gsat', 'mapbox', 'maptiler', 'map'].filter((k) => layers[k]);
      const nxt = order[(order.indexOf(curLayer) + 1) % order.length];
      setLayer(nxt);
      toast(t('layer_' + nxt));
    },
    zones: () => { showZones = !showZones; drawZones(); toast(showZones ? t('zones_on') : t('zones_off')); },
    locate: async () => {
      const p = await currentPos();
      if (p) map.setView([p.lat, p.lng], Math.max(map.getZoom(), 15));
      else toast(t('gps_unavailable'), 'err');
    },
    search: () => importVisible(true),
    add: openAddCourt,
  });

  bind(document.getElementById('map-top'), {
    sport: (d) => { setSport(d.s); rerender(); },
    og: () => { ogOnly = !ogOnly; refreshMap(); },
  });
  bind(document.getElementById('court-sheet'), sheetHandlers);
  setTimeout(() => scheduleImport(), 1500);
}

function setLayer(name) {
  if (!layers[name]) name = 'sat';
  if (curLayer && layers[curLayer]) map.removeLayer(layers[curLayer]);
  layers[name].addTo(map);
  curLayer = name;
  try { localStorage.setItem(PREF, name); } catch { /* ignore */ }
}

function updateMe(p) {
  if (!map) return;
  const ll = [p.lat, p.lng];
  if (!meMarker) {
    meMarker = L.marker(ll, { icon: L.divIcon({ className: '', html: '<div class="me-dot"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }), interactive: false, zIndexOffset: 1000 }).addTo(map);
    meCircle = L.circle(ll, { radius: p.acc || 30, color: '#4da3ff', weight: 1, fillOpacity: 0.08, interactive: false }).addTo(map);
  } else {
    meMarker.setLatLng(ll);
    meCircle.setLatLng(ll).setRadius(p.acc || 30);
  }
  if (!followedFirstFix && !userMoved) {
    followedFirstFix = true;
    map.setView(ll, 15);
  }
  if (openCourtId) renderSheet();
}

export const getMapBounds = () => (map ? map.getBounds() : null);

export function showMap() {
  if (map) setTimeout(() => map.invalidateSize(), 50);
}

function renderTop() {
  const el = document.getElementById('map-top');
  const leaders = SPORTS.filter((s) => sportOk(s)).map((s) => {
    const top = standings(s)[0];
    return top && top.courts ? `<a class="leader" href="#/table" style="--c:${esc(top.team.color)}">${SPORT_ICON[s]} ${t('leader')}: ${teamTag(top.team)} · <b>${top.courts}</b> 👑 · <b>${top.zones}</b> 🚩</a>` : '';
  }).join('');
  el.innerHTML = `<div class="seg sport-seg">${['all', ...SPORTS].map((s) => `<button data-act="sport" data-s="${s}" class="${ui.sport === s ? 'on' : ''}">${s === 'all' ? t('all') : SPORT_ICON[s]}</button>`).join('')}<button data-act="og" class="ogf ${ogOnly ? 'on' : ''}">★ OG</button></div>
    <div class="leaders">${leaders}</div>`;
}

function drawZones() {
  zoneLayer.clearLayers();
  if (!showZones) return;
  for (const z of zones()) {
    const tm = z.owner ? teamById(z.owner) : null;
    const color = tm ? tm.color : '#9aa3b2';
    const r = L.rectangle(z.bounds, {
      color, weight: tm ? 2 : 1, opacity: 0.8, fillColor: color, fillOpacity: tm ? 0.18 : 0.06,
      dashArray: tm ? null : '6 6', interactive: true,
    });
    const lines = Object.entries(z.counts).sort((a, b) => b[1] - a[1])
      .map(([tid, n]) => `${teamTag(teamById(tid))} ${n}`).join(' · ');
    r.bindTooltip(`${SPORT_ICON[z.sport]} ${tm ? `${t('zone_owner')}: <b>${esc(tm.name)}</b>` : t('zone_contested')}<br>${lines}`, { sticky: true });
    zoneLayer.addLayer(r);
    // etykieta właściciela w rogu strefy
    zoneLayer.addLayer(L.marker([z.bounds[1][0], z.bounds[0][1]], {
      interactive: false, keyboard: false,
      icon: L.divIcon({ className: '', iconAnchor: [-4, -4], html: `<span class="zone-tag" style="--c:${esc(color)}">${SPORT_ICON[z.sport]} ${tm ? esc(tm.tag) : '⚔️'}</span>` }),
    }));
  }
}

export function refreshMap() {
  if (!map || !store.data) return;
  renderTop();
  drawZones();
  markers.clearLayers();
  for (const c of store.data.courts) {
    if (!sportOk(c.sport)) continue;
    const og = isOgSpot(c.id);
    if (ogOnly && !og) continue;
    const k = c.king_team_id ? teamById(c.king_team_id) : null;
    const busy = !!openChallengeForCourt(c.id);
    const html = `<div class="pin ${k ? 'owned' : 'free'}" style="--c:${k ? esc(k.color) : '#9aa3b2'}">
        <span class="pin-ball">${SPORT_ICON[c.sport] || '🏀'}</span>${k ? `<span class="pin-crown">👑</span><span class="pin-tag">${esc(k.tag)}</span>` : ''}${busy ? '<span class="pin-fight">⚔️</span>' : ''}${og ? '<span class="pin-og">★</span>' : ''}${upcomingGames(c.id).length ? '<span class="pin-game">🤝</span>' : ''}
      </div>`;
    const m = L.marker([c.lat, c.lng], { icon: L.divIcon({ className: '', html, iconSize: [44, 52], iconAnchor: [22, 48] }) });
    m.on('click', () => openCourt(c.id));
    markers.addLayer(m);
  }
  if (openCourtId) {
    if (courtById(openCourtId)) renderSheet(); else closeSheet();
  }
}

export function focusCourt(id) {
  const c = courtById(id);
  if (!c || !map) return;
  userMoved = true;
  if (!sportOk(c.sport)) { setSport('all'); refreshMap(); }
  map.setView([c.lat, c.lng], 17);
  openCourt(id);
}

function openCourt(id) {
  openCourtId = id;
  renderSheet();
}

function closeSheet() {
  openCourtId = null;
  const el = document.getElementById('court-sheet');
  el.hidden = true;
  el.innerHTML = '';
}

const distTo = (c) => (geo.pos ? distM(geo.pos.lat, geo.pos.lng, c.lat, c.lng) : null);

function histLabel(h) {
  const tm = h.team_id ? teamById(h.team_id) : null;
  const ch = h.challenge_id ? store.data.challenges.find((x) => x.id === h.challenge_id) : null;
  const score = ch && ch.score_challenger != null ? ` <b>${ch.score_challenger}:${ch.score_defender}</b>` : ch && ch.status === 'walkover' ? ` (${t('st_walkover').toLowerCase()})` : '';
  return `<li><span class="muted">${fmtDate(h.at)}</span> ${tm ? teamTag(tm) : ''} ${t('hist_' + h.event)}${score}</li>`;
}

// "Kto zdobył to boisko" – ostatnie przejęcie
function captureInfo(c) {
  const h = lastCapture(c.id);
  if (!h) return '';
  const ch = h.challenge_id ? store.data.challenges.find((x) => x.id === h.challenge_id) : null;
  let how = t('how_claim');
  if (ch) {
    const loser = teamById(ch.defender_team_id);
    how = ch.status === 'walkover'
      ? `${t('how_walkover')} ${teamTag(loser)}`
      : `${t('how_match')} ${teamTag(loser)} <b>${ch.score_challenger}:${ch.score_defender}</b>`;
    const ref = ch.resolved_by ? store.data.profiles.find((p) => p.id === ch.resolved_by) : null;
    if (ref) how += ` · ${t('referee')}: ${esc(ref.nick)}`;
  }
  return `<div class="small capture">🏆 ${t('captured')} ${fmtDay(h.at)} – ${how}</div>`;
}

function renderSheet() {
  const el = document.getElementById('court-sheet');
  const c = courtById(openCourtId);
  if (!c) return closeSheet();
  const king = c.king_team_id ? teamById(c.king_team_id) : null;
  const mine = myTeam();
  const d = distTo(c);
  const near = d != null && d <= RULES.CHECKIN_RADIUS_M;
  const fake = api.mode === 'demo' && api.demo.fakeGps();
  const protLeft = c.protected_until ? T(c.protected_until) - now() : 0;
  const open = openChallengeForCourt(c.id);
  const hist = courtHistory(c.id).slice(0, 6);

  let kingHtml;
  if (king) {
    kingHtml = `<div class="king" style="--c:${esc(king.color)}">
      <div class="king-crown">👑</div>
      <div><div class="muted small">${t('king_of_court')}</div>
        <a href="#/team/${esc(king.id)}" class="king-name">${esc(king.name)} ${teamTag(king)}</a>
        <div class="small muted">${t('since')} ${fmtDate(c.king_since)} · ${t('defenses')}: <b>${c.defenses}</b></div></div></div>
      ${captureInfo(c)}
      ${protLeft > 0 ? `<div class="pill shield">🛡️ ${t('protected_for')} ${fmtLeft(protLeft)}</div>` : ''}`;
  } else {
    kingHtml = `<div class="king free"><div class="king-crown">🏳️</div><div><b>${t('court_free')}</b><div class="small muted">${t('court_free_hint')}</div></div></div>`;
  }

  let actions = '';
  if (!store.me) {
    actions = `<a class="btn primary block" href="#/login">${t('login_to_play')}</a>`;
  } else if (!mine) {
    actions = `<a class="btn block" href="#/teams">${t('need_team')}</a>`;
  } else if (mine.sport !== c.sport) {
    actions = `<div class="small muted center">${t('other_sport_court', { s: t('sport_' + c.sport) })}</div>`;
  } else if (!king) {
    actions = `<button class="btn primary block" data-act="claim" ${near || fake ? '' : 'disabled'}>👑 ${t('claim_court')}</button>
      ${near || fake ? '' : `<div class="small muted center">${t('be_closer', { m: RULES.CHECKIN_RADIUS_M })}</div>`}`;
  } else if (king.id === mine.id) {
    actions = `<div class="pill ok block">🏰 ${t('your_court')}</div>`;
  } else if (open) {
    actions = '';
  } else if (!isCaptainOf(mine.id)) {
    actions = `<div class="small muted center">${t('only_captain_challenges')}</div>`;
  } else {
    actions = `<button class="btn primary block" data-act="challenge" ${protLeft > 0 ? 'disabled' : ''}>⚔️ ${t('challenge_king')}</button>`;
  }
  if (open) {
    const ct = teamById(open.challenger_team_id);
    actions += `<a class="btn ghost block" href="#/matches">⚔️ ${t('challenged_by')} ${teamTag(ct)} · ${fmtDate(open.scheduled_at)}</a>`;
  }

  const rv = reviewOf(c.id);
  const games = upcomingGames(c.id);
  const issues = openIssues(c.id);
  el.innerHTML = `
    <div class="sheet-handle" data-act="close"></div>
    <button class="sheet-x" data-act="close">×</button>
    <h2>${SPORT_ICON[c.sport]} ${esc(courtName(c))}</h2>
    <div class="small muted">${t('sport_' + c.sport)} · ${esc(c.address || '')}${d != null ? ` · ${fmtDist(d)} ${t('from_you')}` : ''}</div>
    <div class="sheet-tags">${ogBadge(rv)}${rv ? `<span class="pill">${rv.total}/100</span>` : `<span class="pill">${t('not_reviewed')}</span>`}${issues.length ? `<span class="pill err">🔧 ${t('issues_n', { n: issues.length })}</span>` : ''}</div>
    <div class="row quick">
      <button class="btn primary" data-act="game-new">🤝 ${t('g_create')}</button>
      <a class="btn" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=${c.lat},${c.lng}">🧭 ${t('navigate')}</a>
      <button class="btn ghost" data-act="issue">🔧 ${t('report_issue')}</button>
    </div>
    ${games.length ? `<h4>🤝 ${t('g_here')}</h4><div class="matches">${games.map((g) => gameCard(g, false)).join('')}</div>` : ''}
    ${isStaff() ? `<button class="btn staff block" data-act="og-edit">★ ${rv ? t('rv_edit') : t('rv_add')}</button>` : ''}
    ${reviewBlock(c)}
    <h4>👥 ${t('player_opinions')}</h4>
    ${ratingBlock(c)}
    ${issues.length ? `<h4>🔧 ${t('issues_title')}</h4><ul class="hist">${issues.map((i) => `<li>${esc(i.text)} <span class="muted small">· ${fmtDay(i.created_at)}</span>${isStaff() ? ` <button class="btn small ghost" data-act="issue-ok" data-id="${esc(i.id)}">✔ ${t('issue_resolve')}</button>` : ''}</li>`).join('')}</ul>` : ''}
    <h4>👑 ${t('king_section')}</h4>
    ${kingHtml}
    <div class="sheet-actions">${actions}</div>
    ${isAdmin() ? `<div class="row"><button class="btn ghost small" data-act="reset">♻️ ${t('admin_reset_court')}</button>
        <button class="btn ghost small danger" data-act="del">🗑️ ${t('admin_delete_court')}</button></div>` : ''}
    ${hist.length ? `<h4>${t('history')}</h4><ul class="hist">${hist.map(histLabel).join('')}</ul>` : ''}`;
  el.hidden = false;
}

export const stars = (v) => {
  if (v == null) return '<span class="stars muted">☆☆☆☆☆</span>';
  const full = Math.round(v);
  return `<span class="stars">${'★'.repeat(full)}<span class="off">${'★'.repeat(5 - full)}</span></span>`;
};

function ratingBlock(c) {
  const r = courtRating(c.id);
  const mine = myCourtRating(c.id);
  const comments = r.rows.filter((x) => x.comment).slice(0, 3);
  return `<div class="rating-box">
    <div class="rating-head">
      <div><span class="rating-big">${r.avg != null ? r.avg.toFixed(1) : '–'}</span> ${stars(r.avg)}
        <div class="small muted">${r.n ? t('ratings_count', { n: r.n }) : t('no_ratings')}</div></div>
      ${store.me ? `<button class="btn small ${mine ? 'ghost' : 'primary'}" data-act="rate">⭐ ${mine ? t('change_rating') : t('rate_court')}</button>` : ''}
    </div>
    ${r.n ? `<div class="crit">${COURT_CRITERIA.map((k) => `<div class="crit-row"><span>${t('cr_' + k)}</span>${stars(r.by[k])}<b>${r.by[k] != null ? r.by[k].toFixed(1) : '–'}</b></div>`).join('')}</div>` : ''}
    ${comments.map((x) => `<div class="rcomment">„${esc(x.comment)}” <span class="muted small">– ${esc(profileById(x.player_id)?.nick || '?')}</span></div>`).join('')}
  </div>`;
}

function openAddCourt() {
  if (!store.me) { location.hash = '#/login/register'; return; }
  const ctr = map.getCenter();
  modal(`<h3>＋ ${t('add_court')}</h3>
    <p class="small muted">${t('add_court_hint')}</p>
    <label>${t('court_name')}<input id="an" maxlength="80" placeholder="${t('court_name_ph')}"></label>
    <div class="label">${t('sport')}</div>
    <div class="seg wide" id="asp">${SPORTS.map((sp, i) => `<button data-s="${sp}" class="${i === 0 ? 'on' : ''}">${SPORT_ICON[sp]} ${t('sport_' + sp)}</button>`).join('')}</div>
    <label>${t('court_address')}<input id="aa" maxlength="120"></label>
    <div class="small muted">📍 ${ctr.lat.toFixed(5)}, ${ctr.lng.toFixed(5)} – ${t('add_court_pos')}</div>
    <div class="row end"><button class="btn ghost" data-close>${t('cancel')}</button><button class="btn primary" id="ok">${t('add_court_send')}</button></div>`,
  (m, close) => {
    let sport = SPORTS[0];
    m.querySelectorAll('#asp button').forEach((b) => (b.onclick = () => { sport = b.dataset.s; m.querySelectorAll('#asp button').forEach((x) => x.classList.toggle('on', x === b)); }));
    m.querySelector('#ok').onclick = async () => {
      const ok = await act('suggest_court', { p_name: m.querySelector('#an').value, p_sport: sport, p_lat: ctr.lat, p_lng: ctr.lng, p_address: m.querySelector('#aa').value },
        isStaff() ? 'ok_court_added' : 'ok_court_suggested');
      if (ok) close();
    };
  });
}

const sheetHandlers = {
  ...gameHandlers,
  close: closeSheet,
  'game-new': () => openCreateGame(openCourtId),
  'og-edit': () => openReviewEditor(openCourtId),
  'issue-ok': (d) => act('resolve_issue', { p_id: Number(d.id) || d.id }, 'ok_saved'),
  issue() {
    if (!store.me) { location.hash = '#/login/register'; return; }
    const cid = openCourtId;
    modal(`<h3>🔧 ${t('report_issue')}</h3><p class="small muted">${t('issue_hint')}</p>
      <label>${t('issue_text')}<input id="it" maxlength="300" placeholder="${t('issue_ph')}"></label>
      <div class="row end"><button class="btn ghost" data-close>${t('cancel')}</button><button class="btn primary" id="ok">${t('send')}</button></div>`,
    (m, close) => { m.querySelector('#ok').onclick = async () => { if (await act('report_issue', { p_court: cid, p_text: m.querySelector('#it').value }, 'ok_issue')) close(); }; });
  },
  rate() {
    const c = courtById(openCourtId);
    const mine = myCourtRating(c.id);
    const vals = { ...(mine?.scores || {}) };
    modal(`<h3>⭐ ${t('rate_court')}</h3>
      <p class="muted">${SPORT_ICON[c.sport]} ${esc(courtName(c))}</p>
      <p class="small muted">${t('rate_hint')}</p>
      ${COURT_CRITERIA.map((k) => `<div class="rate-row"><div><b>${t('cr_' + k)}</b><div class="small muted">${t('crh_' + k)}</div></div>
        <div class="star-pick" data-k="${k}">${[1, 2, 3, 4, 5].map((n) => `<button data-n="${n}" class="${(vals[k] || 0) >= n ? 'on' : ''}">★</button>`).join('')}</div></div>`).join('')}
      <label>${t('rate_comment')}<input id="rc" maxlength="280" value="${esc(mine?.comment || '')}" placeholder="${t('rate_comment_ph')}"></label>
      <div class="row end"><button class="btn ghost" data-close>${t('cancel')}</button><button class="btn primary" id="ok">${t('save')}</button></div>`,
    (m, close) => {
      m.querySelectorAll('.star-pick').forEach((box) => box.querySelectorAll('button').forEach((b) => (b.onclick = () => {
        vals[box.dataset.k] = Number(b.dataset.n);
        box.querySelectorAll('button').forEach((x) => x.classList.toggle('on', Number(x.dataset.n) <= vals[box.dataset.k]));
      })));
      m.querySelector('#ok').onclick = async () => {
        if (COURT_CRITERIA.some((k) => !vals[k])) return toast(t('rate_all'), 'err');
        const scores = Object.fromEntries(COURT_CRITERIA.map((k) => [k, vals[k]]));
        if (await act('rate_court', { p_court: c.id, p_scores: scores, p_comment: m.querySelector('#rc').value }, 'ok_rated')) close();
      };
    });
  },
  async claim() {
    const p = await currentPos();
    await act('claim_court', { p_court: openCourtId, p_lat: p?.lat ?? null, p_lng: p?.lng ?? null }, 'ok_claimed');
  },
  challenge() {
    const c = courtById(openCourtId);
    const def = now() + 24 * 3600e3;
    modal(`<h3>⚔️ ${t('challenge_king')}</h3>
      <p class="muted">${esc(courtName(c))} · ${teamTag(teamById(c.king_team_id))}</p>
      <label>${t('match_time')}<input type="datetime-local" id="ch-time" value="${localInputValue(def)}"></label>
      <p class="small muted">${t('challenge_rules', { h: RULES.ACCEPT_HOURS })}</p>
      <div class="row end"><button class="btn ghost" data-close>${t('cancel')}</button>
      <button class="btn primary" id="ch-ok">${t('send_challenge')}</button></div>`, (m, close) => {
      m.querySelector('#ch-ok').onclick = async () => {
        const v = m.querySelector('#ch-time').value;
        const iso = new Date(v).toISOString();
        if (await act('create_challenge', { p_court: openCourtId, p_time: iso }, 'ok_challenge_sent')) close();
      };
    });
  },
  async reset() {
    if (await confirmBox(t('admin_reset_court') + '?')) act('admin_reset_court', { p_court: openCourtId }, 'ok_saved');
  },
  async del() {
    if (await confirmBox(t('admin_delete_court') + '?')) {
      const id = openCourtId; closeSheet();
      act('admin_delete_court', { p_court: id }, 'ok_saved');
    }
  },
};

// ---------- automatyczne wyszukiwanie boisk ----------
let importTimer, importing = false;
const searched = [];

function scheduleImport() {
  clearTimeout(importTimer);
  if (!CONFIG.AUTO_IMPORT) return;
  importTimer = setTimeout(() => importVisible(false), 900);
}

async function importVisible(force) {
  if (!map || importing) return;
  const status = document.getElementById('map-status');
  if (!api.canImport()) { if (force) toast(t('login_to_import'), 'err'); return; }
  if (map.getZoom() < CONFIG.AUTO_IMPORT_MIN_ZOOM) { if (force) toast(t('zoom_in_to_search')); return; }
  const view = map.getBounds();
  if (!force && searched.some((b) => b.contains(view))) return;
  const big = view.pad(0.4);
  importing = true;
  status.textContent = t('searching_courts');
  status.classList.add('on');
  try {
    const found = await fetchArea({ s: big.getSouth(), w: big.getWest(), n: big.getNorth(), e: big.getEast() });
    searched.push(big);
    let added = 0;
    for (let i = 0; i < found.length; i += 250) added += (await api.rpc('import_courts', { p_courts: found.slice(i, i + 250) })) || 0;
    if (added) { await reload(); toast(t('courts_found', { n: added }), 'ok'); }
    else if (force) toast(t('no_new_courts'));
  } catch (e) {
    if (force) toast(errText(e), 'err');
  } finally {
    importing = false;
    status.classList.remove('on');
  }
}
