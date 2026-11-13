// OG SPOT – oficjalne karty boisk (treści admina): podgląd, lista, edytor
import { t } from '../i18n.js';
import { REVIEW_AREAS, OG_MIN_TOTAL, OG_MIN, SUGGESTION_KINDS, SPORT_ICON } from '../rules.js';
import { esc, bind, modal, toast, fmtDay } from '../ui.js';
import { store, act, courtById, courtName, reviewOf, reviewValid, isStaff, profileById, courtRating, sportOk } from '../state.js';

export const ogBadge = (r, big = false) => (r && r.og_spot && reviewValid(r)
  ? `<span class="og-badge ${big ? 'big' : ''}">★ OG SPOT${r.og_number ? ` <i>#${String(r.og_number).padStart(3, '0')}</i>` : ''}</span>` : '');

const areaLabel = (k, sport) => t(k === 'hoop' && sport === 'football' ? 'ra_hoop_f' : 'ra_' + k);

// link YouTube → okno z filmem
function videoEmbed(url) {
  const m = (url || '').match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/|embed\/))([\w-]{6,})/);
  if (m) return `<div class="video"><iframe src="https://www.youtube-nocookie.com/embed/${m[1]}" title="video" allowfullscreen loading="lazy"></iframe></div>`;
  return url ? `<a class="btn ghost small" href="${esc(url)}" target="_blank" rel="noopener">🎬 ${t('watch_video')}</a>` : '';
}

// Pełna karta boiska (do karty na mapie i strony OG SPOT)
export function reviewBlock(c) {
  const r = reviewOf(c.id);
  if (!r) return '';
  const valid = reviewValid(r);
  const ref = profileById(r.reviewer_id);
  const list = (arr, cls, ic) => (arr || []).length ? `<ul class="rv-list ${cls}">${arr.map((x) => `<li>${ic} ${esc(x)}</li>`).join('')}</ul>` : '';
  return `<div class="review-card ${r.og_spot && valid ? 'og' : ''}">
    <div class="rv-head">
      <div class="rv-score ${r.total >= OG_MIN_TOTAL ? 'good' : ''}"><b>${r.total}</b><span>/100</span></div>
      <div>
        <div class="rv-title">${t('official_review')}</div>
        ${ogBadge(r, true) || `<span class="pill">${r.hazard ? '⚠️ ' + t('rv_hazard') : t('rv_no_mark')}</span>`}
        <div class="small muted">${t('rv_visited')} ${fmtDay(r.visited_at)}${ref ? ` · ${esc(ref.nick)}` : ''} · ${valid ? `${t('rv_valid_until')} ${fmtDay(r.valid_until)}` : `<span class="warn">${t('rv_expired')}</span>`}</div>
      </div>
    </div>
    ${(r.photos || []).length ? `<div class="rv-photos">${r.photos.map((u) => `<a href="${esc(u)}" target="_blank" rel="noopener"><img src="${esc(u)}" alt="" loading="lazy"></a>`).join('')}</div>` : ''}
    ${r.summary ? `<p class="rv-summary">${esc(r.summary)}</p>` : ''}
    <div class="rv-areas">${REVIEW_AREAS.map((a) => {
      const v = Number(r.scores?.[a.key]) || 0;
      const low = OG_MIN[a.key] != null && v < OG_MIN[a.key];
      return `<div class="rv-area"><span>${areaLabel(a.key, c.sport)}</span>
        <div class="sbar-track"><div class="sbar-fill ${low ? 'bad' : ''}" style="width:${(v / a.max) * 100}%"></div></div>
        <b class="${low ? 'bad' : ''}">${v}<i>/${a.max}</i></b></div>`;
    }).join('')}</div>
    ${list(r.pros, 'pros', '✅')}${list(r.cons, 'cons', '⚠️')}
    ${(r.suggestions || []).length ? `<div class="rv-sugg"><b>${t('rv_suggestions')}</b>${r.suggestions.map((s) => `<div class="sugg k-${esc(s.kind)}"><span>${t('sk_kind_' + s.kind)}</span>${esc(s.text)}</div>`).join('')}</div>` : ''}
    ${videoEmbed(r.video_url)}
  </div>`;
}

// ---------- lista kart: #/spots ----------
let onlyOg = false;
export function renderSpots(root) {
  const rows = store.data.court_reviews
    .map((r) => ({ r, c: courtById(r.court_id) })).filter((x) => x.c && sportOk(x.c.sport))
    .filter((x) => !onlyOg || (x.r.og_spot && reviewValid(x.r)))
    .sort((a, b) => b.r.total - a.r.total);
  root.innerHTML = `
    <div class="page-head"><h1>★ ${t('spots_title')}</h1></div>
    <p class="muted">${t('spots_intro')}</p>
    <details class="rules"><summary>📋 ${t('spots_method')}</summary>
      <div class="rv-areas">${REVIEW_AREAS.map((a) => `<div class="rv-area"><span>${t('ra_' + a.key)}<small>${t('rad_' + a.key)}</small></span><b>${a.max}<i> ${t('pts')}</i></b></div>`).join('')}</div>
      <p class="small muted">${t('spots_rule', { n: OG_MIN_TOTAL })}</p></details>
    <div class="seg"><button data-act="f" data-v="0" class="${onlyOg ? '' : 'on'}">${t('all')}</button><button data-act="f" data-v="1" class="${onlyOg ? 'on' : ''}">★ OG SPOT</button></div>
    <div class="spot-list">${rows.map(({ r, c }) => {
      const cr = courtRating(c.id);
      return `<a class="spot" href="#/map/${esc(c.id)}">
        ${(r.photos || [])[0] || c.photo_url ? `<img src="${esc((r.photos || [])[0] || c.photo_url)}" alt="" loading="lazy">` : `<div class="spot-ph">${SPORT_ICON[c.sport]}</div>`}
        <div class="spot-body"><b>${esc(courtName(c))}</b>
          <div class="small muted">${esc(c.address || '')}</div>
          <div>${ogBadge(r) || `<span class="small muted">${t('rv_no_mark')}</span>`}${cr.n ? ` <span class="small">⭐ ${cr.avg.toFixed(1)} (${cr.n})</span>` : ''}</div></div>
        <div class="rv-score small ${r.total >= OG_MIN_TOTAL ? 'good' : ''}"><b>${r.total}</b><span>/100</span></div></a>`;
    }).join('') || `<p class="muted">${t('spots_empty')}</p>`}</div>
    <p class="small muted center"><a href="#/map">${t('spots_suggest')}</a></p>`;
  bind(root, { f: (d) => { onlyOg = d.v === '1'; renderSpots(root); } });
}

// ---------- edytor karty (admin / moderator) ----------
export function openReviewEditor(courtId) {
  if (!isStaff()) return;
  const c = courtById(courtId);
  const r = reviewOf(courtId) || {};
  const sc = { ...(r.scores || {}) };
  const lines = (a) => (a || []).join('\n');
  const sugg = [0, 1, 2].map((i) => (r.suggestions || [])[i] || { text: '', kind: SUGGESTION_KINDS[i] });
  modal(`<h3>★ ${t('rv_editor')}</h3>
    <p class="muted">${SPORT_ICON[c.sport]} ${esc(courtName(c))}</p>
    <div class="rv-total">${t('rv_total')}: <b id="tot">0</b>/100 <span id="verdict"></span></div>
    ${REVIEW_AREAS.map((a) => `<label class="rv-in"><span><b>${areaLabel(a.key, c.sport)}</b><small>${t('rad_' + a.key)}</small></span>
      <input type="number" min="0" max="${a.max}" data-k="${a.key}" value="${sc[a.key] ?? ''}" inputmode="numeric"><i>/ ${a.max}</i></label>`).join('')}
    <label class="check"><input type="checkbox" id="hz" ${r.hazard ? 'checked' : ''}> ⚠️ ${t('rv_hazard_q')}</label>
    <label>${t('rv_visited')}<input type="date" id="vis" value="${esc(r.visited_at || new Date().toISOString().slice(0, 10))}"></label>
    <label>${t('rv_summary')}<textarea id="sum" rows="4" maxlength="1500" placeholder="${t('rv_summary_ph')}">${esc(r.summary || '')}</textarea></label>
    <label>✅ ${t('rv_pros')}<textarea id="pros" rows="3" placeholder="${t('rv_lines_ph')}">${esc(lines(r.pros))}</textarea></label>
    <label>⚠️ ${t('rv_cons')}<textarea id="cons" rows="3" placeholder="${t('rv_lines_ph')}">${esc(lines(r.cons))}</textarea></label>
    <div class="label">${t('rv_suggestions')}</div>
    ${sugg.map((s, i) => `<div class="sugg-in"><select data-si="${i}">${SUGGESTION_KINDS.map((k) => `<option value="${k}" ${s.kind === k ? 'selected' : ''}>${t('sk_kind_' + k)}</option>`).join('')}</select>
      <input data-st="${i}" maxlength="160" value="${esc(s.text)}" placeholder="${t('rv_sugg_ph')}"></div>`).join('')}
    <label>📷 ${t('rv_photos')}<textarea id="ph" rows="3" placeholder="https://...jpg">${esc(lines(r.photos))}</textarea></label>
    <p class="small muted">${t('rv_photos_hint')}</p>
    <label>🎬 ${t('rv_video')}<input id="vid" type="url" placeholder="https://youtube.com/watch?v=..." value="${esc(r.video_url || '')}"></label>
    <div class="row end">${r.court_id && store.me.is_admin ? `<button class="btn ghost danger" id="del">${t('rv_delete')}</button>` : ''}
      <button class="btn ghost" data-close>${t('cancel')}</button><button class="btn primary" id="ok">${t('rv_publish')}</button></div>`,
  (m, close) => {
    const val = (k) => parseInt(m.querySelector(`input[data-k=${k}]`).value, 10);
    const recalc = () => {
      let tot = 0, ok = true;
      for (const a of REVIEW_AREAS) { const v = val(a.key); if (isNaN(v)) ok = false; else tot += v; }
      const hz = m.querySelector('#hz').checked;
      const og = ok && tot >= OG_MIN_TOTAL && !hz && Object.entries(OG_MIN).every(([k, mn]) => val(k) >= mn);
      m.querySelector('#tot').textContent = tot;
      m.querySelector('#verdict').innerHTML = og ? '<span class="og-badge">★ OG SPOT</span>' : `<span class="pill">${t('rv_no_mark')}</span>`;
    };
    m.querySelectorAll('input[data-k], #hz').forEach((el) => (el.oninput = recalc));
    recalc();
    const arr = (id) => m.querySelector(id).value.split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 8);
    m.querySelector('#ok').onclick = async () => {
      const scores = {};
      for (const a of REVIEW_AREAS) {
        const v = val(a.key);
        if (isNaN(v) || v < 0 || v > a.max) return toast(`${areaLabel(a.key, c.sport)}: 0–${a.max}`, 'err');
        scores[a.key] = v;
      }
      const photos = arr('#ph').filter((u) => /^https:\/\//.test(u));
      const suggestions = [0, 1, 2].map((i) => ({ text: m.querySelector(`[data-st="${i}"]`).value.trim(), kind: m.querySelector(`[data-si="${i}"]`).value })).filter((s) => s.text);
      const data = { scores, hazard: m.querySelector('#hz').checked, visited_at: m.querySelector('#vis').value, summary: m.querySelector('#sum').value,
        pros: arr('#pros'), cons: arr('#cons'), suggestions, photos, video_url: m.querySelector('#vid').value, photo_url: photos[0] || '' };
      if (await act('save_court_review', { p_court: courtId, p_data: data }, 'ok_review_saved')) close();
    };
    const del = m.querySelector('#del');
    if (del) del.onclick = async () => { if (await act('delete_court_review', { p_court: courtId }, 'ok_saved')) close(); };
  });
}

