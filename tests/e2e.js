#!/usr/bin/env node
'use strict';

/**
 * End-to-end regression test for the Yuchuan Air export site.
 *
 * Run:  node server.js  (PORT=3211), then:
 *       ADMIN_PASSWORD=<your admin password> TEST_PORT=3211 node tests/e2e.js
 *
 * Zero dependencies. Uses only Node built-ins, just like the site itself.
 */

const http = require('http');
const HOST = '127.0.0.1';
const PORT = Number(process.env.TEST_PORT || 3211);
const PASSWORD = process.env.ADMIN_PASSWORD || '';
const PRODUCT_SLUG = 'hydroguard-wdc12000-wet-dust-collector';
const POST_SLUG = 'voc-filtration-systems-types-technologies-applications';

let pass = 0;
let fail = 0;

function ck(name, condition, extra) {
  if (condition) { pass++; console.log('PASS ' + name + (extra ? ' :: ' + extra : '')); }
  else { fail++; console.log('FAIL ' + name + (extra ? ' :: ' + extra : '')); }
}

function call(method, path, body, cookie, extraHeaders) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? null : JSON.stringify(body);
    const headers = Object.assign({}, extraHeaders || {});
    if (data) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(data);
    }
    if (cookie) headers.Cookie = cookie;
    const req = http.request({ host: HOST, port: PORT, path: path, method: method, headers: headers }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({
        s: res.statusCode,
        h: res.headers,
        b: Buffer.concat(chunks).toString('utf8')
      }));
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function jsonLdOf(html) {
  const match = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html);
  if (!match) return null;
  try { return JSON.parse(match[1]); } catch (err) { return null; }
}

function typesOf(ld) {
  return ld && Array.isArray(ld['@graph'])
    ? ld['@graph'].map((node) => node['@type'])
    : [];
}

(async () => {
  if (!PASSWORD) {
    console.error('Set ADMIN_PASSWORD before running this test.');
    process.exit(2);
  }

  console.log('\n=== Pages & redirects ===');
  const pages = [
    '/', '/products', '/applications', '/about', '/blog', '/contact', '/admin',
    '/products/' + PRODUCT_SLUG, '/blog/' + POST_SLUG,
    '/collections/wet-dust-collectors',
    '/css/style.css', '/js/main.js', '/admin/css/admin.css', '/admin/js/admin.js',
    '/img/favicon.svg', '/img/og-image.svg',
    '/robots.txt', '/sitemap.xml', '/llms.txt', '/llms-full.txt'
  ];
  for (const p of pages) {
    const r = await call('GET', p);
    ck('page ' + p, r.s === 200, 'status ' + r.s);
  }
  const htmlRedirect = await call('GET', '/products.html');
  ck('clean URL redirect /products.html', htmlRedirect.s === 301 &&
    String(htmlRedirect.h.location) === '/products', String(htmlRedirect.h.location));
  const postRedirect = await call('GET', '/post?slug=' + POST_SLUG);
  ck('legacy /post redirect', postRedirect.s === 301 &&
    String(postRedirect.h.location) === '/blog/' + POST_SLUG, String(postRedirect.h.location));
  ck('404 for unknown product', (await call('GET', '/products/does-not-exist')).s === 404);
  ck('404 for unknown collection', (await call('GET', '/collections/nope')).s === 404);
  ck('404 for unknown page', (await call('GET', '/no-such-page')).s === 404);

  console.log('\n=== Server-side rendering (SEO / GEO foundation) ===');
  const home = (await call('GET', '/')).b;
  const siteSettings = JSON.parse((await call('GET', '/api/site')).b).settings;
  ck('home has data-ssr', home.indexOf('data-ssr="1"') > -1);
  ck('home renders products', home.indexOf('QuickShip QS-1000') > -1);
  ck('home renders SVG art', home.indexOf('<svg') > -1);
  ck('home renders navigation', home.indexOf('class="main-nav"') > -1);
  ck('home renders footer NAP from settings',
    home.indexOf(siteSettings.email) > -1 && home.indexOf(siteSettings.companyName) > -1,
    siteSettings.email);
  ck('home renders real phone + WhatsApp from settings',
    home.indexOf(siteSettings.phone) > -1 && home.indexOf(siteSettings.whatsapp) > -1);
  ck('home renders verified company facts',
    home.indexOf('Since 2018') > -1 && home.indexOf('1,900+') > -1 && home.indexOf('35+') > -1);
  ck('home has no placeholder facts or unconfirmed delivery claims',
    !/8899 0666|8888 0666|Since 2012|12\+|60\+|2,000\+|72 hours|Ships in 72 Hours/.test(home));
  ck('home has no loading placeholder', home.indexOf('Loading products…') === -1);
  ck('home has FAQ block', home.indexOf('faq-section') > -1);
  const homeLd = jsonLdOf(home);
  ck('home JSON-LD parses', homeLd !== null);
  ck('home has Organization + WebSite + FAQPage',
    ['Organization', 'WebSite', 'FAQPage'].every((t) => typesOf(homeLd).indexOf(t) > -1),
    typesOf(homeLd).join(','));
  const orgNode = (homeLd['@graph'] || []).find((n) => n && n['@type'] === 'Organization') || {};
  ck('Organization foundingDate is 2018', orgNode.foundingDate === '2018', String(orgNode.foundingDate));
  ck('Organization address has city, region and country',
    orgNode.address && orgNode.address.addressLocality === 'Jinan' &&
    orgNode.address.addressRegion === 'Shandong Province' && orgNode.address.addressCountry === 'CN');
  ck('Organization lists real credentials',
    Array.isArray(orgNode.hasCredential) && orgNode.hasCredential.length >= 5 &&
    orgNode.hasCredential.some((c) => /ISO 9001/.test(c.name || '')) &&
    orgNode.hasCredential.some((c) => /Registered Environmental Engineer/.test(c.name || '')));
  ck('home canonical is absolute', /<link rel="canonical" href="https?:\/\//.test(home));
  ck('home has OG + Twitter image', home.indexOf('og:image') > -1 && home.indexOf('twitter:card') > -1);
  ck('home has hreflang', home.indexOf('hreflang="x-default"') > -1);

  const prod = (await call('GET', '/products/' + PRODUCT_SLUG)).b;
  ck('product H1 is the real model', /<h1>HydroGuard WDC-12000 Wet Dust Collector<\/h1>/.test(prod));
  ck('product renders specs table', prod.indexOf('spec-table') > -1);
  ck('product renders answer-first paragraph', prod.indexOf('geo-answer') > -1);
  ck('product renders FAQ', prod.indexOf('faq-item') > -1);
  ck('product has no loading placeholder', prod.indexOf('Loading product…') === -1);
  const prodLd = jsonLdOf(prod);
  ck('product JSON-LD has Product + FAQPage + BreadcrumbList',
    ['Product', 'FAQPage', 'BreadcrumbList'].every((t) => typesOf(prodLd).indexOf(t) > -1),
    typesOf(prodLd).join(','));
  ck('product canonical points at itself',
    prod.indexOf('rel="canonical" href="http://127.0.0.1:' + PORT + '/products/' + PRODUCT_SLUG + '"') > -1);

  const article = (await call('GET', '/blog/' + POST_SLUG)).b;
  ck('article renders full body', article.indexOf('article-body') > -1 &&
    article.indexOf('Volatile organic compounds') > -1);
  ck('article JSON-LD has BlogPosting', typesOf(jsonLdOf(article)).indexOf('BlogPosting') > -1);
  ck('article has published_time', article.indexOf('article:published_time') > -1);

  const collection = (await call('GET', '/collections/wet-dust-collectors')).b;
  ck('collection page renders category H1', /<h1>Wet Dust Collectors<\/h1>/.test(collection));
  ck('collection page has CollectionPage schema',
    typesOf(jsonLdOf(collection)).indexOf('CollectionPage') > -1);
  ck('collection page keeps filters usable', collection.indexOf('data-page="products"') > -1);

  const filtered = (await call('GET', '/products?category=wet-dust-collectors')).b;
  ck('filtered page is noindex + canonical to collection',
    filtered.indexOf('noindex,follow') > -1 &&
    filtered.indexOf('/collections/wet-dust-collectors"') > -1);

  console.log('\n=== Crawler-facing files ===');
  const robots = (await call('GET', '/robots.txt')).b;
  ['GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'PerplexityBot', 'Google-Extended', 'CCBot']
    .forEach((ua) => ck('robots allows ' + ua,
      new RegExp('User-agent: ' + ua + '\\nAllow: /').test(robots)));
  ck('robots disallows admin', robots.indexOf('Disallow: /admin') > -1);
  ck('robots declares sitemap', robots.indexOf('Sitemap: ') > -1);

  const llms = (await call('GET', '/llms.txt')).b;
  ck('llms.txt has company summary', llms.indexOf('# Shandong Yuchuan') === 0);
  ck('llms.txt lists products', llms.indexOf('QuickShip QS-1000') > -1);
  ck('llms.txt lists categories', llms.indexOf('/collections/') > -1);
  ck('llms.txt lists contact', llms.indexOf('/contact') > -1);
  ck('llms.txt carries verified company facts',
    llms.indexOf('- Founded: 2018') > -1 &&
    llms.indexOf('35+ Countries with Installed Projects') > -1 &&
    llms.indexOf('1,900+ Systems Installed') > -1 &&
    llms.indexOf('Registered Environmental Engineer') > -1);
  ck('llms.txt has no unconfirmed quick-ship claim', llms.indexOf('quick-ship lead time') === -1);
  const llmsFull = (await call('GET', '/llms-full.txt')).b;
  ck('llms-full.txt includes article body', llmsFull.indexOf('Volatile organic compounds') > -1);
  ck('llms-full.txt includes FAQ answers', llmsFull.indexOf('Q: What does Shandong Yuchuan') > -1);

  const sitemap = (await call('GET', '/sitemap.xml')).b;
  ck('sitemap has lastmod + priority', sitemap.indexOf('<lastmod>') > -1 && sitemap.indexOf('<priority>') > -1);
  ck('sitemap lists collections', sitemap.indexOf('/collections/wet-dust-collectors') > -1);
  ck('sitemap has no query URLs', sitemap.indexOf('?category=') === -1);
  ck('sitemap lists products', sitemap.indexOf('/products/' + PRODUCT_SLUG) > -1);

  console.log('\n=== Performance / caching ===');
  const compressed = await call('GET', '/', undefined, undefined, { 'Accept-Encoding': 'br' });
  ck('brotli content encoding', compressed.h['content-encoding'] === 'br',
    String(compressed.h['content-encoding']));
  ck('Vary header present', String(compressed.h.vary).indexOf('Accept-Encoding') > -1);
  const first = await call('GET', '/');
  const etag = first.h.etag;
  ck('ETag present', Boolean(etag), String(etag));
  const conditional = await call('GET', '/', undefined, undefined, { 'If-None-Match': etag });
  ck('conditional request returns 304', conditional.s === 304, 'status ' + conditional.s);
  const adminHtml = (await call('GET', '/admin')).b;
  ck('admin is noindex', adminHtml.indexOf('noindex,nofollow,noarchive') > -1);
  ck('admin robots tag appears once', (adminHtml.match(/name="robots"/g) || []).length === 1);

  console.log('\n=== Public API regression ===');
  const site = JSON.parse((await call('GET', '/api/site')).b);
  ck('api/site company', String(site.settings.companyName).indexOf('Shandong Yuchuan') === 0);
  ck('api/site real phone', String(site.settings.phone).replace(/\s/g, '') === '+8653183516866');
  ck('api/site real WhatsApp', String(site.settings.whatsapp).replace(/\s/g, '') === '+8617278827749');
  ck('api/site founded 2018', String(site.settings.founded) === '2018');
  ck('api/site real address', /Zhangqiu District/.test(String(site.settings.address)));
  ck('api/site real credentials',
    /ISO 9001/.test(String(site.settings.certifications)) &&
    /Registered Environmental Engineer/.test(String(site.settings.certifications)));
  ck('api/site categories', site.categories.length === 10, String(site.categories.length));
  ck('api/products count', JSON.parse((await call('GET', '/api/products')).b).items.length === 15);
  ck('api/products filter', JSON.parse((await call('GET', '/api/products?category=wet-dust-collectors')).b).items.length === 2);
  ck('api/product related', JSON.parse((await call('GET', '/api/products/' + PRODUCT_SLUG)).b).related.length >= 0);
  ck('api/posts count', JSON.parse((await call('GET', '/api/posts')).b).items.length === 6);
  ck('api/post detail', JSON.parse((await call('GET', '/api/posts/' + POST_SLUG)).b).item.content.indexOf('<p>') === 0);

  console.log('\n=== Lead attribution & anti-spam ===');
  const leadBody = {
    name: 'QA Buyer', email: 'qa-lead@example.com', company: 'QA Industrial GmbH',
    country: 'Germany', product: 'HydroGuard WDC-12000', message: 'Need two wet collectors for aluminium grinding.',
    utm_source: 'perplexity', utm_medium: 'ai-referral', utm_campaign: 'q4-export',
    referrer: 'https://www.perplexity.ai/search/dust-collector',
    landing_page: '/products/' + PRODUCT_SLUG, page_url: '/contact', language: 'en-US'
  };
  const lead = await call('POST', '/api/inquiries', leadBody);
  ck('inquiry created', lead.s === 201, 'status ' + lead.s);
  const spam = await call('POST', '/api/inquiries',
    Object.assign({}, leadBody, { website: 'http://spam.example', email: 'bot@example.com' }));
  ck('honeypot accepted silently', spam.s === 201, 'status ' + spam.s);
  const bad = await call('POST', '/api/inquiries', { name: '', email: 'x', message: '' });
  ck('inquiry validation', bad.s === 400, 'status ' + bad.s);

  console.log('\n=== Admin auth, CRUD, export ===');
  ck('unauth admin blocked', (await call('GET', '/api/admin/data')).s === 401);
  ck('wrong password blocked',
    (await call('POST', '/api/admin/login', { username: 'admin', password: 'definitely-wrong' })).s === 401);
  const login = await call('POST', '/api/admin/login', { username: 'admin', password: PASSWORD });
  ck('admin login', login.s === 200, 'status ' + login.s);
  const cookie = ((login.h['set-cookie'] || [])[0] || '').split(';')[0];
  ck('session cookie is httpOnly', String((login.h['set-cookie'] || [])[0]).indexOf('HttpOnly') > -1);

  const db = JSON.parse((await call('GET', '/api/admin/data', undefined, cookie)).b);
  const leadRow = (db.inquiries || []).filter((i) => i.email === 'qa-lead@example.com')[0];
  ck('lead stored with channel', Boolean(leadRow) && leadRow.channel === 'ai-referral',
    leadRow ? leadRow.channel : 'missing');
  ck('lead stored with UTM + landing page',
    Boolean(leadRow) && leadRow.source.utmCampaign === 'q4-export' &&
    leadRow.source.landingPage.indexOf('/products/') === 0);
  ck('honeypot message NOT stored', !(db.inquiries || []).some((i) => i.email === 'bot@example.com'));
  ck('seed FAQs present', (db.faqs || []).length === 14, String((db.faqs || []).length));

  const csv = await call('GET', '/api/admin/inquiries.csv', undefined, cookie);
  ck('CSV export works', csv.s === 200, 'status ' + csv.s);
  ck('CSV has attribution columns', csv.b.indexOf('UTM Source') > -1 && csv.b.indexOf('Channel') > -1);
  ck('CSV includes the lead', csv.b.indexOf('qa-lead@example.com') > -1);
  ck('CSV download header', String(csv.h['content-disposition']).indexOf('attachment') > -1);

  const faq = await call('POST', '/api/admin/faqs', {
    question: 'QA test question?', answer: 'QA test answer.', scope: 'general', order: 99
  }, cookie);
  ck('admin create FAQ', faq.s === 201, 'status ' + faq.s);
  const faqId = JSON.parse(faq.b).item.id;
  ck('admin update FAQ', JSON.parse((await call('PUT', '/api/admin/faqs/' + faqId,
    { answer: 'Updated QA answer.' }, cookie)).b).item.answer === 'Updated QA answer.');
  ck('admin delete FAQ', (await call('DELETE', '/api/admin/faqs/' + faqId, undefined, cookie)).s === 200);

  const created = await call('POST', '/api/admin/products', {
    name: 'QA Test Product', slug: 'qa-test-product', category: 'cartridge-dust-collectors',
    summary: 'temporary', published: false, order: 99
  }, cookie);
  ck('admin create product', created.s === 201, 'status ' + created.s);
  const pid = JSON.parse(created.b).item.id;
  ck('admin update product', JSON.parse((await call('PUT', '/api/admin/products/' + pid,
    { summary: 'updated' }, cookie)).b).item.summary === 'updated');
  ck('admin delete product', (await call('DELETE', '/api/admin/products/' + pid, undefined, cookie)).s === 200);
  ck('category delete guard', (await call('DELETE', '/api/admin/categories/cat-wet', undefined, cookie)).s === 400);

  const settingsBefore = db.settings;
  const analytics = await call('PUT', '/api/admin/settings',
    Object.assign({}, settingsBefore, { gaMeasurementId: 'G-QA1234567' }), cookie);
  ck('admin save settings', analytics.s === 200, 'status ' + analytics.s);
  const homeWithGa = (await call('GET', '/')).b;
  ck('GA4 ID injected into SSR head', homeWithGa.indexOf('G-QA1234567') > -1);
  ck('YC_TRACK available to browser', homeWithGa.indexOf('window.YC_TRACK=') > -1);
  await call('PUT', '/api/admin/settings', settingsBefore, cookie);
  ck('settings restored', (await call('GET', '/')).b.indexOf('G-QA1234567') === -1);

  console.log('\n=== Privacy / cookie consent (EEA-UK compliance) ===');
  const privacyResp = await call('GET', '/privacy');
  const privacyHtml = privacyResp.b;
  ck('privacy page is server-rendered', privacyResp.s === 200 &&
    privacyHtml.indexOf('data-ssr="1"') > -1 &&
    privacyHtml.indexOf('<h1>Privacy Policy</h1>') > -1, 'status ' + privacyResp.s);
  ck('privacy page has absolute canonical',
    /<link rel="canonical" href="https?:\/\/[^"]*\/privacy">/.test(privacyHtml));
  ck('privacy page uses the real company email',
    privacyHtml.indexOf('info@hanxvonfluid.cn') > -1);
  ck('footer has privacy + cookie settings links',
    privacyHtml.indexOf('href="/privacy"') > -1 && privacyHtml.indexOf('data-yc-consent') > -1);
  ck('privacy page listed in sitemap.xml',
    (await call('GET', '/sitemap.xml')).b.indexOf('/privacy</loc>') > -1);
  ck('privacy page listed in llms.txt',
    (await call('GET', '/llms.txt')).b.indexOf('/privacy') > -1);
  ck('contact form links the privacy notice',
    (await call('GET', '/contact')).b.indexOf('href="/privacy"') > -1);
  const consentJs = (await call('GET', '/js/consent.js')).b;
  ck('consent.js is served and can withdraw consent',
    consentJs.indexOf('yc_consent_granted') > -1 &&
    consentJs.indexOf('loadOptionalTags') > -1 &&
    consentJs.indexOf('YC_CONSENT') > -1);
  const homeResp = await call('GET', '/');
  ck('Permissions-Policy header present',
    String(homeResp.h['permissions-policy'] || '').indexOf('camera=()') > -1);

  const consentSave = await call('PUT', '/api/admin/settings',
    Object.assign({}, settingsBefore, {
      gaMeasurementId: 'G-QA1234567',
      metaPixelId: '123456789012345',
      linkedinPartnerId: '987654',
      cookieConsentEnabled: true
    }), cookie);
  ck('consent settings saved from admin', consentSave.s === 200);
  const gated = (await call('GET', '/')).b;
  ck('Consent Mode v2 defaults to denied',
    gated.indexOf('"analytics_storage":"denied"') > -1 &&
    gated.indexOf('"ad_user_data":"denied"') > -1 &&
    gated.indexOf('"wait_for_update":500') > -1);
  ck('consent default runs BEFORE the GA4 tag',
    gated.indexOf('"analytics_storage":"denied"') < gated.indexOf('G-QA1234567'));
  ck('Meta Pixel is NOT emitted before consent', gated.indexOf('connect.facebook.net') === -1);
  ck('LinkedIn tag is NOT emitted before consent', gated.indexOf('snap.licdn.com') === -1);
  ck('deferred vendor IDs handed to consent.js',
    gated.indexOf('"meta":"123456789012345"') > -1 &&
    gated.indexOf('"linkedin":"987654"') > -1);
  ck('consent.js loaded on page', gated.indexOf('/js/consent.js') > -1);
  await call('PUT', '/api/admin/settings',
    Object.assign({}, settingsBefore, {
      gaMeasurementId: 'G-QA1234567', cookieConsentEnabled: false
    }), cookie);
  const ungated = (await call('GET', '/')).b;
  ck('consent gate is admin-configurable',
    ungated.indexOf('"analytics_storage":"denied"') === -1 &&
    ungated.indexOf('G-QA1234567') > -1);
  await call('PUT', '/api/admin/settings', settingsBefore, cookie);
  ck('consent settings restored', (await call('GET', '/')).b.indexOf('G-QA1234567') === -1);

  if (leadRow) {
    ck('cleanup test lead', (await call('DELETE', '/api/admin/inquiries/' + leadRow.id, undefined, cookie)).s === 200);
  }
  const finalDb = JSON.parse((await call('GET', '/api/admin/data', undefined, cookie)).b);
  ck('final data clean',
    finalDb.products.length === 15 && finalDb.faqs.length === 14 && finalDb.inquiries.length === 0,
    'products=' + finalDb.products.length + ' faqs=' + finalDb.faqs.length + ' inquiries=' + finalDb.inquiries.length);

  ck('export backup', (await call('GET', '/api/admin/export', undefined, cookie)).s === 200);
  ck('invalid import rejected', (await call('POST', '/api/admin/import', { db: { foo: 1 } }, cookie)).s === 400);
  ck('path traversal blocked', (await call('GET', '/../server.js')).s === 404);
  ck('email status blocks anonymous users',
    (await call('GET', '/api/admin/email-status')).s === 401);
  const mailStatus = JSON.parse((await call('GET', '/api/admin/email-status', undefined, cookie)).b);
  ck('email status never leaks the API key',
    typeof mailStatus.enabled === 'boolean' &&
    JSON.stringify(mailStatus).indexOf('apiKey') === -1 &&
    mailStatus.to === 'info@hanxvonfluid.cn',
    'enabled=' + mailStatus.enabled + ' to=' + mailStatus.to);
  ck('logout', (await call('POST', '/api/admin/logout', {}, cookie)).s === 200);
  ck('session invalidated', (await call('GET', '/api/admin/data', undefined, cookie)).s === 401);

  const publicSettings = JSON.parse((await call('GET', '/api/site')).b).settings;
  ck('company email is the real mailbox', publicSettings.email === 'info@hanxvonfluid.cn');
  ck('inquiry recipient configured', publicSettings.inquiryEmail === 'info@hanxvonfluid.cn');
  ck('public settings expose no secret keys',
    Object.keys(publicSettings).filter((k) => /apikey|secret|password|token/i.test(k)).length === 0);

  console.log('\nRESULT pass=' + pass + ' fail=' + fail);
  if (fail) process.exit(1);
})().catch((err) => {
  console.error('TEST ERROR', err);
  process.exit(1);
});
