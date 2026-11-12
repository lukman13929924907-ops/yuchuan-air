#!/usr/bin/env node
/**
 * Pre-render the whole site into dist/ for Cloudflare Pages.
 *
 * The Node server (server.js) stays available for local development and for
 * the WorkBuddy preview. Both paths use lib/seo.js + lib/render.js, so the
 * HTML a crawler receives is byte-for-byte the same shape; only the delivery
 * layer differs.
 *
 *   SITE_URL  optional. Overrides settings.siteUrl for canonical/OG/sitemap.
 *             Set it in the Cloudflare Pages build environment to the stable
 *             https://<project>.pages.dev URL (or the final custom domain).
 *
 * Zero third-party dependencies. Run: node scripts/build-static.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const seo = require('../lib/seo');

const ROOT = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const ADMIN_DIR = path.join(ROOT, 'admin');
const DATA_DIR = path.join(ROOT, 'data');
const OUT = path.resolve(process.env.BUILD_OUT || path.join(ROOT, 'dist'));

const db = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'db.json'), 'utf8'));

function baseUrl() {
  const env = String(process.env.SITE_URL || '').trim().replace(/\/+$/, '');
  if (env) return env;
  const configured = String((db.settings || {}).siteUrl || '').trim().replace(/\/+$/, '');
  if (configured) return configured;
  // Stable production URL of the Cloudflare Pages project (not the per-deploy
  // CF_PAGES_URL, which contains a hash and must never become a canonical).
  return 'https://yuchuan-air.pages.dev';
}
const BASE = baseUrl();

/* ------------------------------------------------------------------ *
 * Filesystem helpers
 * ------------------------------------------------------------------ */

function writeFile(rel, content) {
  const target = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, 'utf8');
}

function writeBinary(rel, buffer) {
  const target = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, buffer);
}

function copyDir(src, destRel, filter) {
  if (!fs.existsSync(src)) return 0;
  let count = 0;
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const rel = path.posix.join(destRel, entry.name);
    if (entry.isDirectory()) {
      count += copyDir(from, rel, filter);
    } else if (!filter || filter(entry.name)) {
      writeBinary(rel, fs.readFileSync(from));
      count += 1;
    }
  }
  return count;
}

/* ------------------------------------------------------------------ *
 * Page enumeration
 * ------------------------------------------------------------------ */

const STATIC_PAGES = [
  ['/', 'index.html'],
  ['/products', 'products.html'],
  ['/applications', 'applications.html'],
  ['/about', 'about.html'],
  ['/blog', 'blog.html'],
  ['/contact', 'contact.html'],
  ['/privacy', 'privacy.html']
];

const isPublished = (item) => item && item.published !== false;

function dynamicPages() {
  const pages = [];
  (db.categories || []).filter(isPublished).forEach((c) => {
    pages.push(['/collections/' + encodeURIComponent(c.slug), 'products.html']);
  });
  (db.products || []).filter(isPublished).forEach((p) => {
    pages.push(['/products/' + encodeURIComponent(p.slug), 'product.html']);
  });
  (db.posts || []).filter(isPublished).forEach((p) => {
    pages.push(['/blog/' + encodeURIComponent(p.slug), 'post.html']);
  });
  return pages;
}

/**
 * Cloudflare Pages serves /foo from foo.html and /foo/ from foo/index.html.
 * Emitting both makes every clean URL work regardless of trailing slash while
 * canonical tags stay pinned to the single clean path (ctx.path).
 */
function emitPage(cleanPath, html) {
  if (cleanPath === '/') {
    writeFile('index.html', html);
    return 1;
  }
  const rel = cleanPath.replace(/^\//, '');
  writeFile(rel + '.html', html);
  writeFile(rel + '/index.html', html);
  return 2;
}

const errors = [];
let pageCount = 0;
let fileCount = 0;

for (const [cleanPath, template] of STATIC_PAGES.concat(dynamicPages())) {
  const ctx = seo.resolveContext(db, cleanPath, new URLSearchParams());
  if (!ctx) {
    errors.push('Could not resolve context for ' + cleanPath);
    continue;
  }
  const raw = fs.readFileSync(path.join(PUBLIC_DIR, template), 'utf8');
  const html = seo.renderPage(raw, db, ctx, BASE).html;
  if (html.indexOf('data-ssr="1"') === -1) errors.push('Missing SSR marker: ' + cleanPath);
  if (/Loading (product|article|content)/i.test(html)) {
    errors.push('Unrendered loading placeholder: ' + cleanPath);
  }
  fileCount += emitPage(cleanPath, html);
  pageCount += 1;
}

// The admin panel is a static shell; its data comes from the same-origin
// /api/admin/* implemented by functions/api/[[path]].js.
const adminRaw = fs.readFileSync(path.join(ADMIN_DIR, 'index.html'), 'utf8');
// Tell admin.js it is running against the Git-backed static deployment, so it
// can show the correct rebuild delay, upload cap and password instructions.
const adminHtml = seo.renderAdminHtml(adminRaw)
  .replace('</head>', '<script>window.YC_STATIC=true;</script>\n</head>');
writeFile('admin/index.html', adminHtml);

/* ------------------------------------------------------------------ *
 * Crawler-facing files
 * ------------------------------------------------------------------ */

writeFile('robots.txt', seo.robotsTxt(db, BASE));
writeFile('sitemap.xml', seo.sitemapXml(db, BASE));
writeFile('llms.txt', seo.llmsTxt(db, BASE));
writeFile('llms-full.txt', seo.llmsFullTxt(db, BASE));

/* ------------------------------------------------------------------ *
 * Static assets
 * ------------------------------------------------------------------ */

// Templates are deliberately NOT copied: only compiled HTML is published.
let assets = 0;
assets += copyDir(path.join(PUBLIC_DIR, 'css'), 'css');
assets += copyDir(path.join(PUBLIC_DIR, 'js'), 'js');
assets += copyDir(path.join(PUBLIC_DIR, 'img'), 'img');
assets += copyDir(path.join(ADMIN_DIR, 'css'), 'admin/css');
assets += copyDir(path.join(ADMIN_DIR, 'js'), 'admin/js');
assets += copyDir(path.join(DATA_DIR, 'uploads'), 'uploads', (name) => name !== 'README.txt');

/* ------------------------------------------------------------------ *
 * Edge function inputs
 * ------------------------------------------------------------------ */

// Bake a read-only content snapshot into the Pages Function bundle so public
// /api/* reads never need a GitHub API call at runtime. Only writes go to
// GitHub. Inquiries carry buyer PII and therefore live in KV, not here.
const snapshot = Object.assign({}, db);
snapshot.inquiries = [];
if (snapshot.settings) {
  const safeSettings = Object.assign({}, snapshot.settings);
  delete safeSettings.inquiryWebhook; // webhook URLs are not public data
  snapshot.settings = safeSettings;
}
const edgeFile = path.join(ROOT, 'functions', 'api', '_snapshot.js');
fs.mkdirSync(path.dirname(edgeFile), { recursive: true });
fs.writeFileSync(edgeFile,
  '/* Generated by scripts/build-static.js - do not edit by hand. */\n' +
  'export default ' + JSON.stringify(snapshot) + ';\n', 'utf8');

// Same snapshot as a static asset. The Pages Function reads this at runtime
// via env.ASSETS.fetch(), so public /api/* reads are ALWAYS in sync with the
// freshly built HTML - even if Cloudflare bundles functions/ before running
// the build command. _snapshot.js above remains a safe offline fallback.
writeFile('_data/site.json', JSON.stringify(snapshot));

/* ------------------------------------------------------------------ *
 * Cloudflare Pages headers / redirects
 * ------------------------------------------------------------------ */

// Without this file every static page request would invoke a Function and
// consume the daily free allowance. Only /api/* needs the edge runtime.
writeFile('_routes.json', JSON.stringify({
  version: 1,
  include: ['/api/*'],
  exclude: []
}, null, 2) + '\n');

writeFile('_headers', [
  '/*',
  '  X-Content-Type-Options: nosniff',
  '  Referrer-Policy: strict-origin-when-cross-origin',
  '  X-Frame-Options: SAMEORIGIN',
  '  Permissions-Policy: camera=(), microphone=(), geolocation=(), interest-cohort=()',
  '  Strict-Transport-Security: max-age=31536000; includeSubDomains',
  '',
  '/api/*',
  '  Cache-Control: no-store',
  '',
  '/admin/*',
  '  Cache-Control: no-store',
  '',
  '/css/*',
  '  Cache-Control: public, max-age=3600, must-revalidate',
  '',
  '/js/*',
  '  Cache-Control: public, max-age=3600, must-revalidate',
  '',
  '/uploads/*',
  '  Cache-Control: public, max-age=604800, must-revalidate',
  '',
  '/_data/*',
  '  Cache-Control: no-store',
  ''
].join('\n'));

// Legacy article URLs carried a ?slug= query; static hosting cannot rewrite
// query strings, so /post falls back to the article index. Every real article
// has a clean /blog/<slug> URL in the sitemap and internal links.
writeFile('_redirects', [
  '/post  /blog  301',
  '/post.html  /blog  301',
  '/index.html  /  301',
  ''
].join('\n'));

/* ------------------------------------------------------------------ *
 * Report
 * ------------------------------------------------------------------ */

console.log('[build] base URL      :', BASE);
console.log('[build] pages         :', pageCount, '(' + fileCount + ' HTML files)');
console.log('[build] assets copied :', assets);
console.log('[build] output        :', OUT);
if (errors.length) {
  errors.forEach((e) => console.error('[build] ERROR', e));
  process.exit(1);
}
console.log('[build] OK - every page is fully server-rendered HTML');
