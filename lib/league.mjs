import snapshot from '../data/league.json' with { type: 'json' };
import { EXPORT_URL, REFRESH_MS, parseLeague } from './workbook.mjs';

// Share state across Next.js route/instrumentation bundles and development reloads.
const key = Symbol.for('it-liga.workbook-sync');
const state = globalThis[key] ??= { cached: snapshot, lastAttempt: 0, checkedAt: null, lastError: null, inFlight: undefined, timer: undefined };

export async function getLeague({ force = false } = {}) {
  if (state.inFlight) return state.inFlight;
  if (!force && Date.now() - state.lastAttempt < REFRESH_MS) return response();
  state.lastAttempt = Date.now();
  state.inFlight = (async () => {
    try {
      const result = await fetch(EXPORT_URL, { cache: 'no-store', signal: AbortSignal.timeout(25000) });
      if (!result.ok) throw new Error(`Spreadsheet returned HTTP ${result.status}`);
      const next = parseLeague(await result.arrayBuffer());
      state.cached = next;
      state.checkedAt = new Date().toISOString();
      state.lastError = null;
    } catch (error) {
      state.checkedAt = new Date().toISOString();
      state.lastError = 'The spreadsheet is temporarily unavailable. Showing the last successful update.';
      console.error('[league-sync]', error instanceof Error ? error.message : 'Fetch failed');
    }
    return response();
  })().finally(() => { state.inFlight = undefined; });
  return state.inFlight;
}

function response() {
  return { ...state.cached, sync: { checkedAt: state.checkedAt, lastSuccessfulAt: state.cached.fetchedAt, nextCheckAt: new Date(state.lastAttempt + REFRESH_MS).toISOString(), intervalMs: REFRESH_MS, status: state.lastError ? 'stale' : state.checkedAt ? 'connected' : 'snapshot', message: state.lastError } };
}

export function startLeagueSync() {
  if (state.timer) return state.timer;
  void getLeague();
  const timer = setInterval(() => void getLeague(), REFRESH_MS);
  timer.unref?.();
  state.timer = timer;
  return timer;
}
