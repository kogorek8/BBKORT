import { t, getLang } from './i18n.js';
import { H, M } from './rules.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let toastTimer;
export function toast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'show ' + type;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.className = ''), 3500);
}

export function modal(html, onMount) {
  const root = document.getElementById('modal-root');
  const back = document.createElement('div');
  back.className = 'modal-back';
  back.innerHTML = `<div class="modal" role="dialog"><button class="modal-x" data-close aria-label="×">×</button>${html}</div>`;
  root.appendChild(back);
  const close = () => back.remove();
  back.addEventListener('click', (e) => { if (e.target === back || e.target.closest('[data-close]')) close(); });
  onMount && onMount(back.querySelector('.modal'), close);
  return close;
}

export function confirmBox(text) {
  return new Promise((resolve) => {
    modal(`<p class="confirm-text">${esc(text)}</p>
      <div class="row end"><button class="btn ghost" data-close>${t('cancel')}</button>
      <button class="btn primary" id="cf-ok">${t('confirm')}</button></div>`, (el, close) => {
      el.querySelector('#cf-ok').onclick = () => { close(); resolve(true); };
      el.parentElement.addEventListener('click', (e) => { if (e.target.closest('[data-close]') || e.target === el.parentElement) resolve(false); });
    });
  });
}

const locale = () => (getLang() === 'pl' ? 'pl-PL' : 'en-GB');
export const fmtDate = (iso) => iso ? new Date(iso).toLocaleString(locale(), { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
export const fmtDay = (iso) => iso ? new Date(iso).toLocaleDateString(locale(), { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';

export function fmtLeft(ms) {
  if (ms <= 0) return '0 min';
  const d = Math.floor(ms / (24 * H)), h = Math.floor((ms % (24 * H)) / H), m = Math.floor((ms % H) / M);
  if (d) return `${d} d ${h} h`;
  if (h) return `${h} h ${m} min`;
  return `${Math.max(1, m)} min`;
}

export function fmtDist(m) {
  if (m == null) return '';
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;
}

export const teamTag = (team) => team
  ? `<span class="ttag" style="--c:${esc(team.color)}">${esc(team.tag)}</span>`
  : `<span class="ttag none">—</span>`;

// Delegacja kliknięć: <button data-act="nazwa" data-id="...">
export function bind(root, handlers) {
  root.onclick = (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || !root.contains(el)) return;
    const fn = handlers[el.dataset.act];
    if (!fn) return;
    e.preventDefault();
    fn(el.dataset, el);
  };
}

// lokalny datetime-local → ISO
export function localInputValue(ms) {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
