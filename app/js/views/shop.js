// PORTFEL I SKLEP: OG Coins, misje dnia, ramki, ułatwienia, nagrody od sponsorów
import { t } from '../i18n.js';
import { COIN_TABLE, DAILY_MISSIONS, levelOf, FRAMES } from '../rules.js';
import { esc, bind, modal, fmtDate, confirmBox } from '../ui.js';
import { store, act, todayKey, hasLedgerKey, streakDays, profileById } from '../state.js';

export const coins = (n) => `<span class="coin">🪙 ${n}</span>`;

export function missionsBlock() {
  const day = todayKey();
  const streak = streakDays();
  return `<div class="missions">
    <div class="missions-head"><b>🎯 ${t('missions_today')}</b><span class="streak">🔥 ${t('streak', { n: streak })}</span></div>
    ${DAILY_MISSIONS.map((m) => { const done = hasLedgerKey(m.key + day); return `<a class="mission ${done ? 'done' : ''}" href="${m.href}">
      <span class="mcheck">${done ? '✓' : ''}</span><span>${t('ms_' + m.reason)}</span>${coins('+' + m.coins)}</a>`; }).join('')}
    <div class="small muted">${t('streak_hint')}</div>
  </div>`;
}

export function levelBar(p) {
  const l = levelOf(p.xp);
  return `<div class="lvl"><div class="lvl-top"><b>LVL ${l.lvl}</b> <span>${t(l.title)}</span><i>${t('lvl_next', { n: l.toNext })}</i></div>
    <div class="lvl-track"><div style="width:${l.pct}%"></div></div></div>`;
}

function itemCard(it, me) {
  const owned = it.kind === 'cosmetic' && (me?.owned || []).includes(it.code);
  const equipped = owned && me.frame === it.code;
  const out = it.stock != null && it.stock <= 0;
  let btn;
  if (!me) btn = `<a class="btn small primary" href="#/login/register">${t('land_join')}</a>`;
  else if (equipped) btn = `<button class="btn small ghost" data-act="equip" data-code="">${t('unequip')}</button>`;
  else if (owned) btn = `<button class="btn small" data-act="equip" data-code="${esc(it.code)}">${t('equip')}</button>`;
  else if (out) btn = `<span class="pill">${t('sold_out')}</span>`;
  else btn = `<button class="btn small ${me.coins >= it.cost ? 'primary' : ''}" data-act="buy" data-id="${esc(it.id)}" ${me.coins >= it.cost ? '' : 'disabled'}>${coins(it.cost)}</button>`;
  return `<div class="item k-${it.kind}">
    <div class="item-ic ${FRAMES.includes(it.code) ? it.code : ''}">${it.image_url ? `<img src="${esc(it.image_url)}" alt="">` : { cosmetic: '🖼️', perk: '⚡', reward: '🎁' }[it.kind]}</div>
    <div class="item-body"><b>${esc(it.title)}</b>${it.sponsor ? `<span class="sponsor">${t('sponsored_by')} ${esc(it.sponsor)}</span>` : ''}
      <div class="small muted">${esc(it.descr || '')}${it.stock != null ? ` · ${t('in_stock', { n: Math.max(it.stock, 0) })}` : ''}</div></div>
    ${btn}</div>`;
}

export function renderShop(root) {
  const me = store.me;
  const items = store.data.shop_items.filter((i) => i.active).sort((a, b) => a.sort - b.sort);
  const sec = (kind) => items.filter((i) => i.kind === kind).map((i) => itemCard(i, me)).join('');
  const mine = store.data.purchases.filter((p) => me && p.player_id === me.id && p.status !== 'done').sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  const ledger = [...store.data.coin_ledger].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)).slice(0, 15);

  root.innerHTML = `
    <div class="page-head"><h1>🪙 ${t('shop_title')}</h1></div>
    ${me ? `<div class="wallet"><div class="wallet-top"><div><div class="small muted">${t('wallet_balance')}</div><div class="wallet-coins">🪙 ${me.coins}</div></div>
        <a class="btn ghost small" href="#/season">🏅 ${t('badges_seasons')}</a></div>${levelBar(me)}</div>
      ${missionsBlock()}` : `<div class="notice">${t('shop_guest')} <a href="#/login/register"><b>${t('land_join')}</b></a></div>`}

    ${sec('reward') ? `<h3>🎁 ${t('shop_rewards')}</h3><p class="small muted">${t('shop_rewards_hint')}</p><div class="items">${sec('reward')}</div>` : ''}
    <h3>⚡ ${t('shop_perks')}</h3><p class="small muted">${t('shop_perks_hint')}</p><div class="items">${sec('perk')}</div>
    <h3>🖼️ ${t('shop_cosmetics')}</h3><div class="items">${sec('cosmetic')}</div>

    ${mine.length ? `<h3>📦 ${t('my_orders')}</h3>${mine.map((p) => { const it = store.data.shop_items.find((i) => i.id === p.item_id); return `<div class="notice row-between"><span>${esc(it?.title || '?')} <span class="muted small">· ${fmtDate(p.created_at)}</span></span><span class="pill ${p.status === 'fulfilled' ? 'ok' : p.status === 'cancelled' ? 'err' : ''}">${t('pst_' + p.status)}</span></div>`; }).join('')}` : ''}

    <h3>💡 ${t('how_to_earn')}</h3>
    <div class="earn">${COIN_TABLE.map(([r, n]) => `<div><span>${t('cr_reason_' + r)}</span>${coins('+' + n)}</div>`).join('')}</div>

    ${me && !me.invited_by ? `<h3>📣 ${t('ref_title')}</h3><div class="notice"><p class="small muted">${t('ref_hint')}</p>
      <div class="row"><input id="refn" placeholder="${t('ref_ph')}" style="flex:1"><button class="btn primary" data-act="ref">${t('confirm')}</button></div></div>`
    : me ? `<p class="small muted">📣 ${t('ref_done', { n: esc(profileById(me.invited_by)?.nick || '?') })} ${t('ref_share')}</p>` : ''}

    ${ledger.length ? `<h3>🧾 ${t('ledger_title')}</h3><ul class="ledger">${ledger.map((l) => `<li><span>${t('cr_reason_' + l.reason)}<span class="muted small"> · ${fmtDate(l.created_at)}</span></span><b class="${l.amount < 0 ? 'neg' : 'pos'}">${l.amount > 0 ? '+' : ''}${l.amount}</b></li>`).join('')}</ul>` : ''}`;

  bind(root, {
    equip: (d) => act('equip_frame', { p_code: d.code || null }, 'ok_saved'),
    ref: () => act('set_referrer', { p_nick: root.querySelector('#refn').value }, 'ok_ref'),
    buy: async (d) => {
      const it = store.data.shop_items.find((i) => i.id === d.id);
      if (it.kind === 'cosmetic') { if (await confirmBox(t('buy_q', { item: it.title, n: it.cost }))) act('buy_item', { p_item: it.id, p_note: null }, 'ok_bought'); return; }
      modal(`<h3>${esc(it.title)}</h3><p class="muted">${esc(it.descr || '')}</p>
        <label>${t(it.kind === 'reward' ? 'buy_note_reward' : 'buy_note_perk')}<input id="bn" maxlength="200"></label>
        <p class="small muted">${t('buy_pending_hint')}</p>
        <div class="row end"><button class="btn ghost" data-close>${t('cancel')}</button><button class="btn primary" id="ok">${t('buy_for', { n: it.cost })}</button></div>`,
      (m, close) => { m.querySelector('#ok').onclick = async () => { if (await act('buy_item', { p_item: it.id, p_note: m.querySelector('#bn').value }, 'ok_ordered')) close(); }; });
    },
  });
}
