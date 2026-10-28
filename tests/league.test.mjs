import test from 'node:test';
import assert from 'node:assert/strict';
import { zipSync, strToU8 } from 'fflate';
import { parseLeague, canonical, REFRESH_MS } from '../lib/workbook.mjs';
import seed from '../data/league.json' with { type: 'json' };

const escape = s => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;');
function fixture() {
  const tabs = [
    ['Ligaški deo', {1:{A:'Ligaški deo 2026/27'},4:{A:'HTEC',B:-1,C:1},5:{G:1,H:'HTEC',I:1,J:1,K:0,L:0,M:2,N:0,O:2,P:2},6:{G:2,H:'Boopro',I:1,J:0,K:0,L:1,M:0,N:2,O:-2,P:0},20:{A:'HTEC',B:'Boopro',C:2,D:':',E:0,F:'KOLO 1'},22:{H:'28.9.2026. - 4.10.2026.'},23:{A:'Boopro',B:'HTEC',D:':',F:'KOLO 2'},24:{H:'5.10.2026. - 11.10.2026.'},25:{H:'NEDELJE NADOKNADE 30.11. - 14.12.2026.'}}],
    ['Lista strelaca - Ligaški deo',{3:{A:'Test Player',B:'HTEC',C:2,N:2}}],
    ['Kontakt podaci ekipa i gde imaj',{2:{A:'HTEC Niš',B:'Elektronska, četvrtak 21h',C:'Zeleni',D:'Captain',E:'private@example.test',F:'0601234567'},3:{A:'Boopro tech',B:'Popovac',C:'Beli',D:'Captain B'}}],
    ['Kontakt podaci organizatora',{3:{B:'Commissioner'}}],
    ['Options',{2:{A:'points for a win',B:3},3:{A:'points for a draw',B:1},4:{A:'points for a loss',B:0}}],
  ];
  const files = {
    'xl/workbook.xml': `<workbook><sheets>${tabs.map(([name],i)=>`<sheet name="${name}" r:id="rId${i+1}"/>`).join('')}</sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': `<Relationships>${tabs.map((_,i)=>`<Relationship Id="rId${i+1}" Target="worksheets/sheet${i+1}.xml"/>`).join('')}</Relationships>`,
  };
  tabs.forEach(([,rows],i) => { files[`xl/worksheets/sheet${i+1}.xml`] = `<worksheet><sheetData>${Object.entries(rows).map(([n,cells])=>`<row r="${n}">${Object.entries(cells).map(([col,v])=>typeof v === 'number' ? `<c r="${col}${n}"><v>${v}</v></c>` : `<c r="${col}${n}" t="inlineStr"><is><t>${escape(v)}</t></is></c>`).join('')}</row>`).join('')}</sheetData></worksheet>`; });
  return zipSync(Object.fromEntries(Object.entries(files).map(([k,v])=>[k,strToU8(v)])));
}

test('imports all tabs, keeps a 0 score, preserves missing scores and official points', () => {
  const d = parseLeague(fixture(), '2026-10-28T12:00:00.000Z');
  assert.equal(d.sheets.length, 5);
  assert.equal(d.matches[0].awayScore, 0);
  assert.equal(d.matches[0].status, 'finished');
  assert.equal(d.matches[1].homeScore, null);
  assert.equal(d.matches[1].status, 'scheduled');
  assert.equal(d.teams[0].points, 2); // official penalty-adjusted points, not recomputed
  assert.equal(d.teams[0].adjustment, -1);
  assert.equal(d.teams[0].venue, 'Elektronska, četvrtak 21h');
  assert.deepEqual(d.teams[0].form, ['W']);
  assert.equal(d.scorers[0].goals, 2);
  assert.equal(d.scoring.win, 3);
  assert.equal(d.rounds[1].dateLabel, '5.10.2026. - 11.10.2026.');
  assert.ok(!JSON.stringify(d).includes('private@example.test'));
  assert.ok(!JSON.stringify(d).includes('0601234567'));
});

test('normalizes club aliases and rejects invalid workbooks', () => {
  assert.equal(canonical(' HTEC Niš '), 'HTEC');
  assert.equal(canonical('Boopro tech'), 'Boopro');
  assert.equal(canonical('DualSoft'), 'Dualsoft');
  assert.throws(()=>parseLeague(strToU8('<html>Sign in</html>')));
});

test('real saved season has complete rounds and consistent standings', () => {
  assert.equal(seed.teams.length, 12);
  assert.equal(seed.matches.length, 66);
  for (const r of seed.rounds) assert.equal(seed.matches.filter(m=>m.round===r.number).length, 6);
  for (const t of seed.teams) {
    assert.equal(t.played, t.won + t.drawn + t.lost);
    assert.equal(t.goalDifference, t.goalsFor - t.goalsAgainst);
    assert.equal(seed.matches.filter(m=>m.status==='finished'&&(m.home===t.name||m.away===t.name)).length,t.played);
  }
  assert.equal(seed.teams[0].name,'SkySoft');
  assert.equal(seed.scorers[0].goals,13);
});

test('sync coalesces requests, rechecks at 10 minutes, and retains good data after failure', async t => {
  let now = 1_800_000_000_000, calls = 0;
  t.mock.method(Date, 'now', () => now);
  t.mock.method(globalThis, 'fetch', async () => { calls++; return new Response(fixture()); });
  const { getLeague } = await import('../lib/league.mjs?sync-test');
  const results = await Promise.all([getLeague(),getLeague(),getLeague()]);
  assert.equal(calls,1);
  assert.equal(results[0].sync.status,'connected');
  now += REFRESH_MS - 1;
  await getLeague();
  assert.equal(calls,1);
  now++;
  await getLeague();
  assert.equal(calls,2);
  t.mock.method(globalThis, 'fetch', async () => { calls++; throw new Error('Google is offline'); });
  now += REFRESH_MS;
  const fallback = await getLeague();
  assert.equal(calls,3);
  assert.equal(fallback.sync.status,'stale');
  assert.equal(fallback.matches[0].awayScore,0);
  assert.equal(fallback.teams[0].points,2);
});
