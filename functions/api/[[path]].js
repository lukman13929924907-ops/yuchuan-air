/**
 * Cloudflare Pages Function - same-origin API for the pre-rendered site.
 *
 * Why this exists
 * ---------------
 * The public site is static HTML in dist/ (built by scripts/build-static.js).
 * This Function implements the exact same /api/* contract as server.js, so
 * public/js/main.js and admin/js/admin.js keep working unchanged.
 *
 * Data flow
 * ---------
 *   READ (public)  -> /_data/site.json static asset produced by the build
 *                     (falls back to the bundled SNAPSHOT), zero GitHub calls
 *   READ (admin)   -> latest data/db.json from GitHub
 *   WRITE (admin)  -> PUT data/db.json to GitHub; the commit triggers a
 *                     Cloudflare Pages rebuild, publishing new static HTML
 *   INQUIRIES      -> Cloudflare KV (buyer PII never enters the git repo)
 *   IMAGE UPLOADS  -> PUT data/uploads/<file> to GitHub (<= 900 KB)
 *   NOTIFICATION   -> Resend HTTP API (2A: sender onboarding@resend.dev,
 *                     recipient = the Resend signup mailbox)
 *
 * Runtime is a Worker: only Web APIs (fetch, crypto.subtle, TextEncoder,
 * atob/btoa, Request/Response). No fs, no require, no Buffer.
 *
 * Required secrets in Cloudflare Pages > Settings > Environment variables:
 *   ADMIN_PASSWORD, SESSION_SECRET, GITHUB_TOKEN, RESEND_API_KEY (as
 *   EMAIL_API_KEY), EMAIL_FROM, EMAIL_TO
 * Optional: GITHUB_REPO, GITHUB_BRANCH, ADMIN_USERNAME, INQUIRY_WEBHOOK
 * KV namespace binding: INQUIRIES
 */
import SNAPSHOT from './_snapshot.js';

const COLLECTIONS = ['products', 'categories', 'posts', 'applications', 'faqs', 'inquiries'];
const SLUGGED = ['products', 'categories', 'posts', 'applications'];
const MAX_UPLOAD_BYTES = 900 * 1024; // GitHub Contents API base64 limit
const SESSION_MS = 12 * 60 * 60 * 1000;

/* ------------------------------------------------------------------ *
 * Small helpers
 * ------------------------------------------------------------------ */

function json(data, status, headers) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: Object.assign({
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    }, headers || {})
  });
}

function fail(message, status) { return json({ error: message }, status || 400); }

function text(body, status, contentType, headers) {
  return new Response(body, {
    status: status || 200,
    headers: Object.assign({
      'Content-Type': contentType || 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    }, headers || {})
  });
}

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function str(value, max) { return String(value === undefined || value === null ? '' : value).trim().slice(0, max || 200); }
function isPublished(item) { return item && item.published !== false; }
function byOrder(a, b) {
  const ao = Number(a.order || 0), bo = Number(b.order || 0);
  return ao === bo ? String(a.id || '').localeCompare(String(b.id || '')) : ao - bo;
}
function safeDecode(value) { try { return decodeURIComponent(value); } catch (err) { return value; } }

function uid(prefix) {
  return prefix + '-' + Date.now().toString(36) + '-' +
    String(crypto.randomUUID ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10));
}

function slugify(value) {
  return String(value || '').toLowerCase().trim()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '').slice(0, 80) || 'item';
}

function uniqueSlug(list, value, exceptId) {
  const base = slugify(value);
  let slug = base, n = 2;
  const items = Array.isArray(list) ? list : [];
  while (items.some((item) => item.slug === slug && item.id !== exceptId)) {
    slug = base + '-' + n;
    n += 1;
  }
  return slug;
}

function touchContent(db, key) {
  if (key === 'inquiries') return '';
  const stamp = new Date().toISOString();
  db.settings = db.settings || {};
  db.settings.contentUpdatedAt = stamp;
  return stamp;
}

function inferChannel(src) {
  const ref = String(src.referrer || '').toLowerCase();
  const utm = String(src.utmSource || '').toLowerCase();
  const medium = String(src.utmMedium || '').toLowerCase();
  if (/chatgpt|openai|perplexity|claude|copilot|gemini|you\.com|phind/.test(ref + ' ' + utm)) return 'ai-referral';
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

function inquiriesCsv(list) {
  const rows = [[
    'Date', 'Name', 'Email', 'Company', 'Country', 'Phone', 'Product',
    'Channel', 'UTM Source', 'UTM Medium', 'UTM Campaign', 'GCLID', 'FBCLID',
    'Referrer', 'Landing Page', 'Message', 'Read'
  ].map(csvCell).join(',')];
  (list || []).forEach(function (i) {
    const s = i.source || {};
    rows.push([
      i.createdAt, i.name, i.email, i.company, i.country, i.phone, i.product,
      i.channel || '', s.utmSource, s.utmMedium, s.utmCampaign, s.gclid, s.fbclid,
      s.referrer, s.landingPage, i.message, i.read ? 'yes' : 'no'
    ].map(csvCell).join(','));
  });
  return '\uFEFF' + rows.join('\r\n') + '\r\n';
}

/* ------------------------------------------------------------------ *
 * Configuration
 * ------------------------------------------------------------------ */

function config(env) {
  const e = env || {};
  const S = (v) => String(v === undefined || v === null ? '' : v);
  return {
    repo: S(e.GITHUB_REPO) || 'lukman13929924907-ops/yuchuan-air',
    branch: S(e.GITHUB_BRANCH) || 'master',
    token: S(e.GITHUB_TOKEN),
    adminUser: S(e.ADMIN_USERNAME) || 'admin',
    adminPass: S(e.ADMIN_PASSWORD),
    sessionSecret: S(e.SESSION_SECRET),
    emailKey: S(e.EMAIL_API_KEY),
    emailFrom: S(e.EMAIL_FROM),
    emailTo: S(e.EMAIL_TO),
    webhook: S(e.INQUIRY_WEBHOOK),
    kv: e.INQUIRIES || null
  };
}

/* ------------------------------------------------------------------ *
 * Content snapshot
 *
 * scripts/build-static.js writes the same sanitised content twice:
 *   dist/_data/site.json              (static asset, always fresh)
 *   functions/api/_snapshot.js        (bundled fallback)
 *
 * Cloudflare does not document whether it compiles functions/ before or
 * after the build command. Reading the static asset at runtime removes that
 * ordering dependency entirely: public /api/* data always matches the HTML
 * that was just built. env.ASSETS is a default Pages Functions binding.
 * ------------------------------------------------------------------ */

async function loadSnapshot(context) {
  const assets = context.env && context.env.ASSETS;
  if (!assets || typeof assets.fetch !== 'function') return SNAPSHOT;
  try {
    const res = await assets.fetch(new URL('/_data/site.json', context.request.url));
    if (!res.ok) return SNAPSHOT;
    const data = await res.json();
    if (data && Array.isArray(data.products) && Array.isArray(data.categories)) return data;
  } catch (err) { /* the bundled snapshot is a valid offline fallback */ }
  return SNAPSHOT;
}

/* ------------------------------------------------------------------ *
 * GitHub content store
 * ------------------------------------------------------------------ */

function gh(c, endpoint, init) {
  const headers = Object.assign({
    'Authorization': 'Bearer ' + c.token,
    'Accept': 'application/vnd.github+json',
    'User-Agent': 'yuchuan-air-pages',
    'X-GitHub-Api-Version': '2022-11-28'
  }, (init && init.headers) || {});
  return fetch('https://api.github.com/repos/' + c.repo + endpoint,
    Object.assign({}, init, { headers: headers }));
}

function base64FromUtf8(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function utf8FromBase64(value) {
  const binary = atob(String(value || '').replace(/\s/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

async function ghGetFile(c, filePath) {
  const res = await gh(c, '/contents/' + filePath + '?ref=' + encodeURIComponent(c.branch), { method: 'GET' });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('GitHub read failed (' + res.status + ')');
  const data = await res.json();
  return { sha: data.sha, text: utf8FromBase64(data.content) };
}

async function ghPutFile(c, filePath, base64, message, sha) {
  const body = { message: message, content: base64, branch: c.branch };
  if (sha) body.sha = sha;
  const res = await gh(c, '/contents/' + filePath, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (res.status === 409 || res.status === 422) return { ok: false, conflict: true };
  if (!res.ok) return { ok: false, error: 'GitHub write failed (' + res.status + ')' };
  return { ok: true };
}

/** Read the freshest content + current blob sha, so writes never lose data. */
async function latestDb(c, snap) {
  let file;
  try { file = await ghGetFile(c, 'data/db.json'); }
  catch (err) { return null; }
  let db;
  try { db = file ? JSON.parse(file.text) : clone(snap); }
  catch (err) { return null; }
  db.inquiries = await readInquiries(c);
  return { db: db, sha: file ? file.sha : null };
}

async function commitContent(c, db, message, sha) {
  const copy = clone(db);
  copy.inquiries = []; // buyer PII stays in KV, never in the repository
  const payload = base64FromUtf8(JSON.stringify(copy, null, 2) + '\n');
  let result = await ghPutFile(c, 'data/db.json', payload, message, sha);
  if (result.conflict) {
    try {
      const fresh = await ghGetFile(c, 'data/db.json');
      if (fresh) result = await ghPutFile(c, 'data/db.json', payload, message, fresh.sha);
    } catch (err) { /* fall through with the conflict error */ }
  }
  return result;
}

function writeError(result) {
  if (result && result.ok) return null;
  return fail('Could not save to GitHub. Check GITHUB_TOKEN permissions ' +
    '(Contents: read & write on this repository) and GITHUB_BRANCH.', 502);
}

/* ------------------------------------------------------------------ *
 * KV inquiry store
 * ------------------------------------------------------------------ */

async function readInquiries(c) {
  if (!c.kv || typeof c.kv.get !== 'function') return [];
  try {
    const raw = await c.kv.get('list');
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) { return []; }
}

async function writeInquiries(c, list) {
  if (!c.kv || typeof c.kv.put !== 'function') return false;
  try { await c.kv.put('list', JSON.stringify(list.slice(0, 5000))); return true; }
  catch (err) { return false; }
}

/* ------------------------------------------------------------------ *
 * Stateless admin session (HMAC-signed cookie)
 * ------------------------------------------------------------------ */

async function hmacHex(secret, payload) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload)));
  return Array.from(sig, function (b) { return b.toString(16).padStart(2, '0'); }).join('').slice(0, 40);
}

function constantTimeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

function cookieMap(req) {
  const out = {};
  String(req.headers.get('cookie') || '').split(';').forEach(function (part) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  });
  return out;
}

async function isAuthed(req, c) {
  if (!c.sessionSecret) return false;
  const token = cookieMap(req).yc_session || '';
  const dot = token.lastIndexOf('.');
  if (dot < 1) return false;
  const payload = token.slice(0, dot);
  const expiry = Number(payload);
  if (!Number.isFinite(expiry) || expiry <= Date.now()) return false;
  return constantTimeEqual(token.slice(dot + 1), await hmacHex(c.sessionSecret, payload));
}

async function loginCookie(c) {
  const payload = String(Date.now() + SESSION_MS);
  return 'yc_session=' + payload + '.' + (await hmacHex(c.sessionSecret, payload)) +
    '; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=' + Math.floor(SESSION_MS / 1000);
}

const LOGOUT_COOKIE = 'yc_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0';

/* ------------------------------------------------------------------ *
 * Inquiry notification (Resend + optional webhook)
 * ------------------------------------------------------------------ */

function escapeHtml(value) {
  return String(value === null || value === undefined ? '' : value).replace(/[&<>"']/g, function (ch) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
  });
}

async function sendInquiryMail(c, item, settings) {
  if (!(c.emailKey && c.emailFrom && c.emailTo)) return { sent: false, reason: 'not configured' };
  const s = item.source || {};
  const short = (settings && settings.shortName) || 'Yuchuan Air';
  const lines = [
    'NEW EXPORT INQUIRY - ' + short,
    '',
    'Name: ' + item.name + (item.company ? ' (' + item.company + ')' : ''),
    'Email: ' + item.email,
    'Company: ' + (item.company || '-'),
    'Country: ' + (item.country || '-'),
    'Phone / WhatsApp: ' + (item.phone || '-'),
    'Product: ' + (item.product || '-'),
    'Channel: ' + (item.channel || '-'),
    'UTM: ' + ([s.utmSource, s.utmMedium, s.utmCampaign].filter(Boolean).join(' / ') || '-'),
    'GCLID: ' + (s.gclid || '-') + '   FBCLID: ' + (s.fbclid || '-'),
    'Referrer: ' + (s.referrer || '-'),
    'Landing page: ' + (s.landingPage || '-'),
    'Page URL: ' + (s.pageUrl || '-'),
    'Language: ' + (s.language || '-'),
    '',
    'Message:',
    item.message,
    '',
    'Received: ' + item.createdAt,
    'Inquiry ID: ' + item.id
  ];
  const subject = '[Yuchuan Air] New inquiry: ' + (item.product || 'General') +
    ' - ' + (item.company || item.name);
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + c.emailKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: c.emailFrom,
        to: [c.emailTo],
        subject: subject,
        text: lines.join('\n'),
        html: '<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6">' +
          '<h2>New export inquiry</h2><pre style="white-space:pre-wrap">' +
          escapeHtml(lines.join('\n')) + '</pre></div>',
        reply_to: item.email
      })
    });
    return { sent: res.ok, status: res.status };
  } catch (err) {
    return { sent: false, reason: String(err && err.message || err) };
  }
}

async function notifyWebhook(c, item) {
  const url = String(c.webhook || '').trim();
  if (!/^https?:\/\//i.test(url)) return;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'inquiry', inquiry: item, text: item.message })
    });
  } catch (err) { /* notification must never fail the submission */ }
}

/* ------------------------------------------------------------------ *
 * Request body
 * ------------------------------------------------------------------ */

async function readJson(req, maxChars) {
  const raw = await req.text();
  if (raw.length > (maxChars || 2 * 1024 * 1024)) return null;
  try { return JSON.parse(raw); } catch (err) { return null; }
}

/* ------------------------------------------------------------------ *
 * Public API (identical contract to server.js)
 * ------------------------------------------------------------------ */

function publicSettings(snap) {
  const s = Object.assign({}, (snap.settings || {}));
  delete s.inquiryWebhook;
  return s;
}

async function publicApi(req, rest, method, query, c, snap) {
  if (method !== 'GET' && method !== 'POST') return fail('Method not allowed', 405);
  const s = publicSettings(snap);
  const products = (snap.products || []).filter(isPublished);
  const posts = (snap.posts || []).filter(isPublished);
  const categories = (snap.categories || []).filter(isPublished).sort(byOrder);
  const applications = (snap.applications || []).filter(isPublished).sort(byOrder);
  const key = rest[0] || '';

  if (key === 'site' && method === 'GET') {
    return json({
      settings: s,
      categories: categories,
      applications: applications,
      counts: { products: products.length, posts: posts.length }
    });
  }
  if (key === 'categories' && method === 'GET') return json({ items: categories });
  if (key === 'applications' && method === 'GET') return json({ items: applications });

  if (key === 'products') {
    if (!rest[1] && method === 'GET') {
      let items = products.slice();
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
      return json({ items: items, categories: categories });
    }
    if (rest[1] && method === 'GET') {
      const slug = safeDecode(rest[1]);
      const item = products.find((p) => p.slug === slug);
      if (!item) return fail('Product not found', 404);
      const related = products.filter((p) => p.category === item.category && p.id !== item.id)
        .sort(byOrder).slice(0, 3);
      return json({ item: item, related: related });
    }
  }

  if (key === 'posts') {
    if (!rest[1] && method === 'GET') {
      let items = posts.slice();
      const q = String(query.get('q') || '').trim().toLowerCase();
      if (q) items = items.filter((p) => [p.title, p.excerpt, p.content, p.category]
        .join(' ').toLowerCase().includes(q));
      items.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
      const limit = parseInt(query.get('limit') || '0', 10);
      if (limit > 0) items = items.slice(0, limit);
      return json({ items: items });
    }
    if (rest[1] && method === 'GET') {
      const slug = safeDecode(rest[1]);
      const item = posts.find((p) => p.slug === slug);
      if (!item) return fail('Article not found', 404);
      const recent = posts.filter((p) => p.id !== item.id)
        .sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))).slice(0, 3);
      return json({ item: item, recent: recent });
    }
  }

  if (key === 'inquiries' && method === 'POST') {
    const body = await readJson(req, 128 * 1024);
    if (!body) return fail('Invalid request body.');
    if (String(body.website || body._gotcha || '').trim()) return json({ ok: true }, 201);

    const name = str(body.name, 120);
    const email = str(body.email, 160);
    const message = str(body.message, 4000);
    if (!name || !email || !message) return fail('Name, email and message are required.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail('Please enter a valid email address.');

    const source = {
      utmSource: str(body.utm_source, 120),
      utmMedium: str(body.utm_medium, 120),
      utmCampaign: str(body.utm_campaign, 160),
      utmTerm: str(body.utm_term, 160),
      utmContent: str(body.utm_content, 160),
      gclid: str(body.gclid, 160),
      fbclid: str(body.fbclid, 160),
      referrer: str(body.referrer, 500),
      landingPage: str(body.landing_page, 500),
      pageUrl: str(body.page_url, 500),
      language: str(body.language, 40)
    };
    const item = {
      id: uid('inq'),
      name: name,
      email: email,
      company: str(body.company, 160),
      country: str(body.country, 100),
      phone: str(body.phone, 80),
      product: str(body.product, 160),
      message: message,
      channel: inferChannel(source),
      source: source,
      userAgent: str(req.headers.get('user-agent'), 400),
      ip: str(String(req.headers.get('cf-connecting-ip') ||
        String(req.headers.get('x-forwarded-for') || '').split(',')[0]), 80),
      createdAt: new Date().toISOString(),
      read: false
    };

    const list = await readInquiries(c);
    list.unshift(item);
    await writeInquiries(c, list);
    // Notifications are best-effort: a mail outage must never lose a lead,
    // because the lead is already persisted in KV and visible in /admin.
    await sendInquiryMail(c, item, s);
    await notifyWebhook(c, item);
    return json({ ok: true, id: item.id }, 201);
  }

  return fail('Unknown API endpoint', 404);
}

/* ------------------------------------------------------------------ *
 * Admin API (identical contract to server.js)
 * ------------------------------------------------------------------ */

async function adminApi(req, rest, method, c, snap) {
  const key = rest[0] || '';

  if (key === 'login' && method === 'POST') {
    if (!c.adminPass || !c.sessionSecret) {
      return fail('后台尚未配置：请在 Cloudflare Pages 环境变量中设置 ADMIN_PASSWORD 与 SESSION_SECRET。', 503);
    }
    const body = await readJson(req, 64 * 1024);
    if (!body || str(body.username) !== c.adminUser || str(body.password) !== c.adminPass) {
      return fail('Invalid username or password.', 401);
    }
    return json({ ok: true, username: c.adminUser }, 200, { 'Set-Cookie': await loginCookie(c) });
  }

  if (!(await isAuthed(req, c))) return fail('Unauthorized. Please sign in again.', 401);

  if (key === 'logout' && method === 'POST') {
    return json({ ok: true }, 200, { 'Set-Cookie': LOGOUT_COOKIE });
  }
  if (key === 'me' && method === 'GET') return json({ ok: true, username: c.adminUser });
  if (key === 'email-status' && method === 'GET') {
    return json({
      enabled: Boolean(c.emailKey && c.emailFrom && c.emailTo),
      provider: c.emailKey && c.emailFrom && c.emailTo ? 'resend' : '',
      to: c.emailTo || ''
    });
  }
  if (key === 'password' && method === 'POST') {
    return fail('静态版密码保存在 Cloudflare Pages 环境变量 ADMIN_PASSWORD 中，请到 Cloudflare 后台修改并重新部署。');
  }

  if (!c.token) {
    return fail('后台写入尚未配置：请在 Cloudflare Pages 环境变量中设置 GITHUB_TOKEN（对此仓库有 Contents 读写权限）。', 503);
  }

  const state = await latestDb(c, snap);
  if (!state) return fail('无法从 GitHub 读取 data/db.json，请检查 GITHUB_TOKEN / GITHUB_REPO / GITHUB_BRANCH。', 502);
  const db = state.db;

  if (key === 'data' && method === 'GET') return json(db);

  if (key === 'inquiries.csv' && method === 'GET') {
    return text(inquiriesCsv(db.inquiries), 200, 'text/csv; charset=utf-8', {
      'Content-Disposition': 'attachment; filename="yuchuan-inquiries-' +
        new Date().toISOString().slice(0, 10) + '.csv"'
    });
  }

  if (key === 'export' && method === 'GET') {
    return text(JSON.stringify(db, null, 2), 200, 'application/json; charset=utf-8', {
      'Content-Disposition': 'attachment; filename="yuchuan-air-backup-' +
        new Date().toISOString().slice(0, 10) + '.json"'
    });
  }

  if (key === 'settings' && method === 'PUT') {
    const body = await readJson(req, 512 * 1024);
    if (!body || typeof body !== 'object' || Array.isArray(body)) return fail('Invalid settings payload.');
    db.settings = Object.assign({}, db.settings, body);
    db.settings.contentUpdatedAt = new Date().toISOString();
    const result = await commitContent(c, db, 'CMS: update site settings', state.sha);
    return writeError(result) || json({ ok: true, settings: db.settings });
  }

  if (key === 'import' && method === 'POST') {
    const body = await readJson(req, 24 * 1024 * 1024);
    const incoming = body && body.db ? body.db : body;
    if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming) ||
        !incoming.settings || typeof incoming.settings !== 'object' || Array.isArray(incoming.settings) ||
        !Array.isArray(incoming.products) || !Array.isArray(incoming.categories) ||
        !Array.isArray(incoming.posts) || !Array.isArray(incoming.applications)) {
      return fail('Backup file is not a valid Yuchuan Air data file.');
    }
    const next = clone(incoming);
    next.inquiries = db.inquiries || [];
    const result = await commitContent(c, next, 'CMS: import full backup', state.sha);
    return writeError(result) || json({ ok: true });
  }

  if (key === 'upload' && method === 'POST') {
    const body = await readJson(req, 2 * 1024 * 1024);
    const match = /^data:image\/(png|jpeg|jpg|webp|gif);base64,([A-Za-z0-9+/=]+)$/i
      .exec(str(body && body.dataUrl, 3 * 1024 * 1024));
    if (!match) return fail('Only PNG, JPG, WEBP or GIF image data is accepted.');
    if (Math.ceil(match[2].length * 3 / 4) > MAX_UPLOAD_BYTES) {
      return fail('图片需小于 900 KB（GitHub Contents API 限制）。请压缩为 JPG/WEBP 后再上传。', 413);
    }
    const extMap = { png: 'png', jpeg: 'jpg', jpg: 'jpg', webp: 'webp', gif: 'gif' };
    const filename = 'img-' + Date.now().toString(36) + '-' +
      (crypto.randomUUID ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10)) +
      '.' + extMap[match[1].toLowerCase()];
    let sha = null;
    try {
      const existing = await ghGetFile(c, 'data/uploads/' + filename);
      if (existing) sha = existing.sha;
      const result = await ghPutFile(c, 'data/uploads/' + filename, match[2],
        'CMS: upload ' + filename, sha);
      return writeError(result) || json({ ok: true, url: '/uploads/' + filename }, 201);
    } catch (err) {
      return fail('Could not upload image: ' + String(err && err.message || err), 502);
    }
  }

  if (COLLECTIONS.indexOf(key) === -1) return fail('Unknown admin endpoint', 404);

  const list = Array.isArray(db[key]) ? db[key] : (db[key] = []);
  const id = rest[1] ? safeDecode(rest[1]) : null;

  if (!id) {
    if (method === 'GET') return json({ items: list });
    if (method === 'POST') {
      const body = await readJson(req, 2 * 1024 * 1024);
      if (!body || typeof body !== 'object' || Array.isArray(body)) return fail('Invalid payload.');
      const item = Object.assign({}, body);
      item.id = uid(key.slice(0, -1));
      if (SLUGGED.indexOf(key) !== -1) {
        item.slug = uniqueSlug(list, item.slug || item.name || item.title || item.id, null);
      }
      if (key === 'posts' && !item.date) item.date = new Date().toISOString().slice(0, 10);
      if (key === 'inquiries') item.createdAt = item.createdAt || new Date().toISOString();
      if (key !== 'inquiries' && typeof item.order !== 'number') item.order = list.length + 1;
      if (key !== 'inquiries' && item.published === undefined) item.published = true;
      const stamp = touchContent(db, key);
      if (stamp) item.dateModified = stamp;
      list.push(item);
      if (key === 'inquiries') {
        await writeInquiries(c, list);
        return json({ ok: true, item: item }, 201);
      }
      const result = await commitContent(c, db, 'CMS: create ' + key, state.sha);
      return writeError(result) || json({ ok: true, item: item }, 201);
    }
    return fail('Method not allowed', 405);
  }

  const index = list.findIndex(function (entry) { return String(entry.id) === id; });
  if (index === -1) return fail('Item not found.', 404);
  if (method === 'GET') return json({ item: list[index] });

  if (method === 'PUT') {
    const body = await readJson(req, 2 * 1024 * 1024);
    if (!body || typeof body !== 'object' || Array.isArray(body)) return fail('Invalid payload.');
    const merged = Object.assign({}, list[index], body, { id: list[index].id });
    if (SLUGGED.indexOf(key) !== -1 && merged.slug) {
      merged.slug = uniqueSlug(list, merged.slug, list[index].id);
    }
    const stamp = touchContent(db, key);
    if (stamp) merged.dateModified = stamp;
    list[index] = merged;
    if (key === 'inquiries') {
      await writeInquiries(c, list);
      return json({ ok: true, item: merged });
    }
    const result = await commitContent(c, db, 'CMS: update ' + key, state.sha);
    return writeError(result) || json({ ok: true, item: merged });
  }

  if (method === 'DELETE') {
    if (key === 'categories') {
      const used = (db.products || []).filter((p) => p.category === list[index].slug).length;
      if (used > 0) {
        return fail('This category still contains ' + used +
          ' product(s). Move them to another category first.');
      }
    }
    const removed = list.splice(index, 1)[0];
    touchContent(db, key);
    if (key === 'inquiries') {
      await writeInquiries(c, list);
      return json({ ok: true, item: removed });
    }
    const result = await commitContent(c, db, 'CMS: delete ' + key, state.sha);
    return writeError(result) || json({ ok: true, item: removed });
  }

  return fail('Method not allowed', 405);
}

/* ------------------------------------------------------------------ *
 * Entry point
 * ------------------------------------------------------------------ */

export async function onRequest(context) {
  const req = context.request;
  const c = config(context.env);
  let url;
  try { url = new URL(req.url); }
  catch (err) { return fail('Bad request'); }

  const method = String(req.method || 'GET').toUpperCase();
  const parts = url.pathname.split('/').filter(Boolean);
  if (parts[0] !== 'api') {
    return context.next ? context.next() : fail('Not found', 404);
  }
  if (method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: { 'Allow': 'GET, POST, PUT, DELETE, OPTIONS' }
    });
  }

  try {
    const snap = await loadSnapshot(context);
    if (parts[1] === 'admin') {
      return await adminApi(req, parts.slice(2), method, c, snap);
    }
    return await publicApi(req, parts.slice(1), method, url.searchParams, c, snap);
  } catch (err) {
    return fail('Server error: ' + String(err && err.message || err), 500);
  }
}
