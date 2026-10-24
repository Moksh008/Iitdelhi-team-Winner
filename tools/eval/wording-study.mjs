/**
 * Summarises the alert-wording study (docs/13_ALERT_WORDING_STUDY.md).
 *
 *   node tools/eval/wording-study.mjs [docs/metrics/wording-study.csv]
 */
import { existsSync, readFileSync } from 'node:fs';

const path = process.argv[2] || 'docs/metrics/wording-study.csv';
if (!existsSync(path)) {
  console.log(`No results yet: ${path} not found. Run the study in docs/13_ALERT_WORDING_STUDY.md first.`);
  process.exit(0);
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i += 1; } else if (ch === '"') quoted = false; else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field); field = '';
      if (row.some(cell => cell.trim())) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some(cell => cell.trim())) rows.push(row);
  const [header, ...body] = rows;
  return body.map(cells => Object.fromEntries(header.map((name, i) => [name.trim(), (cells[i] || '').trim()])));
}

const rows = parseCsv(readFileSync(path, 'utf8'));
const median = values => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
const mean = values => {
  const nums = values.filter(Number.isFinite);
  return nums.length ? Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10 : null;
};

const volunteers = new Set(rows.map(row => row.volunteer));
console.log(`Alert-wording study: n = ${volunteers.size} volunteers (indicative only)\n`);
for (const alert of ['A', 'B']) {
  const subset = rows.filter(row => row.alert === alert);
  const stopped = subset.filter(row => row.stopped.toLowerCase() === 'yes').length;
  console.log(`${alert === 'A' ? 'A  Satark (specific)' : 'B  Generic'}`);
  console.log(`   stopped            : ${stopped}/${subset.length}`);
  console.log(`   median seconds     : ${median(subset.map(row => Number(row.seconds_to_decide)))}`);
  console.log(`   Q1 clarity (1-5)   : ${mean(subset.map(row => Number(row.q1_clarity)))}`);
  console.log(`   Q2 would check     : ${mean(subset.map(row => Number(row.q2_would_check)))}`);
  console.log(`   Q3 accusing (low=good): ${mean(subset.map(row => Number(row.q3_accusing)))}\n`);
}
const preference = {};
for (const id of volunteers) {
  const choice = rows.find(row => row.volunteer === id)?.preferred || 'unknown';
  preference[choice] = (preference[choice] || 0) + 1;
}
console.log(`Preferred: ${Object.entries(preference).map(([k, v]) => `${k} ${v}`).join(', ')}`);
