'use strict';
/**
 * Integration tests for the Cloudflare Pages static build + edge Function.
 *
 * Runs the REAL functions/api/[[path]].js module in Node 22, which provides
 * the same Web APIs as Workers (Request/Response/fetch/crypto.subtle/atob).
 * GitHub and Resend are stubbed at the fetch boundary, KV is an in-memory
 * object, so no network or credentials are needed.
 */
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const MODULE_URL = pathToFileURL(path.join(ROOT, 'functions', 'api', '[[path]].js')).href;
const BASE = 'https://yuchuan-air.pages.dev';

let pass = 0;
let failed = 0;
function ck(name, ok, detail) {
  if (ok) { pass += 1; console.log('  PASS  ' + name); }
  else { failed += 1; console.log('  FAIL  ' + name + (detail ? '  -> ' + detail : '')); }
}

async function main() {
  /* ---------- static build ---------- */
  console.log('=== Static build ===');
  execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'build-static.js')],
    { cwd: ROOT, stdio: 'pipe' });
  const dist = path.join(ROOT, 'dist');
  const routes = JSON.parse(fs.readFileSync(path.join(dist, '_routes.json'), 'utf8'));
  ck('routes only invoke Functions on /api/*',
    routes.version === 1 && routes.include.length === 1 && routes.include[0] === '/api/*');
  ck('edge snapshot generated', fs.existsSync(path.join(ROOT, 'functions', 'api', '_snapshot.js')));
  const home = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
  ck('home is fully server-rendered', home.includes('data-ssr="1"') &&
    home.includes('Shandong Yuchuan') && home.includes('+86 531 8351 6866'));
  ck('home has no loading placeholders', !/Loading (product|article|content)/i.test(home));
  ck('robots.txt + sitemap + llms generated', ['robots.txt', 'sitemap.xml', 'llms.txt', 'llms-full.txt']
    .every((f) => fs.existsSync(path.join(dist, f))));
  ck('robots allows AI crawlers', ['GPTBot', 'ClaudeBot', 'PerplexityBot']
    .every((ua) => fs.readFileSync(path.join(dist, 'robots.txt'), 'utf8').includes(ua)));
  ck('product detail pre-rendered with JSON-LD',
    fs.readFileSync(path.join(dist, 'products', 'hydroguard-wdc12000-wet-dust-collector.html'), 'utf8')
      .includes('"Product"'));
  ck('_headers pins security headers',
    fs.readFileSync(path.join(dist, '_headers'), 'utf8').includes('Strict-Transport-Security'));
  ck('runtime content asset generated', fs.existsSync(path.join(dist, '_data', 'site.json')));
  const runtimeAsset = JSON.parse(fs.readFileSync(path.join(dist, '_data', 'site.json'), 'utf8'));
  ck('runtime asset is sanitised', Array.isArray(runtimeAsset.inquiries) &&
    runtimeAsset.inquiries.length === 0 && !('inquiryWebhook' in runtimeAsset.settings));
  ck('content asset is not a Function route', !routes.include.some((r) => r.indexOf('_data') > -1));
  ck('content asset is never cached',
    /\/_data\/\*\s*\n\s*Cache-Control: no-store/.test(fs.readFileSync(path.join(dist, '_headers'), 'utf8')));

  /* ---------- runtime stubs ---------- */
  const seed = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'db.json'), 'utf8'));
  let ghFile = { sha: 'sha-1', content: Buffer.from(JSON.stringify(seed), 'utf8').toString('base64') };
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async function (input, init) {
    const url = String(input);
    const method = (init && init.method) || 'GET';
    calls.push({ url: url, method: method, body: init && init.body });
    if (url.includes('api.github.com') && method === 'GET') {
      return new Response(JSON.stringify({ sha: ghFile.sha, content: ghFile.content }),
        { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url.includes('api.github.com') && method === 'PUT') {
      const payload = JSON.parse(init.body);
      ghFile = { sha: 'sha-' + (calls.length + 1), content: payload.content };
      return new Response(JSON.stringify({ content: { sha: ghFile.sha } }), { status: 200 });
    }
    if (url.includes('api.resend.com')) {
      return new Response(JSON.stringify({ id: 'mail_test' }), { status: 200 });
    }
    return new Response('{}', { status: 200 });
  };

  const kvStore = {};
  let assetHits = 0;
  let assetSnapshot = JSON.parse(JSON.stringify(runtimeAsset));
  const assetsBinding = {
    fetch: async function () {
      assetHits += 1;
      return new Response(JSON.stringify(assetSnapshot),
        { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
  };
  const env = {
    ASSETS: assetsBinding,
    ADMIN_PASSWORD: 'StrongTestPass!2026',
    SESSION_SECRET: 'unit-test-hmac-secret',
    GITHUB_TOKEN: 'ghp_unit_test',
    GITHUB_REPO: 'owner/yuchuan-air',
    GITHUB_BRANCH: 'master',
    EMAIL_API_KEY: 're_unit_test',
    EMAIL_FROM: 'onboarding@resend.dev',
    EMAIL_TO: 'signup@gmail.com',
    INQUIRIES: {
      get: async (k) => (Object.prototype.hasOwnProperty.call(kvStore, k) ? kvStore[k] : null),
      put: async (k, v) => { kvStore[k] = v; }
    }
  };

  const mod = await import(MODULE_URL);
  ck('edge module exports onRequest', typeof mod.onRequest === 'function');

  async function call(pathname, opts) {
    const o = opts || {};
    const headers = Object.assign({}, o.cookie ? { Cookie: o.cookie } : {},
      o.body !== undefined ? { 'Content-Type': 'application/json' } : {});
    const req = new Request(BASE + pathname, {
      method: o.method || 'GET',
      headers: headers,
      body: o.body === undefined ? undefined : JSON.stringify(o.body)
    });
    const res = await mod.onRequest({
      request: req, env: env,
      next: () => new Response('static', { status: 200 })
    });
    const body = await res.text();
    let parsed;
    try { parsed = JSON.parse(body); } catch (err) { parsed = null; }
    return { s: res.status, b: body, j: parsed, h: res.headers };
  }

  /* ---------- public API ---------- */
  console.log('\n=== Public API (build-time snapshot, zero GitHub reads) ===');
  const site = await call('/api/site');
  ck('GET /api/site 200', site.s === 200, String(site.s));
  ck('company identity present', site.j && String(site.j.settings.companyName).indexOf('Shandong Yuchuan') === 0);
  ck('product/post counts exposed', site.j && site.j.counts.products === 15 && site.j.counts.posts === 6);
  ck('webhook URL never exposed', site.j && !('inquiryWebhook' in site.j.settings));
  ck('public reads make no GitHub calls', calls.length === 0, String(calls.length));
  ck('public reads use the runtime content asset', assetHits > 0, String(assetHits));

  // Simulate a CMS save -> Cloudflare rebuild with a stale bundled snapshot.
  // The public API must follow the freshly built asset, not the stale import.
  assetSnapshot = JSON.parse(JSON.stringify(runtimeAsset));
  assetSnapshot.settings.companyName = 'Fresh Rebuild Test Ltd';
  const rebuilt = await call('/api/site');
  ck('rebuilt content wins over bundled snapshot',
    rebuilt.s === 200 && rebuilt.j.settings.companyName === 'Fresh Rebuild Test Ltd',
    rebuilt.j && rebuilt.j.settings.companyName);
  ck('fresh content still needs no GitHub call', calls.length === 0);

  delete env.ASSETS;
  const offline = await call('/api/site');
  ck('bundled snapshot is a working offline fallback',
    offline.s === 200 && offline.j.settings.companyName !== 'Fresh Rebuild Test Ltd',
    offline.j && offline.j.settings.companyName);
  env.ASSETS = assetsBinding;
  assetSnapshot = JSON.parse(JSON.stringify(runtimeAsset));

  const products = await call('/api/products');
  ck('GET /api/products 200', products.s === 200 && products.j.items.length === 15);
  const filtered = await call('/api/products?category=' + encodeURIComponent(seed.categories[0].slug));
  ck('category filter works', filtered.s === 200 && filtered.j.items.length > 0 &&
    filtered.j.items.every((p) => p.category === seed.categories[0].slug));
  const one = await call('/api/products/' + encodeURIComponent(seed.products[0].slug));
  ck('GET /api/products/<slug> 200', one.s === 200 && one.j.item.id === seed.products[0].id);
  ck('unknown product 404', (await call('/api/products/does-not-exist')).s === 404);
  ck('unknown /api/blog route 404',
    (await call('/api/blog/' + encodeURIComponent(seed.posts[0].slug))).s === 404);
  ck('GET /api/posts/<slug> via correct route',
    (await call('/api/posts/' + encodeURIComponent(seed.posts[0].slug))).s === 200);
  ck('unknown endpoint 404', (await call('/api/nope')).s === 404);

  /* ---------- inquiries ---------- */
  console.log('\n=== Inquiry capture + notification ===');
  const honeypot = await call('/api/inquiries', {
    method: 'POST', body: { name: 'Bot', email: 'bot@example.com', message: 'spam', website: 'http://spam' }
  });
  ck('honeypot silently accepted', honeypot.s === 201);
  ck('honeypot not persisted', !kvStore.list || JSON.parse(kvStore.list).length === 0);
  ck('missing fields rejected', (await call('/api/inquiries', {
    method: 'POST', body: { name: '', email: 'x', message: '' }
  })).s === 400);
  ck('invalid email rejected', (await call('/api/inquiries', {
    method: 'POST', body: { name: 'A', email: 'not-an-email', message: 'hello' }
  })).s === 400);

  calls.length = 0;
  const lead = await call('/api/inquiries', {
    method: 'POST',
    body: {
      name: 'Test Buyer', email: 'buyer@example.com', company: 'ACME GmbH',
      country: 'Germany', product: 'HydroGuard WDC-12000', message: 'Please quote two units.',
      utm_source: 'perplexity', utm_medium: 'ai-referral',
      landing_page: '/products/hydroguard', page_url: BASE + '/products/hydroguard',
      language: 'en-US'
    }
  });
  ck('valid inquiry 201', lead.s === 201 && !!lead.j.id, String(lead.s));
  const stored = JSON.parse(kvStore.list || '[]');
  ck('lead persisted in KV', stored.length === 1 && stored[0].email === 'buyer@example.com');
  ck('AI referral channel inferred', stored[0].channel === 'ai-referral', stored[0].channel);
  ck('lead never written to GitHub', !calls.some((x) => x.method === 'PUT' && x.url.includes('contents/data/db.json')));
  const mail = calls.find((x) => x.url.includes('api.resend.com'));
  ck('Resend notification sent', !!mail && mail.method === 'POST');
  const mailBody = JSON.parse(mail.body);
  ck('Reply-To is the buyer', mailBody.reply_to === 'buyer@example.com');
  ck('recipient is Resend signup mailbox (2A)', mailBody.to[0] === 'signup@gmail.com', mailBody.to[0]);
  ck('attribution included in email', mailBody.text.includes('perplexity') && mailBody.text.includes('HydroGuard'));
  ck('enterprise mailbox stays frontend-only', site.j.settings.email === 'info@hanxvonfluid.cn');

  /* ---------- admin auth ---------- */
  console.log('\n=== Admin session ===');
  ck('unauthenticated /api/admin/data 401', (await call('/api/admin/data')).s === 401);
  ck('wrong password 401', (await call('/api/admin/login', {
    method: 'POST', body: { username: 'admin', password: 'wrong' }
  })).s === 401);
  const login = await call('/api/admin/login', {
    method: 'POST', body: { username: 'admin', password: 'StrongTestPass!2026' }
  });
  ck('correct password 200', login.s === 200, String(login.s));
  const setCookie = login.h.get('set-cookie') || '';
  ck('HttpOnly Secure session cookie', setCookie.includes('HttpOnly') && setCookie.includes('Secure') &&
    setCookie.includes('yc_session='));
  const cookie = setCookie.split(';')[0];
  ck('tampered cookie rejected', (await call('/api/admin/me', { cookie: cookie.slice(0, -2) + 'xx' })).s === 401);
  ck('GET /api/admin/me 200', (await call('/api/admin/me', { cookie: cookie })).s === 200);
  const data = await call('/api/admin/data', { cookie: cookie });
  ck('GET /api/admin/data 200', data.s === 200 && data.j.products.length === 15);
  ck('admin data includes KV inquiries', data.j.inquiries.length === 1);

  /* ---------- admin writes ---------- */
  console.log('\n=== Admin writes -> GitHub commit ===');
  calls.length = 0;
  const saved = await call('/api/admin/settings', {
    method: 'PUT', cookie: cookie, body: { seoTitle: 'Edge Build Test Title' }
  });
  ck('settings PUT 200', saved.s === 200, String(saved.s));
  const dbPut = calls.find((x) => x.method === 'PUT' && x.url.includes('contents/data/db.json'));
  ck('content committed to GitHub', !!dbPut);
  const committed = JSON.parse(Buffer.from(JSON.parse(dbPut.body).content, 'base64').toString('utf8'));
  ck('committed settings applied', committed.settings.seoTitle === 'Edge Build Test Title');
  ck('buyer PII never enters the repo', Array.isArray(committed.inquiries) && committed.inquiries.length === 0);
  ck('commit message identifies CMS action', JSON.parse(dbPut.body).message.includes('CMS:'));

  calls.length = 0;
  const created = await call('/api/admin/products', {
    method: 'POST', cookie: cookie, body: { name: 'Edge Test Collector', category: seed.categories[0].slug }
  });
  ck('product create 201', created.s === 201 && !!created.j.item.id, String(created.s));
  ck('slug auto-generated', !!created.j.item.slug);
  ck('product create commits content', calls.some((x) => x.method === 'PUT'));

  calls.length = 0;
  const readFlag = await call('/api/admin/inquiries/' + encodeURIComponent(stored[0].id), {
    method: 'PUT', cookie: cookie, body: { read: true }
  });
  ck('inquiry mark-read 200', readFlag.s === 200);
  ck('inquiry read flag in KV', JSON.parse(kvStore.list)[0].read === true);
  ck('inquiry update makes NO GitHub commit',
    !calls.some((x) => x.method === 'PUT' && x.url.includes('contents/data/db.json')));

  ck('category delete guard 400', (await call('/api/admin/categories/' + seed.categories[0].id, {
    method: 'DELETE', cookie: cookie
  })).s === 400);

  const status = await call('/api/admin/email-status', { cookie: cookie });
  ck('email-status ACTIVE and safe', status.s === 200 && status.j.enabled === true &&
    status.j.provider === 'resend' && !('apiKey' in status.j));
  ck('password change gives Cloudflare guidance',
    (await call('/api/admin/password', { method: 'POST', cookie: cookie, body: {} })).s === 400);
  ck('backup export 200', (await call('/api/admin/export', { cookie: cookie })).s === 200);
  ck('CSV export 200', (await call('/api/admin/inquiries.csv', { cookie: cookie })).s === 200);
  ck('invalid import rejected', (await call('/api/admin/import', {
    method: 'POST', cookie: cookie, body: { db: { foo: 1 } }
  })).s === 400);

  calls.length = 0;
  const tinyPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const upload = await call('/api/admin/upload', { method: 'POST', cookie: cookie, body: { dataUrl: tinyPng } });
  ck('image upload 201', upload.s === 201 && upload.j.url.startsWith('/uploads/'), String(upload.s));
  ck('image written to data/uploads', calls.some((x) => x.url.includes('contents/data/uploads/') && x.method === 'PUT'));

  globalThis.fetch = originalFetch;

  /* ---------- summary ---------- */
  console.log('\n=== edge.test.js: ' + pass + ' passed, ' + failed + ' failed ===');
  if (failed) process.exit(1);
}

main().catch(function (err) {
  console.error('edge.test.js crashed:', err && err.stack || err);
  process.exit(1);
});
