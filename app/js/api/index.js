import { CONFIG } from '../config.js';

export let api = null;

export async function initApi() {
  if (CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY) {
    const m = await import('./supabase.js');
    api = await m.create(CONFIG);
  } else {
    const m = await import('./demo.js');
    api = m.create();
  }
  return api;
}
