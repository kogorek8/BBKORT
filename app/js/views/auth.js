// Logowanie / rejestracja (Supabase) albo wybór gracza (demo)
import { api } from '../api/index.js';
import { t } from '../i18n.js';
import { esc, bind, toast } from '../ui.js';
import { store, reload, errText } from '../state.js';

let mode = 'login';

export function renderAuth(root, m) {
  if (m === 'register' || m === 'login') mode = m;
  if (api.mode === 'demo') return renderDemoUsers(root);
  if (store.me) {
    root.innerHTML = `<div class="auth"><h1>${t('account')}</h1><p>${t('logged_as')} <b>${esc(store.me.nick)}</b></p>
      <a class="btn" href="#/player/me">${t('nav_profile')}</a> <button class="btn ghost" data-act="out">${t('logout')}</button></div>`;
    bind(root, { out: async () => { await api.signOut(); await reload(); location.hash = '#/home'; } });
    return;
  }
  root.innerHTML = `<div class="auth">
    <div class="brand big">BB<span>KORT</span></div>
    <div class="seg wide"><button data-act="mode" data-m="login" class="${mode === 'login' ? 'on' : ''}">${t('login')}</button>
      <button data-act="mode" data-m="register" class="${mode === 'register' ? 'on' : ''}">${t('register')}</button></div>
    <form id="af">
      ${mode === 'register' ? `<label>${t('nick')}<input name="nick" required minlength="2" maxlength="24"></label>` : ''}
      <label>E-mail<input name="email" type="email" required autocomplete="email"></label>
      <label>${t('password')}<input name="pw" type="password" required minlength="6" autocomplete="${mode === 'login' ? 'current-password' : 'new-password'}"></label>
      <button class="btn primary block" type="submit">${mode === 'login' ? t('login') : t('register')}</button>
    </form>
    ${mode === 'login' ? `<button class="linkish" data-act="forgot">${t('forgot_password')}</button>` : ''}
  </div>`;
  bind(root, {
    mode: (d) => { mode = d.m; renderAuth(root); },
    forgot: async () => {
      const email = root.querySelector('input[name=email]').value;
      if (!email) return toast(t('enter_email'), 'err');
      try { await api.resetPassword(email); toast(t('reset_sent'), 'ok'); } catch (e) { toast(errText(e), 'err'); }
    },
  });
  root.querySelector('#af').onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    try {
      if (mode === 'login') await api.signIn(f.get('email'), f.get('pw'));
      else {
        const r = await api.signUp(f.get('email'), f.get('pw'), f.get('nick'));
        if (r.needsConfirm) { toast(t('check_email'), 'ok'); return; }
      }
      await reload();
      location.hash = '#/home';
    } catch (err) { toast(errText(err), 'err'); }
  };
}

function renderDemoUsers(root) {
  const users = api.demo.users();
  const cur = api.demo.currentUser();
  root.innerHTML = `<div class="auth wide">
    <h1>🧪 ${t('demo_mode')}</h1>
    <p class="muted small">${t('demo_users_hint')}</p>
    <div class="ulist">${users.map((u) => `<button class="uitem ${u.id === cur ? 'on' : ''}" data-act="as" data-id="${esc(u.id)}">
      ${u.sport === 'football' ? '⚽' : '🏀'} <b>${esc(u.nick)}</b> <span class="small muted">${u.team ? esc(u.team) : t('free_agent')}${u.captain ? ' · ' + t('captain') : ''}${u.admin ? ' · admin' : ''}${u.moderator ? ' · 🧑‍⚖️ ' + t('moderator') : ''}</span></button>`).join('')}</div>
  </div>`;
  bind(root, { as: (d) => { api.demo.switchUser(d.id); toast(t('switched_user'), 'ok'); location.hash = '#/home'; } });
}
