import { getLeague } from '../../../lib/league.mjs';

export const dynamic = 'force-dynamic';

export async function GET() {
  const data = await getLeague();
  return Response.json(data, { headers: { 'Cache-Control': 'no-store' } });
}
