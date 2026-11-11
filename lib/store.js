'use strict';

/**
 * JSON data layer.
 *
 * All site content lives in a single file: data/db.json
 * Uploaded images live in: data/uploads/
 *
 * To migrate the whole site, copy these two things plus the project folder.
 * DATA_DIR can be overridden with an environment variable so the data can be
 * placed on a separate persistent volume in production.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(ROOT, 'data');
const DB_PATH = path.join(DATA_DIR, 'db.json');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');

function emptyDb() {
  return {
    settings: {},
    categories: [],
    products: [],
    posts: [],
    applications: [],
    faqs: [],
    inquiries: []
  };
}

function ensureDirs() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const SEED_DB = path.join(ROOT, 'data', 'db.json');

/**
 * On a managed platform DATA_DIR usually points at an EMPTY persistent volume
 * on first boot. Copy the bundled seed database there so a fresh deployment
 * shows the full catalog instead of an empty site. Later deploys keep their
 * own db.json and are never overwritten.
 */
function seedIfEmpty() {
  if (DB_PATH === SEED_DB || fs.existsSync(DB_PATH)) return;
  if (!fs.existsSync(SEED_DB)) return;
  try {
    fs.copyFileSync(SEED_DB, DB_PATH);
    console.log('[store] seeded empty data volume from bundled db.json');
  } catch (err) {
    console.warn('[store] could not seed data volume:', err.message);
  }
}

let cache = null;

function getDb() {
  if (cache === null) {
    ensureDirs();
    seedIfEmpty();
    try {
      const parsed = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
      const base = emptyDb();
      cache = Object.assign(base, parsed);
      // Guarantee every collection is an array, even after a partial import.
      ['categories', 'products', 'posts', 'applications', 'faqs', 'inquiries'].forEach((key) => {
        if (!Array.isArray(cache[key])) cache[key] = [];
      });
      if (!cache.settings || typeof cache.settings !== 'object') cache.settings = {};
    } catch (err) {
      console.warn('[store] Could not read db.json, starting with empty data:', err.message);
      cache = emptyDb();
    }
  }
  return cache;
}

/**
 * Atomic write: write to a temp file first, then rename.
 * This prevents a half-written db.json if the process is killed mid-save.
 */
function saveDb() {
  try {
    ensureDirs();
    const tmp = DB_PATH + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(cache, null, 2), 'utf8');
    fs.renameSync(tmp, DB_PATH);
  } catch (err) {
    // Read-only sandboxes (e.g. a preview deployment) can still serve content
    // from memory. Fail softly instead of returning HTTP 500 on every write.
    console.warn('[store] Data could not be persisted (read-only filesystem?):', err.message);
  }
}

function replaceDb(next) {
  const base = emptyDb();
  const merged = Object.assign(base, next);
  ['categories', 'products', 'posts', 'applications', 'faqs', 'inquiries'].forEach((key) => {
    if (!Array.isArray(merged[key])) merged[key] = [];
  });
  if (!merged.settings || typeof merged.settings !== 'object') merged.settings = {};

  // An import replaces everything. Keep a rollback copy first so a mistaken
  // import can be undone by copying db.backup.json back over db.json.
  try {
    if (cache && fs.existsSync(DB_PATH)) {
      fs.writeFileSync(path.join(DATA_DIR, 'db.backup.json'), JSON.stringify(cache, null, 2), 'utf8');
    }
  } catch (err) {
    console.warn('[store] Could not create rollback backup:', err.message);
  }

  cache = merged;
  saveDb();
  return cache;
}

function uid(prefix) {
  return String(prefix || 'id') + '-' +
    Date.now().toString(36) + '-' +
    cryptoRandom();
}

function cryptoRandom() {
  // Lazy require keeps this module small; Math.random is fine for non-secret ids.
  return Math.random().toString(36).slice(2, 10);
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90) || 'item';
}

/** Make a slug unique inside a collection. */
function uniqueSlug(list, desired, exceptId) {
  const base = slugify(desired);
  let slug = base;
  let n = 2;
  while (list.some((item) => item.slug === slug && item.id !== exceptId)) {
    slug = base + '-' + n;
    n += 1;
  }
  return slug;
}

module.exports = {
  getDb,
  saveDb,
  replaceDb,
  uid,
  slugify,
  uniqueSlug,
  dataDir: () => DATA_DIR,
  uploadsDir: () => UPLOAD_DIR,
  dbPath: () => DB_PATH
};
