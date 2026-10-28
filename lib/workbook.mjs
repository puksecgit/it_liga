import { unzipSync, strFromU8 } from 'fflate';
import { XMLParser } from 'fast-xml-parser';

export const SHEET_ID = '1Vm22gtDxlSCC-1ssUDSN5yedsiCY9tC-v0aZeDWc_9E';
export const SOURCE_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit`;
export const EXPORT_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=xlsx`;
export const REFRESH_MS = 10 * 60 * 1000;
const xml = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@', parseTagValue: false, trimValues: false });
const array = value => value == null ? [] : Array.isArray(value) ? value : [value];
const text = value => typeof value === 'object' ? String(value?.['#text'] ?? '') : String(value ?? '');
const richText = node => node?.t != null ? text(node.t) : array(node?.r).map(r => text(r.t)).join('');
const number = value => value !== '' && value != null && Number.isFinite(Number(value)) ? Number(value) : null;
export const canonical = value => ({ 'htec nis': 'HTEC', 'boopro tech': 'Boopro', dualsoft: 'Dualsoft' }[String(value).trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()] ?? String(value).trim());

export function readWorkbook(buffer) {
  const files = unzipSync(new Uint8Array(buffer));
  const read = path => { if (!files[path]) throw new Error(`Workbook entry missing: ${path}`); return xml.parse(strFromU8(files[path])); };
  const strings = files['xl/sharedStrings.xml'] ? array(read('xl/sharedStrings.xml').sst.si).map(richText) : [];
  const relations = Object.fromEntries(array(read('xl/_rels/workbook.xml.rels').Relationships.Relationship).map(r => [r['@Id'], r['@Target']]));
  return array(read('xl/workbook.xml').workbook.sheets.sheet).map(sheet => {
    const target = relations[sheet['@r:id']];
    const path = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`;
    const rows = {};
    for (const row of array(read(path).worksheet.sheetData?.row)) {
      const cells = {};
      for (const cell of array(row.c)) {
        const column = cell['@r'].replace(/\d/g, '');
        cells[column] = cell['@t'] === 's' ? strings[Number(cell.v)] : cell['@t'] === 'inlineStr' ? richText(cell.is) : text(cell.v);
      }
      rows[Number(row['@r'])] = cells;
    }
    return { name: sheet['@name'], rows };
  });
}

export function parseLeague(buffer, fetchedAt = new Date().toISOString()) {
  const sheets = readWorkbook(buffer);
  const main = sheets.find(s => /^Ligaški deo$/i.test(s.name));
  const scorersSheet = sheets.find(s => /Lista strelaca/i.test(s.name));
  const contacts = sheets.find(s => /Kontakt podaci ekipa/i.test(s.name));
  const options = sheets.find(s => s.name === 'Options');
  if (!main || !scorersSheet) throw new Error('Expected league and scorer worksheets were not found.');
  const rows = Object.values(main.rows);
  const teams = rows.filter(r => r.G && r.H && number(r.I) != null && number(r.P) != null).map(r => ({
    rank: Number(r.G), name: canonical(r.H), played: Number(r.I), won: Number(r.J), drawn: Number(r.K), lost: Number(r.L), goalsFor: Number(r.M), goalsAgainst: Number(r.N), goalDifference: Number(r.O), points: Number(r.P),
    form: [], venue: '', kit: '', captain: '', postponed: 0, adjustment: 0,
  })).sort((a, b) => a.rank - b.rank);
  if (teams.length < 2) throw new Error('No valid standings in workbook.');
  const names = new Set(teams.map(t => t.name));
  for (const row of Object.values(contacts?.rows ?? {})) {
    const team = teams.find(t => t.name === canonical(row.A));
    // Only publish sporting information. Email addresses and phone numbers never enter the API or snapshot.
    if (team) Object.assign(team, { venue: row.B?.trim() ?? '', kit: row.C?.trim() ?? '', captain: row.D?.trim() ?? '' });
  }
  for (const row of rows) {
    const team = teams.find(t => t.name === canonical(row.A));
    if (team && !row.B?.trim()) { team.postponed = Number(row.C || 0); team.adjustment = Number(row.B || 0); }
    else if (team && number(row.B) != null && !row.D) team.adjustment = Number(row.B);
  }
  let round = null;
  const rounds = [];
  const matches = [];
  for (const [rowNum, row] of Object.entries(main.rows)) {
    const roundMatch = row.F?.match(/KOLO\s+(\d+)/i);
    if (roundMatch) { round = { number: Number(roundMatch[1]), dateLabel: '', deadline: '', note: '' }; rounds.push(round); }
    if (!round) continue;
    if (row.H && /^(?:\d+\.\d+\.\d{4}|TBD$)/.test(row.H.trim())) round.dateLabel = row.H;
    else if (row.H && /Neradni/.test(row.H)) round.note = row.H;
    if (row.K) round.deadline = row.K;
    if (!names.has(canonical(row.A)) || !names.has(canonical(row.B))) continue;
    const homeScore = number(row.C), awayScore = number(row.E);
    matches.push({ id: `r${round.number}-${rowNum}`, round: round.number, home: canonical(row.A), away: canonical(row.B), homeScore, awayScore, status: homeScore != null && awayScore != null ? 'finished' : 'scheduled' });
  }
  for (const team of teams) team.form = matches.filter(m => m.status === 'finished' && (m.home === team.name || m.away === team.name)).slice(-5).map(m => {
    const [gf, ga] = m.home === team.name ? [m.homeScore, m.awayScore] : [m.awayScore, m.homeScore];
    return gf > ga ? 'W' : gf === ga ? 'D' : 'L';
  });
  const scorers = Object.values(scorersSheet.rows).filter(r => r.A && names.has(canonical(r.B)) && number(r.N) != null).map(r => ({ name: r.A.trim(), team: canonical(r.B), goals: Number(r.N), rounds: Array.from({ length: 11 }, (_, i) => Number(r[String.fromCharCode(67 + i)] || 0)) })).sort((a, b) => b.goals - a.goals || a.name.localeCompare(b.name));
  const scoring = Object.fromEntries(Object.values(options?.rows ?? {}).filter(r => r.A && number(r.B) != null).map(r => [r.A.replace('points for a ', ''), Number(r.B)]));
  return { season: main.rows[1]?.A?.match(/\d{4}\/\d{2}/)?.[0] ?? '2026/27', teams, matches, rounds, scorers, scoring, sheets: sheets.map(s => ({ name: s.name, rows: Object.keys(s.rows).length })), fetchedAt, sourceUrl: SOURCE_URL };
}
