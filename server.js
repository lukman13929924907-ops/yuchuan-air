#!/usr/bin/env node
'use strict';

/**
 * Shandong Yuchuan Environmental Protection and Energy Saving Technology Co., Ltd.
 * Responsive export website + built-in CMS.
 *
 * ZERO third-party dependencies: only Node.js built-in modules are used.
 * Run:  node server.js        (or: PORT=8080 node server.js)
 *
 * Runtime overrides (environment variables):
 *   PORT            HTTP port                     (default 3000)
 *   HOST            bind address                  (default 0.0.0.0)
 *   ADMIN_USERNAME  admin login name              (default admin)
 *   ADMIN_PASSWORD  admin password; ALWAYS overrides config.json (set this in prod)
 *                   when unset: used to initialise config.json on first boot
 *   DATA_DIR        move data/ to another volume  (default ./data)
 *   FORCE_HTTPS     set to 1 to mark cookies Secure behind a proxy
 *   EMAIL_PROVIDER  resend | postmark | custom    (inquiry email)
 *   EMAIL_API_KEY   mail API key (or RESEND_API_KEY)
 *   EMAIL_FROM      verified sender, e.g. "Yuchuan Air <noreply@yourdomain.com>"
 *   EMAIL_TO        inquiry recipient            (default info@hanxvonfluid.cn)
 *   EMAIL_ENDPOINT  HTTPS endpoint (provider=custom only)
 *
 * All content is stored in data/db.json; uploaded images in data/uploads/.
 * Mail credentials live in config.json / environment variables ONLY - never
 * in db.json, because /api/site exposes db.settings to every visitor.
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const store = require('./lib/store');
const seo = require('./lib/seo');
const mailer = require('./lib/mailer');

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const ADMIN_DIR = path.join(ROOT, 'admin');
const CONFIG_PATH = path.join(ROOT, 'config.json');
const UPLOAD_DIR = store.uploadsDir();
const DEFAULT_PASSWORD = 'Yuchuan@2026';
const MAX_UPLOAD_BYTES = () => Math.max(1, Number(config.maxUploadMB || 6)) * 1024 * 1024;

/* ------------------------------------------------------------------ *
 * 1. Configuration & admin credentials
 * ------------------------------------------------------------------ */

function loadConfig() {
  let raw = {};
  try {
    raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch (err) {
    console.warn('[config] config.json missing or invalid, using defaults:', err.message);
  }

  const cfg = Object.assign({
    port: 3000,
    host: '0.0.0.0',
    sessionHours: 24,
    maxUploadMB: 6,
    admin: { username: 'admin', passwordHash: '', salt: '' }
  }, raw);
  cfg.admin = Object.assign({ username: 'admin', passwordHash: '', salt: '' }, raw.admin || {});

  cfg.port = Number(process.env.PORT || cfg.port) || 3000;
  cfg.host = process.env.HOST || cfg.host;
  if (process.env.ADMIN_USERNAME) cfg.admin.username = process.env.ADMIN_USERNAME;

  // Managed platforms inject the admin password as an env var (see render.yaml).
  // It MUST override the hash committed in config.json, otherwise the documented
  // default password stays valid on the production site no matter what the
  // operator typed into the dashboard. Recompute in memory only: never persist
  // the production secret into the image / repository.
  if (process.env.ADMIN_PASSWORD) {
    const salt = cfg.admin.salt || crypto.randomBytes(16).toString('hex');
    cfg.admin.salt = salt;
    cfg.admin.passwordHash = crypto.scryptSync(String(process.env.ADMIN_PASSWORD), salt, 64).toString('hex');
  }

  if (!cfg.admin.passwordHash || !cfg.admin.salt) {
    const salt = crypto.randomBytes(16).toString('hex');
    const initial = process.env.ADMIN_PASSWORD || DEFAULT_PASSWORD;
    cfg.admin.salt = salt;
    cfg.admin.passwordHash = crypto.scryptSync(initial, salt, 64).toString('hex');
    const persisted = Object.assign({}, raw, { admin: cfg.admin });
    try {
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(persisted, null, 2) + '\n', 'utf8');
    } catch (err) {
      console.warn('[config] Could not persist password hash (read-only FS?):', err.message);
    }
    console.log('\n============================================================');
    console.log('  Admin account initialised (first boot only)');
    console.log('  Panel    : /admin');
    console.log('  Username : ' + cfg.admin.username);
    console.log('  Password : ' + initial);
    console.log('  >>> Please change it in Admin > Settings after login.');
    console.log('============================================================\n');
  }
  return cfg;
}

let config = loadConfig();

function verifyPassword(plain) {
  try {
    const expected = Buffer.from(config.admin.passwordHash, 'hex');
    const actual = crypto.scryptSync(String(plain), config.admin.salt, 64);
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  } catch (err) {
    return false;
  }
}

function setPassword(plain) {
  const salt = crypto.randomBytes(16).toString('hex');
  config.admin.salt = salt;
  config.admin.passwordHash = crypto.scryptSync(String(plain), salt, 64).toString('hex');
  let raw = {};
  try { raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); } catch (err) { /* ignore */ }
  raw.admin = config.admin;
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(raw, null, 2) + '\n', 'utf8');
  } catch (err) {
    console.warn('[config] Could not persist new password:', err.message);
  }
  sessions.clear();
}

/* ------------------------------------------------------------------ *
 * 2. Sessions (in-memory, httpOnly cookie)
 * ------------------------------------------------------------------ */

const sessions = new Map(); // token -> expiry timestamp

function readCookies(req) {
  const out = {};
  const raw = req.headers.cookie || '';
  raw.split(';').forEach((part) => {
    const i = part.indexOf('=');
    if (i > -1) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  });
  return out;
}

function isSecureRequest(req) {
  if (process.env.FORCE_HTTPS === '1') return true;
  const forwarded = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  return forwarded === 'https';
}

function sessionCookie(req, token) {
  const parts = [
    'yc_session=' + token,
    'HttpOnly',
    'SameSite=Lax',
    'Path=/',
    'Max-Age=' + (Number(config.sessionHours || 24) * 3600)
  ];
  if (isSecureRequest(req)) parts.push('Secure');
  return parts.join('; ');
}

function clearCookie(req) {
  const parts = ['yc_session=', 'HttpOnly', 'SameSite=Lax', 'Path=/', 'Max-Age=0'];
  if (isSecureRequest(req)) parts.push('Secure');
  return parts.join('; ');
}

function createSession() {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, Date.now() + Number(config.sessionHours || 24) * 3600 * 1000);
  return token;
}

function isAuthed(req) {
  const token = readCookies(req).yc_session;
  if (!token) return false;
  const expiry = sessions.get(token);
  if (!expiry) return false;
  if (Date.now() > expiry) {
    sessions.delete(token);
    return false;
  }
  return true;
}

/* ------------------------------------------------------------------ *
 * 3. Low level helpers
 * ------------------------------------------------------------------ */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8'
};

function sendJson(res, code, data) {
  const body = Buffer.from(JSON.stringify(data), 'utf8');
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(body);
}

function sendText(res, code, text, type) {
  const body = Buffer.from(text, 'utf8');
  res.writeHead(code, {
    'Content-Type': type || 'text/plain; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-cache'
  });
  res.end(body);
}

function notFound(req, res) {
  const html = '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<title>404 - Page not found</title></head><body style="font-family:system-ui,sans-serif;padding:3rem;color:#142433">' +
    '<h1>404</h1><p>The page you requested does not exist.</p>' +
    '<p><a href="/">Back to homepage</a></p></body></html>';
  res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(req.method === 'HEAD' ? undefined : html);
}

function readJson(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let settled = false;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        if (!settled) { settled = true; reject(new Error('PAYLOAD_TOO_LARGE')); }
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (settled) return;
      settled = true;
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw.trim()) return resolve({});
      try { resolve(JSON.parse(raw)); } catch (err) { reject(new Error('INVALID_JSON')); }
    });
    req.on('error', (err) => { if (!settled) { settled = true; reject(err); } });
  });
}

/** Resolve a URL path under `base`, refusing traversal outside of it. */
function resolveUnder(base, pathname, prefix) {
  let rel;
  try { rel = decodeURIComponent(pathname.slice(prefix.length)); } catch (err) { return null; }
  rel = rel.replace(/^[/\\]+/, '');
  const target = path.resolve(base, rel);
  if (target !== base && !target.startsWith(base + path.sep)) return null;
  return target;
}

function byOrder(a, b) {
  const ao = typeof a.order === 'number' ? a.order : 9999;
  const bo = typeof b.order === 'number' ? b.order : 9999;
  if (ao !== bo) return ao - bo;
  return String(a.name || a.title || '').localeCompare(String(b.name || b.title || ''));
}

function publishedOnly(list) {
  return list.filter((item) => item.published !== false).sort(byOrder);
}

/* ------------------------------------------------------------------ *
 * 4. Lead attribution & notifications
 * ------------------------------------------------------------------ */

/** Classify the traffic source of an inquiry for ROI reporting. */
function inferChannel(src) {
  const ref = String(src.referrer || '').toLowerCase();
  const utm = String(src.utmSource || '').toLowerCase();
  const medium = String(src.utmMedium || '').toLowerCase();
  if (/chatgpt|openai|perplexity|claude|copilot|gemini|you\.com|phind/.test(ref + ' ' + utm)) {
    return 'ai-referral';
  }
  if (src.gclid || /google.*ads|adwords/.test(utm)) return 'google-ads';
  if (src.fbclid || /facebook.*ads|instagram.*ads/.test(utm)) return 'meta-ads';
  if (medium === 'cpc' || medium === 'ppc' || medium === 'paid') return 'paid-search';
  if (/google|bing|yahoo|duckduckgo|baidu|yandex|ecosia/.test(ref + ' ' + utm)) return 'organic-search';
  if (/linkedin|facebook|instagram|youtube|twitter|x\.com|reddit|pinterest/.test(ref + ' ' + utm)) return 'social';
  if (medium === 'email' || /mail|newsletter/.test(utm)) return 'email';
  if (ref) return 'referral';
  return 'direct';
}

function csvCell(value) {
  return '"' + String(value === null || value === undefined ? '' : value)
    .replace(/"/g, '""').replace(/\r?\n/g, ' ') + '"';
}

function inquiriesCsv(db) {
  const rows = [[
    'Date', 'Name', 'Email', 'Company', 'Country', 'Phone', 'Product',
    'Channel', 'UTM Source', 'UTM Medium', 'UTM Campaign', 'GCLID', 'FBCLID',
    'Referrer', 'Landing Page', 'Message', 'Read'
  ].map(csvCell).join(',')];
  (db.inquiries || []).forEach((i) => {
    const s = i.source || {};
    rows.push([
      i.createdAt, i.name, i.email, i.company, i.country, i.phone, i.product,
      i.channel || '', s.utmSource, s.utmMedium, s.utmCampaign, s.gclid, s.fbclid,
      s.referrer, s.landingPage, i.message, i.read ? 'yes' : 'no'
    ].map(csvCell).join(','));
  });
  return '\uFEFF' + rows.join('\r\n') + '\r\n';
}

/**
 * Optional instant lead notification: email (Resend / Postmark) plus
 * Slack-compatible webhooks, WeCom / Feishu / DingTalk, Zapier and Make.
 * Fire-and-forget: never blocks or fails the customer's submission.
 */
function notifyInquiry(settings, item, base) {
  // Email is independent of the webhook setting. Do not put this after the
  // webhook URL check, or a missing webhook would silently suppress email.
  mailer.sendInquiryEmail(config, settings, item, base);

  const url = String((settings || {}).inquiryWebhook || '').trim();
  if (!/^https?:\/\//i.test(url)) return;
  const s = item.source || {};
  const text = [
    'NEW EXPORT INQUIRY - ' + (settings.shortName || 'Yuchuan Air'),
    'Name: ' + item.name + (item.company ? ' (' + item.company + ')' : ''),
    'Email: ' + item.email,
    'Country: ' + (item.country || '-'),
    'Phone / WhatsApp: ' + (item.phone || '-'),
    'Product: ' + (item.product || '-'),
    'Channel: ' + (item.channel || '-') +
      (s.utmSource ? ' | UTM: ' + s.utmSource + '/' + s.utmMedium + '/' + s.utmCampaign : ''),
    'Landing page: ' + (s.landingPage || '-'),
    'Message: ' + String(item.message).slice(0, 600),
    'View all inquiries: ' + base + '/admin',
    'Received: ' + item.createdAt
  ].join('\n');

  const isChineseBot = /qyapi\.weixin\.qq\.com|open\.feishu\.cn|oapi\.dingtalk\.com/i.test(url);
  const payload = Object.assign(
    isChineseBot ? { msgtype: 'text', text: { content: text } } : { text: text },
    {
      type: 'inquiry', id: item.id, name: item.name, email: item.email,
      company: item.company, country: item.country, phone: item.phone,
      product: item.product, message: item.message, channel: item.channel,
      source: item.source, createdAt: item.createdAt
    }
  );
  const data = Buffer.from(JSON.stringify(payload), 'utf8');
  let target;
  try { target = new URL(url); } catch (err) { return; }
  const lib = target.protocol === 'https:' ? https : http;
  const request = lib.request({
    hostname: target.hostname,
    port: target.port || (target.protocol === 'https:' ? 443 : 80),
    path: target.pathname + target.search,
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': data.length },
    timeout: 6000
  }, (response) => { response.resume(); });
  request.on('error', (err) => console.warn('[notify] webhook failed:', err.message));
  request.on('timeout', () => request.destroy());
  request.write(data);
  request.end();
}

/* ------------------------------------------------------------------ *
 * 5. Public API
 * ------------------------------------------------------------------ */

async function handlePublicApi(req, res, parts, method, query) {
  const db = store.getDb();

  if (method !== 'GET' && method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  if (parts[1] === 'site' && method === 'GET') {
    return sendJson(res, 200, {
      settings: db.settings,
      categories: publishedOnly(db.categories),
      applications: publishedOnly(db.applications),
      counts: {
        products: db.products.filter((p) => p.published !== false).length,
        posts: db.posts.filter((p) => p.published !== false).length
      }
    });
  }

  if (parts[1] === 'categories' && method === 'GET') {
    return sendJson(res, 200, { items: publishedOnly(db.categories) });
  }

  if (parts[1] === 'applications' && method === 'GET') {
    return sendJson(res, 200, { items: publishedOnly(db.applications) });
  }

  if (parts[1] === 'products') {
    if (!parts[2] && method === 'GET') {
      let items = db.products.filter((p) => p.published !== false);
      const category = query.get('category');
      const q = String(query.get('q') || '').trim().toLowerCase();
      const featured = query.get('featured');
      if (category) items = items.filter((p) => p.category === category);
      if (featured === '1' || featured === 'true') items = items.filter((p) => p.featured === true);
      if (q) {
        items = items.filter((p) => [
          p.name, p.series, p.category, p.summary, p.description,
          (p.features || []).join(' '), (p.applications || []).join(' ')
        ].join(' ').toLowerCase().includes(q));
      }
      items.sort(byOrder);
      const limit = parseInt(query.get('limit') || '0', 10);
      if (limit > 0) items = items.slice(0, limit);
      return sendJson(res, 200, { items, categories: publishedOnly(db.categories) });
    }
    if (parts[2] && method === 'GET') {
      const slug = safeDecode(parts[2]);
      const item = db.products.find((p) => p.slug === slug && p.published !== false);
      if (!item) return sendJson(res, 404, { error: 'Product not found' });
      const related = db.products
        .filter((p) => p.published !== false && p.category === item.category && p.id !== item.id)
        .sort(byOrder).slice(0, 3);
      return sendJson(res, 200, { item, related });
    }
  }

  if (parts[1] === 'posts') {
    if (!parts[2] && method === 'GET') {
      let items = db.posts.filter((p) => p.published !== false);
      const q = String(query.get('q') || '').trim().toLowerCase();
      if (q) {
        items = items.filter((p) => [p.title, p.excerpt, p.content, p.category]
          .join(' ').toLowerCase().includes(q));
      }
      items.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
      const limit = parseInt(query.get('limit') || '0', 10);
      if (limit > 0) items = items.slice(0, limit);
      return sendJson(res, 200, { items });
    }
    if (parts[2] && method === 'GET') {
      const slug = safeDecode(parts[2]);
      const item = db.posts.find((p) => p.slug === slug && p.published !== false);
      if (!item) return sendJson(res, 404, { error: 'Article not found' });
      const recent = db.posts.filter((p) => p.published !== false && p.id !== item.id)
        .sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))).slice(0, 3);
      return sendJson(res, 200, { item, recent });
    }
  }

  if (parts[1] === 'inquiries' && method === 'POST') {
    const body = await readJson(req, 128 * 1024);
    // Honeypot: bots fill this hidden field, humans never see it. Drop quietly
    // so the bot believes the submission succeeded.
    if (String(body.website || body._gotcha || '').trim()) {
      return sendJson(res, 201, { ok: true });
    }
    const name = String(body.name || '').trim().slice(0, 120);
    const email = String(body.email || '').trim().slice(0, 160);
    const message = String(body.message || '').trim().slice(0, 4000);
    if (!name || !email || !message) {
      return sendJson(res, 400, { error: 'Name, email and message are required.' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return sendJson(res, 400, { error: 'Please enter a valid email address.' });
    }
    const str = (key, max) => String(body[key] || '').trim().slice(0, max || 200);
    const referrer = str('referrer', 500);
    const utmSource = str('utm_source', 120);
    const utmMedium = str('utm_medium', 120);
    const utmCampaign = str('utm_campaign', 160);
    const gclid = str('gclid', 160);
    const fbclid = str('fbclid', 160);
    const channel = inferChannel({
      utmSource, utmMedium, gclid, fbclid, referrer,
      landingPage: str('landing_page', 500)
    });
    const item = {
      id: store.uid('inq'),
      name,
      email,
      company: str('company', 160),
      country: str('country', 100),
      phone: str('phone', 80),
      product: str('product', 160),
      message,
      channel,
      source: {
        utmSource, utmMedium, utmCampaign,
        utmTerm: str('utm_term', 160),
        utmContent: str('utm_content', 160),
        gclid, fbclid, referrer,
        landingPage: str('landing_page', 500),
        pageUrl: str('page_url', 500),
        language: str('language', 40)
      },
      userAgent: String(req.headers['user-agent'] || '').slice(0, 400),
      ip: String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '')
        .split(',')[0].trim().slice(0, 80),
      createdAt: new Date().toISOString(),
      read: false
    };
    db.inquiries.unshift(item);
    if (db.inquiries.length > 5000) db.inquiries.length = 5000;
    store.saveDb();
    notifyInquiry(db.settings, item, seo.siteBaseUrl(req, db));
    return sendJson(res, 201, { ok: true, id: item.id });
  }

  return sendJson(res, 404, { error: 'Unknown API endpoint' });
}

function safeDecode(value) {
  try { return decodeURIComponent(value); } catch (err) { return value; }
}

/* ------------------------------------------------------------------ *
 * 5. Admin API
 * ------------------------------------------------------------------ */

const COLLECTIONS = ['products', 'categories', 'posts', 'applications', 'faqs', 'inquiries'];
const SLUGGED = ['products', 'categories', 'posts', 'applications'];

/** Keep sitemap lastmod / dateModified honest after every CMS edit. */
function touchContent(db, key) {
  if (key === 'inquiries') return;
  const now = new Date().toISOString();
  db.settings.contentUpdatedAt = now;
  return now;
}

async function handleAdminApi(req, res, rest, method) {
  const db = store.getDb();

  // --- login is the only unauthenticated admin endpoint ---
  if (rest[0] === 'login' && method === 'POST') {
    const body = await readJson(req, 64 * 1024);
    const username = String(body.username || '');
    const password = String(body.password || '');
    if (username === config.admin.username && verifyPassword(password)) {
      const token = createSession();
      res.setHeader('Set-Cookie', sessionCookie(req, token));
      return sendJson(res, 200, { ok: true, username: config.admin.username });
    }
    return sendJson(res, 401, { error: 'Invalid username or password.' });
  }

  if (!isAuthed(req)) return sendJson(res, 401, { error: 'Unauthorized. Please sign in again.' });

  if (rest[0] === 'logout' && method === 'POST') {
    const token = readCookies(req).yc_session;
    if (token) sessions.delete(token);
    res.setHeader('Set-Cookie', clearCookie(req));
    return sendJson(res, 200, { ok: true });
  }

  if (rest[0] === 'me' && method === 'GET') {
    return sendJson(res, 200, { ok: true, username: config.admin.username });
  }

  if (rest[0] === 'data' && method === 'GET') {
    return sendJson(res, 200, db);
  }

  // Safe health check for the inquiry email channel. Never returns the API key.
  if (rest[0] === 'email-status' && method === 'GET') {
    return sendJson(res, 200, mailer.status(config, db.settings));
  }

  if (rest[0] === 'inquiries.csv' && method === 'GET') {
    const body = Buffer.from(inquiriesCsv(db), 'utf8');
    const filename = 'yuchuan-inquiries-' + new Date().toISOString().slice(0, 10) + '.csv';
    res.writeHead(200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="' + filename + '"',
      'Content-Length': body.length,
      'Cache-Control': 'no-store'
    });
    return res.end(body);
  }

  if (rest[0] === 'settings' && method === 'PUT') {
    const body = await readJson(req, 512 * 1024);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return sendJson(res, 400, { error: 'Invalid settings payload.' });
    }
    db.settings = Object.assign({}, db.settings, body);
    db.settings.contentUpdatedAt = new Date().toISOString();
    store.saveDb();
    return sendJson(res, 200, { ok: true, settings: db.settings });
  }

  if (rest[0] === 'upload' && method === 'POST') {
    const body = await readJson(req, MAX_UPLOAD_BYTES() + 1024 * 1024);
    const match = /^data:image\/(png|jpeg|jpg|webp|gif);base64,([A-Za-z0-9+/=]+)$/i
      .exec(String(body.dataUrl || '').trim());
    if (!match) return sendJson(res, 400, { error: 'Only PNG, JPG, WEBP or GIF image data is accepted.' });
    const extMap = { png: 'png', jpeg: 'jpg', jpg: 'jpg', webp: 'webp', gif: 'gif' };
    const buffer = Buffer.from(match[2], 'base64');
    if (buffer.length > MAX_UPLOAD_BYTES()) {
      return sendJson(res, 413, { error: 'Image is larger than ' + config.maxUploadMB + ' MB.' });
    }
    if (!buffer.length) return sendJson(res, 400, { error: 'Empty image data.' });
    const filename = 'img-' + Date.now().toString(36) + '-' +
      crypto.randomBytes(4).toString('hex') + '.' + extMap[match[1].toLowerCase()];
    try {
      fs.mkdirSync(UPLOAD_DIR, { recursive: true });
      fs.writeFileSync(path.join(UPLOAD_DIR, filename), buffer);
    } catch (err) {
      console.warn('[upload] Could not save image:', err.message);
      return sendJson(res, 507, {
        error: 'Image storage is not writable. Check permissions on data/uploads/ on the server.'
      });
    }
    return sendJson(res, 201, { ok: true, url: '/uploads/' + filename });
  }

  if (rest[0] === 'export' && method === 'GET') {
    const body = Buffer.from(JSON.stringify(db, null, 2), 'utf8');
    const filename = 'yuchuan-air-backup-' + new Date().toISOString().slice(0, 10) + '.json';
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': 'attachment; filename="' + filename + '"',
      'Content-Length': body.length,
      'Cache-Control': 'no-store'
    });
    return res.end(body);
  }

  if (rest[0] === 'import' && method === 'POST') {
    const body = await readJson(req, 24 * 1024 * 1024);
    const incoming = body && body.db ? body.db : body;
    if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming) ||
        !incoming.settings || typeof incoming.settings !== 'object' || Array.isArray(incoming.settings) ||
        !Array.isArray(incoming.products) || !Array.isArray(incoming.categories) ||
        !Array.isArray(incoming.posts) || !Array.isArray(incoming.applications)) {
      return sendJson(res, 400, { error: 'Backup file is not a valid Yuchuan Air data file.' });
    }
    store.replaceDb(incoming);
    return sendJson(res, 200, { ok: true });
  }

  if (rest[0] === 'password' && method === 'POST') {
    const body = await readJson(req, 64 * 1024);
    if (!verifyPassword(String(body.currentPassword || ''))) {
      return sendJson(res, 401, { error: 'Current password is incorrect.' });
    }
    const next = String(body.newPassword || '');
    if (next.length < 8) {
      return sendJson(res, 400, { error: 'New password must be at least 8 characters.' });
    }
    setPassword(next);
    res.setHeader('Set-Cookie', clearCookie(req));
    return sendJson(res, 200, { ok: true });
  }

  // --- generic CRUD for content collections ---
  if (COLLECTIONS.indexOf(rest[0]) !== -1) {
    const key = rest[0];
    const list = db[key];
    const id = rest[1] ? safeDecode(rest[1]) : null;

    if (!id) {
      if (method === 'GET') return sendJson(res, 200, { items: list });
      if (method === 'POST') {
        const body = await readJson(req, 2 * 1024 * 1024);
        if (!body || typeof body !== 'object' || Array.isArray(body)) {
          return sendJson(res, 400, { error: 'Invalid payload.' });
        }
        const item = Object.assign({}, body);
        item.id = store.uid(key.slice(0, -1));
        if (SLUGGED.indexOf(key) !== -1) {
          item.slug = store.uniqueSlug(list, item.slug || item.name || item.title || item.id, null);
        }
        if (key === 'posts' && !item.date) item.date = new Date().toISOString().slice(0, 10);
        if (key === 'inquiries') item.createdAt = item.createdAt || new Date().toISOString();
        if (key !== 'inquiries' && typeof item.order !== 'number') item.order = list.length + 1;
        if (key !== 'inquiries' && item.published === undefined) item.published = true;
        const createdAt = touchContent(db, key);
        if (createdAt) item.dateModified = createdAt;
        list.push(item);
        store.saveDb();
        return sendJson(res, 201, { ok: true, item });
      }
      return sendJson(res, 405, { error: 'Method not allowed' });
    }

    const index = list.findIndex((entry) => String(entry.id) === id);
    if (index === -1) return sendJson(res, 404, { error: 'Item not found.' });

    if (method === 'GET') return sendJson(res, 200, { item: list[index] });

    if (method === 'PUT') {
      const body = await readJson(req, 2 * 1024 * 1024);
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return sendJson(res, 400, { error: 'Invalid payload.' });
      }
      const merged = Object.assign({}, list[index], body, { id: list[index].id });
      if (SLUGGED.indexOf(key) !== -1 && merged.slug) {
        merged.slug = store.uniqueSlug(list, merged.slug, list[index].id);
      }
      const updatedAt = touchContent(db, key);
      if (updatedAt) merged.dateModified = updatedAt;
      list[index] = merged;
      store.saveDb();
      return sendJson(res, 200, { ok: true, item: merged });
    }

    if (method === 'DELETE') {
      if (key === 'categories') {
        const used = db.products.filter((p) => p.category === list[index].slug).length;
        if (used > 0) {
          return sendJson(res, 400, {
            error: 'This category still contains ' + used + ' product(s). Move them to another category first.'
          });
        }
      }
      const removed = list.splice(index, 1)[0];
      touchContent(db, key);
      store.saveDb();
      return sendJson(res, 200, { ok: true, item: removed });
    }
  }

  return sendJson(res, 404, { error: 'Unknown admin endpoint' });
}

/* ------------------------------------------------------------------ *
 * 6. Static pages, assets, SEO files
 * ------------------------------------------------------------------ */

const PAGE_MAP = {
  '/': 'index.html',
  '/products': 'products.html',
  '/applications': 'applications.html',
  '/about': 'about.html',
  '/blog': 'blog.html',
  '/contact': 'contact.html',
  '/privacy': 'privacy.html'
};

const ADMIN_PAGES = {
  '/admin': true,
  '/admin/': true,
  '/admin/index.html': true
};

// HTML templates are cached in memory because they never change at runtime.
const templateCache = new Map();
function readTemplate(filePath) {
  let cached = templateCache.get(filePath);
  if (cached === undefined) {
    cached = fs.readFileSync(filePath, 'utf8');
    templateCache.set(filePath, cached);
  }
  return cached;
}

function handleSeoFiles(req, res, pathname) {
  const db = store.getDb();
  const base = seo.siteBaseUrl(req, db);
  if (pathname === '/robots.txt') {
    sendText(res, 200, seo.robotsTxt(db, base), 'text/plain; charset=utf-8');
    return true;
  }
  if (pathname === '/sitemap.xml') {
    sendText(res, 200, seo.sitemapXml(db, base), 'application/xml; charset=utf-8');
    return true;
  }
  if (pathname === '/llms.txt') {
    sendText(res, 200, seo.llmsTxt(db, base), 'text/markdown; charset=utf-8');
    return true;
  }
  if (pathname === '/llms-full.txt') {
    sendText(res, 200, seo.llmsFullTxt(db, base), 'text/plain; charset=utf-8');
    return true;
  }
  return false;
}

/**
 * ETag + Brotli/gzip delivery. HTML is validated on every request (no-cache)
 * so a 304 is returned instantly when CMS content has not changed.
 */
function sendWithCompression(req, res, code, buffer, contentType, cacheControl) {
  const headers = {
    'Content-Type': contentType,
    'Cache-Control': cacheControl,
    'Vary': 'Accept-Encoding',
    'X-Content-Type-Options': 'nosniff'
  };
  const etag = '"' + crypto.createHash('sha1').update(buffer).digest('hex').slice(0, 20) + '"';
  headers.ETag = etag;
  if (String(req.headers['if-none-match'] || '').split(',').map((x) => x.trim()).indexOf(etag) > -1) {
    res.writeHead(304, headers);
    return res.end();
  }

  let out = buffer;
  const compressible = /^(text\/|application\/(javascript|json|xml)|image\/svg\+xml)/i.test(contentType);
  const accept = String(req.headers['accept-encoding'] || '');
  if (compressible && buffer.length > 1024) {
    if (/\bbr\b/i.test(accept) && typeof zlib.brotliCompressSync === 'function') {
      out = zlib.brotliCompressSync(buffer);
      headers['Content-Encoding'] = 'br';
    } else if (/\bgzip\b/i.test(accept)) {
      out = zlib.gzipSync(buffer, { level: 6 });
      headers['Content-Encoding'] = 'gzip';
    }
  }
  headers['Content-Length'] = out.length;
  res.writeHead(code, headers);
  return res.end(req.method === 'HEAD' ? undefined : out);
}

function redirect(res, target) {
  res.writeHead(301, {
    'Location': target,
    'Cache-Control': 'public, max-age=86400',
    'Content-Type': 'text/plain; charset=utf-8'
  });
  res.end('Moved permanently to ' + target);
}

function serveStatic(req, res, pathname, query) {
  if (handleSeoFiles(req, res, pathname)) return;

  // Legacy query-string article URLs and .html suffixes are redirected to the
  // canonical clean URL so link equity is not split across duplicates.
  if (pathname === '/post' || pathname === '/post.html') {
    const slug = query.get('slug');
    return redirect(res, slug ? '/blog/' + encodeURIComponent(slug) : '/blog');
  }
  if (/\.html$/i.test(pathname) && !pathname.startsWith('/admin')) {
    const clean = pathname.replace(/\.html$/, '');
    return redirect(res, clean === '/index' ? '/' : (clean || '/'));
  }

  const db = store.getDb();
  const base = seo.siteBaseUrl(req, db);

  if (ADMIN_PAGES[pathname]) {
    const html = seo.renderAdminHtml(readTemplate(path.join(ADMIN_DIR, 'index.html')));
    return sendWithCompression(req, res, 200, Buffer.from(html, 'utf8'),
      'text/html; charset=utf-8', 'no-store');
  }

  const ctx = seo.resolveContext(db, pathname, query);
  let filePath = null;
  let cacheSeconds = 0;

  const page = PAGE_MAP[pathname];
  if (page) {
    filePath = path.join(PUBLIC_DIR, page);
  } else if (/^\/collections\/[^/]+\/?$/.test(pathname)) {
    if (!ctx) return notFound(req, res);
    filePath = path.join(PUBLIC_DIR, 'products.html');
  } else if (/^\/products\/[^/]+\/?$/.test(pathname)) {
    if (!ctx) return notFound(req, res);
    filePath = path.join(PUBLIC_DIR, 'product.html');
  } else if (/^\/blog\/[^/]+\/?$/.test(pathname)) {
    if (!ctx) return notFound(req, res);
    filePath = path.join(PUBLIC_DIR, 'post.html');
  } else if (/^\/(css|js|img)\//.test(pathname)) {
    filePath = resolveUnder(PUBLIC_DIR, pathname, '/');
    cacheSeconds = 3600;
  } else if (/^\/admin\/(css|js|img)\//.test(pathname)) {
    filePath = resolveUnder(ADMIN_DIR, pathname, '/admin/');
  } else if (pathname.startsWith('/uploads/')) {
    filePath = resolveUnder(UPLOAD_DIR, pathname, '/uploads/');
    cacheSeconds = 604800;
  } else {
    const candidate = resolveUnder(PUBLIC_DIR, pathname.replace(/\/+$/, '') + '.html', '/');
    if (candidate && fs.existsSync(candidate) && fs.statSync(candidate).isFile()) filePath = candidate;
  }

  if (!filePath) return notFound(req, res);

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) return notFound(req, res);
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME[ext] || 'application/octet-stream';

    if (ext === '.html') {
      let raw = readTemplate(filePath);
      if (ctx) raw = seo.renderPage(raw, db, ctx, base).html;
      else if (filePath.startsWith(ADMIN_DIR)) raw = seo.renderAdminHtml(raw);
      return sendWithCompression(req, res, 200, Buffer.from(raw, 'utf8'),
        'text/html; charset=utf-8', 'no-cache');
    }

    fs.readFile(filePath, (readErr, buffer) => {
      if (readErr) return notFound(req, res);
      const cache = cacheSeconds > 0
        ? 'public, max-age=' + cacheSeconds + ', must-revalidate'
        : 'no-cache';
      return sendWithCompression(req, res, 200, buffer, contentType, cache);
    });
  });
}

/* ------------------------------------------------------------------ *
 * 7. Request dispatcher & bootstrap
 * ------------------------------------------------------------------ */

async function dispatch(req, res) {
  let parsed;
  try {
    parsed = new URL(req.url, 'http://localhost');
  } catch (err) {
    return sendJson(res, 400, { error: 'Bad request' });
  }

  const method = req.method || 'GET';
  const pathname = parsed.pathname;

  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  // HSTS only over a real TLS request (or behind Cloudflare with FORCE_HTTPS=1).
  // Do NOT also enable Cloudflare's HSTS toggle, or the header is duplicated.
  if (isSecureRequest(req)) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  if (pathname.startsWith('/api/')) {
    const parts = pathname.split('/').filter(Boolean); // ['api', 'products', ...]
    if (parts[1] === 'admin') {
      return await handleAdminApi(req, res, parts.slice(2), method);
    }
    return await handlePublicApi(req, res, parts, method, parsed.searchParams);
  }

  if (method !== 'GET' && method !== 'HEAD') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }
  return serveStatic(req, res, pathname, parsed.searchParams);
}

const server = http.createServer((req, res) => {
  dispatch(req, res).catch((err) => {
    const message = err && err.message ? err.message : String(err);
    console.error('[error]', message);
    if (res.headersSent) return res.end();
    if (message === 'PAYLOAD_TOO_LARGE') return sendJson(res, 413, { error: 'Payload too large.' });
    if (message === 'INVALID_JSON') return sendJson(res, 400, { error: 'Invalid JSON body.' });
    return sendJson(res, 500, { error: 'Internal server error.' });
  });
});

server.listen(config.port, config.host, () => {
  console.log('------------------------------------------------------------');
  console.log('  Yuchuan Air website is running');
  console.log('  Local   : http://localhost:' + config.port);
  console.log('  Admin   : http://localhost:' + config.port + '/admin');
  console.log('  Data    : ' + store.dbPath());
  console.log('  Node    : ' + process.version);
  console.log('------------------------------------------------------------');
});

function shutdown() {
  console.log('\n[server] Shutting down gracefully...');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
