import { CONFIG } from '../config.js';

export let api = null;

export async function initApi() {
  // ?demo=1 w adresie → wersja pokazowa z przykładowymi danymi (bez wpływu na prawdziwą bazę)
  const demo = new URLSearchParams(location.search).has('demo');
  if (!demo && CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY) {
    const m = await import('./supabase.js');
    api = await m.create(CONFIG);
  } else {
    const m = await import('./demo.js');
    api = m.create();
  }
  return api;
}
