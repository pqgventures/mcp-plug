#!/usr/bin/env node
// Validates every registry/clients/*.json against registry/schema.json and checks cross-file rules.
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const schema = JSON.parse(readFileSync(join(ROOT, 'registry/schema.json'), 'utf8'));
const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const check = ajv.compile(schema);
const dir = join(ROOT, 'registry/clients');
let bad = 0;
const ids = new Set();
for (const f of readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) {
  const c = JSON.parse(readFileSync(join(dir, f), 'utf8'));
  const problems = [];
  if (!check(c)) problems.push(...check.errors.map((e) => (e.instancePath || '/') + ' ' + e.message));
  if (c.id + '.json' !== f) problems.push('file name must be <id>.json');
  if (ids.has(c.id)) problems.push('duplicate id');
  ids.add(c.id);
  const mids = new Set();
  for (const m of c.methods || []) { if (mids.has(m.id)) problems.push('duplicate method id ' + m.id); mids.add(m.id); }
  if (problems.length) { bad++; console.error('✗ ' + f + '\n  ' + problems.join('\n  ')); }
}
if (bad) { console.error(bad + ' invalid client file(s)'); process.exit(1); }
console.log('✓ ' + ids.size + ' client files valid');

