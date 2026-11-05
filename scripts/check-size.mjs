// Bundle budget gate (Blueprint v3 §11): initial JS for /play must stay ≤ 400 KB gzipped.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const BUDGET_KB = 400;
const dir = join(import.meta.dirname, '..', 'dist', 'assets');

let total = 0;
for (const file of readdirSync(dir)) {
  if (!file.endsWith('.js')) continue;
  const gz = gzipSync(readFileSync(join(dir, file))).length;
  total += gz;
  console.info(`${file.padEnd(40)} ${(gz / 1024).toFixed(1)} KB gz`);
}

const totalKb = total / 1024;
console.info(`TOTAL ${totalKb.toFixed(1)} KB gz (budget ${BUDGET_KB} KB)`);
if (totalKb > BUDGET_KB) {
  console.error('Bundle budget exceeded.');
  process.exit(1);
}
