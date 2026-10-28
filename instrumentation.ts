export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startLeagueSync } = await import('./lib/league.mjs');
    startLeagueSync();
  }
}
