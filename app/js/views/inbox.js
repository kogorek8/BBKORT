// POWIADOMIENIA
import { t } from '../i18n.js';
import { esc, fmtDate } from '../ui.js';
import { store, act } from '../state.js';

const ICON = { presence: '📍', support_needed: '✋', review_needed: '🧑‍⚖️', challenged: '⚔️', challenge_approved: '✅', claim_approved: '👑', action_rejected: '✖️',
  result: '🏁', stats_approved: '📊', stats_rejected: '📊', skills_updated: '🃏', badge: '🏅', team_invite: '📩', team_request: '📥', game_joined: '🤝',
  drop_new: '🎁', drop_claimed: '🎁', purchase: '🛒', purchase_done: '📦', purchase_cancelled: '↩️', referral: '📣' };

export function notifText(n) {
  const d = { ...(n.data || {}) };
  if (n.kind === 'result') return t(d.won ? 'n_result_won' : 'n_result_lost', d);
  if (d.kind) d.what = t('n_kind_' + d.kind);
  if (n.kind === 'badge') d.badge = t('sb_' + d.code);
  return t('n_' + n.kind, d);
}

export function renderInbox(root) {
  if (!store.me) { location.hash = '#/login'; return; }
  const list = store.data.notifications;
  root.innerHTML = `<div class="page-head"><h1>🔔 ${t('inbox_title')}</h1></div>
    <div class="inbox">${list.map((n) => `<a class="notif ${n.read ? '' : 'new'}" href="#/${esc(n.link || 'home')}">
      <span class="notif-ic">${ICON[n.kind] || '🔔'}</span><div><div>${esc(notifText(n))}</div><div class="small muted">${fmtDate(n.created_at)}</div></div></a>`).join('')
      || `<p class="muted">${t('inbox_empty')}</p>`}</div>`;
  if (list.some((n) => !n.read)) setTimeout(() => act('mark_notifications_read', {}), 1500);
}
