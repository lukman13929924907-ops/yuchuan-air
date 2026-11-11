'use strict';

/**
 * Verifies the managed-platform boot path:
 *   1. An empty DATA_DIR (fresh persistent volume) is seeded with the full
 *      bundled catalog instead of serving an empty website.
 *   2. Importing a backup without `faqs` still yields an array (no crash).
 * Run: node tests/store.test.js
 * Uses a temporary directory only - never touches the real data/db.json.
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'yc-store-test-'));
process.env.DATA_DIR = tmp;

let pass = 0;
let fail = 0;
function ck(name, fn) {
  try { fn(); pass += 1; console.log('PASS ' + name); }
  catch (err) { fail += 1; console.log('FAIL ' + name + ' :: ' + err.message); }
}

// store.js reads DATA_DIR at require time, so the env var must be set first.
const store = require('../lib/store');

ck('empty volume is seeded with the full product catalog', function () {
  const db = store.getDb();
  assert.ok(db.products.length >= 15, 'expected seeded products, got ' + db.products.length);
  assert.ok(db.categories.length >= 10, 'expected seeded categories');
  assert.ok(db.faqs.length >= 12, 'expected seeded FAQs');
});

ck('seed was written into the volume as db.json', function () {
  assert.strictEqual(fs.existsSync(path.join(tmp, 'db.json')), true);
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(tmp, 'db.json'), 'utf8')).products.length >= 15, true);
});

ck('uploads directory is created inside the volume', function () {
  assert.strictEqual(fs.existsSync(path.join(tmp, 'uploads')), true);
});

ck('import without faqs keeps faqs as an array', function () {
  const snapshot = JSON.parse(JSON.stringify(store.getDb()));
  delete snapshot.faqs;
  store.replaceDb(snapshot);
  assert.strictEqual(Array.isArray(store.getDb().faqs), true);
  assert.strictEqual(store.getDb().faqs.length, 0);
});

ck('import creates a rollback backup', function () {
  assert.strictEqual(fs.existsSync(path.join(tmp, 'db.backup.json')), true);
});

delete process.env.DATA_DIR;
try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (err) { /* Windows lock, harmless */ }

console.log('RESULT pass=' + pass + ' fail=' + fail);
if (fail) process.exit(1);
