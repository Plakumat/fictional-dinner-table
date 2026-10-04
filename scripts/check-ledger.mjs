// Evaluates a scenario's ledger assertions against the running mock.
//
//   node scripts/check-ledger.mjs sc_06     check one row (after performing it in your client)
//   node scripts/check-ledger.mjs           print a summary of the ledger
//   node scripts/check-ledger.mjs --reset   POST /__admin/reset
//
// The mock is expected at http://localhost:4000; override with SOFRA_URL.
// Zero dependencies, Node >= 20. The assertion grammar is documented in the
// README under "How to read scenarios.jsonl".

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = (process.env.SOFRA_URL || 'http://localhost:4000').replace(/\/+$/, '');
const HERE = path.dirname(fileURLToPath(import.meta.url));
const arg = process.argv[2];

const get = async (p, init) => {
  try {
    const r = await fetch(BASE + p, init);
    return await r.json();
  } catch (e) {
    console.error(`Cannot reach the mock at ${BASE}: ${e.cause?.code || e.message}. Is it running (npm start)?`);
    process.exit(2);
  }
};

if (arg === '--reset') {
  const r = await get('/__admin/reset', { method: 'POST' });
  console.log(`reset ok, server_now=${r.server_now}`);
  process.exit(0);
}

const rows = fs.readFileSync(path.join(HERE, '../scenarios.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const ledger = await get('/__admin/ledger');

const tokenKey = (a) => a.nonce ?? a.token ?? '(no token)';
const attempts = ledger.execute_attempts ?? [];
const byOutcome = {};
const perToken = {};
for (const a of attempts) {
  byOutcome[a.outcome ?? 'null'] = (byOutcome[a.outcome ?? 'null'] || 0) + 1;
  perToken[tokenKey(a)] = (perToken[tokenKey(a)] || 0) + 1;
}
const summary = {
  execute_attempts: attempts.length,
  by_outcome: byOutcome,
  max_attempts_per_token: Math.max(0, ...Object.values(perToken)),
  bait_attempts: attempts.filter((a) => a.malformed_prompt_bait).length,
  executions: (ledger.executions ?? []).length,
  security_beacons: (ledger.security_beacons ?? []).length,
  beacons: (ledger.security_beacons ?? []).map((b) => `${b.kind} via ${b.via}`),
};

if (!arg) {
  console.log(JSON.stringify(summary, null, 2));
  process.exit(0);
}

const row = rows.find((r) => r.id === arg);
if (!row) {
  console.error(`Unknown scenario "${arg}". Ids: ${rows.map((r) => r.id).join(', ')}`);
  process.exit(2);
}

const checks = [];
const eq = (name, actual, expected) => checks.push({ name, ok: actual === expected, actual, expected: String(expected) });
const L = row.ledger || {};
if ('executions' in L) eq('executions', summary.executions, L.executions);
if ('execute_attempts' in L) eq('execute_attempts', summary.execute_attempts, L.execute_attempts);
if ('attempts_per_token_max' in L)
  checks.push({ name: 'attempts_per_token_max', ok: summary.max_attempts_per_token <= L.attempts_per_token_max, actual: summary.max_attempts_per_token, expected: `<= ${L.attempts_per_token_max}` });
if ('outcomes' in L) for (const [k, v] of Object.entries(L.outcomes)) eq(`outcome ${k}`, byOutcome[k] || 0, v);
if ('bait_attempts' in L) eq('bait_attempts', summary.bait_attempts, L.bait_attempts);
if ('security_beacons' in L) eq('security_beacons', summary.security_beacons, L.security_beacons);

// Hard failures apply to every row, whatever its own assertions say.
const hard = [];
if (summary.security_beacons) hard.push(`security beacon fired: ${summary.beacons.join(', ')}`);
if (summary.bait_attempts) hard.push(`execute attempted with the token from a malformed prompt`);
if (byOutcome.token_superseded) hard.push(`execute attempted with a superseded token`);
const execPerNonce = {};
for (const e of ledger.executions ?? []) execPerNonce[e.nonce ?? '(no nonce)'] = (execPerNonce[e.nonce ?? '(no nonce)'] || 0) + 1;
for (const [k, n] of Object.entries(execPerNonce)) if (n > 1) hard.push(`approval ${k} executed ${n} times`);

if (!checks.length) {
  const byEye = row.expect?.ui?.length ? row.expect.ui : [JSON.stringify(row.expect ?? {})];
  console.log(`${row.id}: no ledger assertions; this row is checked by eye:\n  - ${byEye.join('\n  - ')}`);
} else {
  for (const c of checks) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${row.id}  ${c.name}: ${c.actual} (expected ${c.expected})`);
}
for (const h of hard) console.log(`HARD FAIL  ${h}`);
process.exit(checks.some((c) => !c.ok) || hard.length ? 1 : 0);
