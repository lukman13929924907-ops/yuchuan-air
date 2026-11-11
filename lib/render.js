'use strict';

/**
 * Server-side HTML rendering for the public website.
 *
 * WHY THIS EXISTS
 * ---------------
 * The original front-end built every product, article and navigation link in
 * the browser with JavaScript. Googlebot renders JavaScript, but most LLM /
 * AI-search crawlers (GPTBot, ClaudeBot, PerplexityBot, CCBot, ...) do not.
 * They would only see "Loading product..." and the site would be invisible in
 * AI answers. This module renders the very same information into the HTML
 * that leaves the server, so both humans and crawlers get the full content
 * on the first byte.
 *
 * The browser script (public/js/main.js) detects data-ssr="1" and only wires
 * up interactions instead of re-rendering, so there is no duplicated content.
 *
 * Zero third-party dependencies. All markup is generated from data/db.json.
 */

const INK = '#0d2436';
const ORANGE = '#f26522';
const GREY = '#dbe7ed';

function esc(value) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function truncate(value, max) {
  const str = String(value || '');
  return str.length > max ? str.slice(0, max).replace(/\s+\S*$/, '') + '…' : str;
}

function formatDate(value) {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function published(list) {
  return (Array.isArray(list) ? list : []).filter((x) => x && x.published !== false);
}

function byOrder(a, b) {
  const ao = typeof a.order === 'number' ? a.order : 9999;
  const bo = typeof b.order === 'number' ? b.order : 9999;
  if (ao !== bo) return ao - bo;
  return String(a.name || a.title || '').localeCompare(String(b.name || b.title || ''));
}

function categoryName(db, slug) {
  const found = (db.categories || []).find((c) => c.slug === slug);
  return found ? found.name : 'Products';
}

/* ------------------------------------------------------------------ *
 * Lightweight inline SVG artwork (same visual language as the browser)
 * ------------------------------------------------------------------ */

function svgWrap(inner, label) {
  return '<svg viewBox="0 0 320 240" xmlns="http://www.w3.org/2000/svg" role="img" ' +
    'aria-label="' + esc(label || 'Industrial air filtration equipment') + '">' +
    '<g fill="none" stroke="' + INK + '" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">' +
    inner + '</g></svg>';
}

function artFor(item, label) {
  const cat = String(item && item.category || '').toLowerCase();
  let inner;
  if (cat.indexOf('wet') > -1 || cat.indexOf('downdraft') > -1) {
    inner = '<rect x="52" y="112" width="216" height="88" rx="6" fill="#fff"/>' +
      '<path d="M52 138 h216 M76 112 v-28 h168 v28" stroke-width="4"/>' +
      '<path d="M96 74 v-22 M140 74 v-22 M184 74 v-22 M228 74 v-22" stroke="' + ORANGE + '" stroke-width="3"/>' +
      '<circle cx="88" cy="166" r="12" fill="' + GREY + '" stroke="none"/>' +
      '<circle cx="160" cy="166" r="12" fill="' + GREY + '" stroke="none"/>' +
      '<circle cx="232" cy="166" r="12" fill="' + GREY + '" stroke="none"/>' +
      '<path d="M270 126 q18 -10 18 0 M270 148 q18 -10 18 0" stroke="' + ORANGE + '" stroke-width="2"/>';
  } else if (cat.indexOf('arm') > -1 || cat.indexOf('fume') > -1 || cat.indexOf('quick') > -1) {
    inner = '<rect x="52" y="104" width="112" height="96" rx="5" fill="#fff"/>' +
      '<rect x="66" y="120" width="84" height="12" rx="2" fill="' + GREY + '" stroke="none"/>' +
      '<rect x="66" y="140" width="84" height="12" rx="2" fill="' + GREY + '" stroke="none"/>' +
      '<rect x="66" y="160" width="84" height="12" rx="2" fill="' + GREY + '" stroke="none"/>' +
      '<circle cx="76" cy="204" r="9" fill="#fff"/><circle cx="140" cy="204" r="9" fill="#fff"/>' +
      '<path d="M164 128 L214 66 L264 82" stroke-width="8"/>' +
      '<circle cx="164" cy="128" r="8" fill="' + ORANGE + '" stroke="' + ORANGE + '"/>' +
      '<path d="M258 74 L296 58 L296 110 L258 96 Z" fill="#ffe3d2" stroke="' + ORANGE + '"/>' +
      '<path d="M300 68 q14 -10 14 0 M300 88 q14 -10 14 0" stroke="' + ORANGE + '" stroke-width="2"/>';
  } else {
    inner = '<rect x="72" y="60" width="176" height="140" rx="6" fill="#fff"/>' +
      '<rect x="88" y="80" width="144" height="18" rx="3" fill="' + GREY + '" stroke="none"/>' +
      '<rect x="88" y="108" width="144" height="18" rx="3" fill="' + GREY + '" stroke="none"/>' +
      '<rect x="88" y="136" width="144" height="18" rx="3" fill="' + GREY + '" stroke="none"/>' +
      '<path d="M96 176 h128" stroke="' + ORANGE + '" stroke-width="4"/>' +
      '<circle cx="96" cy="200" r="9" fill="#fff"/><circle cx="224" cy="200" r="9" fill="#fff"/>' +
      '<path d="M260 96 q20 -12 20 0 M260 118 q20 -12 20 0 M260 140 q20 -12 20 0" stroke="' + ORANGE + '" stroke-width="2"/>';
  }
  return svgWrap(inner, label || 'Industrial air filtration equipment');
}

function heroArt() {
  return '<svg viewBox="0 0 480 320" xmlns="http://www.w3.org/2000/svg" role="img" ' +
    'aria-label="Industrial dust collection system with extraction arm" ' +
    'style="width:100%;height:auto">' +
    '<g fill="none" stroke="#ffffff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" opacity=".92">' +
    '<rect x="58" y="128" width="146" height="150" rx="6" fill="rgba(255,255,255,.08)"/>' +
    '<rect x="76" y="150" width="110" height="16" rx="3"/><rect x="76" y="178" width="110" height="16" rx="3"/>' +
    '<rect x="76" y="206" width="110" height="16" rx="3"/>' +
    '<path d="M204 168 L288 92 L372 118" stroke-width="10"/>' +
    '<circle cx="204" cy="168" r="10" fill="' + ORANGE + '" stroke="' + ORANGE + '"/>' +
    '<path d="M366 106 L430 82 L430 168 L366 144 Z" fill="rgba(242,101,34,.35)" stroke="' + ORANGE + '"/>' +
    '<path d="M96 258 h70" stroke="' + ORANGE + '" stroke-width="5"/>' +
    '<circle cx="88" cy="278" r="11" fill="rgba(255,255,255,.12)"/>' +
    '<circle cx="174" cy="278" r="11" fill="rgba(255,255,255,.12)"/>' +
    '</g>' +
    '<g fill="none" stroke="#ffb98d" stroke-width="2" stroke-dasharray="6 8" opacity=".75">' +
    '<path d="M392 208 q-72 -20 -134 -66"/><path d="M418 216 q-72 -8 -146 -42"/></g>' +
    '</svg>';
}

function brandMark(size) {
  const s = size || 38;
  return '<svg width="' + s + '" height="' + s + '" viewBox="0 0 40 40" aria-hidden="true" ' +
    'xmlns="http://www.w3.org/2000/svg"><rect width="40" height="40" rx="7" fill="' + ORANGE + '"/>' +
    '<path d="M10 27 L20 12 L30 27 M15 22 h10" fill="none" stroke="#fff" stroke-width="3" ' +
    'stroke-linecap="round" stroke-linejoin="round"/></svg>';
}

function icon(name) {
  const paths = {
    pin: '<path d="M12 21s7-6.5 7-11a7 7 0 1 0-14 0c0 4.5 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
    phone: '<path d="M5 4h4l2 5-2.5 1.5a12 12 0 0 0 5 5L15 13l5 2v4a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1z"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    arrow: '<path d="M4 12h16 M14 6l6 6-6 6"/>',
    box: '<path d="M3 8l9-5 9 5v8l-9 5-9-5z M3 8l9 5 9-5 M12 13v8"/>'
  };
  return '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" ' +
    'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    (paths[name] || paths.box) + '</svg>';
}

/* ------------------------------------------------------------------ *
 * Header / footer
 * ------------------------------------------------------------------ */

function navLink(href, label, current) {
  return '<a href="' + href + '"' + (current === href ? ' aria-current="page"' : '') +
    '>' + esc(label) + '</a>';
}

function renderHeader(db, ctx) {
  const s = db.settings || {};
  const current = ctx.navCurrent || '';
  const cats = published(db.categories).sort(byOrder);
  const submenu = cats.slice(0, 10).map((c) =>
    '<a href="/collections/' + encodeURIComponent(c.slug) + '">' + esc(c.name) + '</a>').join('');

  const topbar = '<div class="topbar"><div class="container">' +
    '<div class="topbar-left">' +
    '<span><strong>' + esc(s.heroBadge || 'Fast Delivery') + '</strong></span>' +
    '<a href="mailto:' + esc(s.email) + '">' + esc(s.email) + '</a>' +
    '<span>' + esc(s.workingHours || '') + '</span>' +
    '</div><div class="topbar-left"><a href="tel:' +
    esc(String(s.phone || '').replace(/\s/g, '')) + '">' + esc(s.phone) + '</a></div></div></div>';

  const header = '<header class="site-header"><div class="container header-inner">' +
    '<a class="brand" href="/" aria-label="' + esc(s.shortName || 'Home') + '">' +
    brandMark() + '<span class="brand-text"><span class="brand-name">' +
    esc(s.shortName || 'Yuchuan Air') + '</span><span class="brand-sub">' +
    esc(s.tagline || 'Industrial Air Filtration') + '</span></span></a>' +
    '<button class="nav-toggle" type="button" aria-label="Open menu" aria-expanded="false" ' +
    'aria-controls="main-nav"><span></span></button>' +
    '<nav class="main-nav" id="main-nav" aria-label="Main navigation">' +
    '<button class="nav-close" type="button" aria-label="Close menu">&times;</button><ul>' +
    '<li>' + navLink('/', 'Home', current) + '</li>' +
    '<li class="has-sub">' + navLink('/products', 'Products', current) +
    '<div class="submenu">' + submenu + '</div></li>' +
    '<li>' + navLink('/applications', 'Applications', current) + '</li>' +
    '<li>' + navLink('/about', 'About Us', current) + '</li>' +
    '<li>' + navLink('/blog', 'Blog', current) + '</li>' +
    '<li>' + navLink('/contact', 'Contact', current) + '</li>' +
    '</ul></nav>' +
    '<a class="btn btn-primary btn-small header-cta" href="/contact">Request a Quote</a>' +
    '</div></header><div class="nav-overlay" aria-hidden="true"></div>';

  return topbar + header;
}

function renderFooter(db) {
  const s = db.settings || {};
  const catLinks = published(db.categories).sort(byOrder).slice(0, 6).map((c) =>
    '<li><a href="/collections/' + encodeURIComponent(c.slug) + '">' + esc(c.name) + '</a></li>').join('');
  const social = [s.linkedinUrl, s.youtubeUrl, s.facebookUrl].filter(Boolean)
    .map((url) => '<li><a href="' + esc(url) + '" rel="me noopener">' + esc(url.replace(/^https?:\/\//, '').split('/')[0]) + '</a></li>')
    .join('');

  return '<footer class="site-footer"><div class="container"><div class="footer-grid">' +
    '<div><div class="footer-brand">' + brandMark(38) +
    '<span class="brand-text"><span class="brand-name">' + esc(s.shortName || 'Yuchuan Air') +
    '</span><span class="brand-sub">' + esc(s.tagline || '') + '</span></span></div>' +
    '<p>' + esc(s.footerNote || '') + '</p>' +
    '<p style="font-size:.78rem;opacity:.8">' + esc(s.companyName || '') + '</p></div>' +
    '<div><h3>Products</h3><ul class="footer-links">' + catLinks +
    '<li><a href="/products">All Products</a></li></ul></div>' +
    '<div><h3>Company</h3><ul class="footer-links">' +
    '<li><a href="/about">About Us</a></li>' +
    '<li><a href="/applications">Applications</a></li>' +
    '<li><a href="/blog">Blog &amp; Insights</a></li>' +
    '<li><a href="/contact">Request a Quote</a></li>' +
    '<li><a href="/llms.txt">AI/LLM Site Summary</a></li>' +
    (social ? '<li><a href="/sitemap.xml">Sitemap</a></li>' : '<li><a href="/sitemap.xml">Sitemap</a></li>') +
    '</ul></div>' +
    '<div><h3>Get in Touch</h3><ul class="footer-links footer-contact">' +
    '<li>' + icon('pin') + '<span>' + esc(s.address || '') + '</span></li>' +
    '<li>' + icon('mail') + '<a href="mailto:' + esc(s.email) + '">' + esc(s.email) + '</a></li>' +
    '<li>' + icon('phone') + '<a href="tel:' + esc(String(s.phone || '').replace(/\s/g, '')) + '">' + esc(s.phone) + '</a></li>' +
    (s.whatsapp ? '<li>' + icon('phone') + '<a href="https://wa.me/' +
      esc(String(s.whatsapp).replace(/[^0-9]/g, '')) + '" rel="noopener">WhatsApp: ' + esc(s.whatsapp) + '</a></li>' : '') +
    (social ? social : '') +
    '</ul></div></div>' +
    '<div class="footer-bottom"><span>&copy; ' + new Date().getFullYear() + ' ' +
    esc(s.companyName || '') + '. All rights reserved.</span>' +
    '<span>' + esc(s.certifications || '') + ' &nbsp;|&nbsp; <a href="/sitemap.xml">Sitemap</a>' +
    ' &nbsp;|&nbsp; <a href="/privacy">Privacy Policy</a>' +
    ' &nbsp;|&nbsp; <a href="#cookies" data-yc-consent>Cookie settings</a></span>' +
    '</div></div></footer>';
}

/* ------------------------------------------------------------------ *
 * Cards & blocks
 * ------------------------------------------------------------------ */

function renderStats(db) {
  const stats = (db.settings || {}).stats;
  if (!Array.isArray(stats) || !stats.length) return '';
  return stats.map((item) => '<div class="stat"><div class="stat-value">' +
    esc(item.value) + '</div><div class="stat-label">' + esc(item.label) + '</div></div>').join('');
}

function renderProductCard(db, item, base) {
  const url = '/products/' + encodeURIComponent(item.slug);
  const visual = item.image
    ? '<img src="' + esc(item.image) + '" alt="' + esc(item.name) + '" width="640" height="480" loading="lazy">'
    : artFor(item, item.name);
  void base;
  return '<article class="card"><a class="card-visual" href="' + url + '" aria-label="' +
    esc(item.name) + '">' + visual + '</a><div class="card-body">' +
    '<div class="card-series">' + esc(item.series || categoryName(db, item.category)) + '</div>' +
    '<h3 class="card-title"><a href="' + url + '">' + esc(item.name) + '</a></h3>' +
    '<p class="card-text">' + esc(truncate(item.summary, 135)) + '</p>' +
    '<a class="card-link" href="' + url + '">Explore product</a></div></article>';
}

function renderPostCard(item) {
  const url = '/blog/' + encodeURIComponent(item.slug);
  const cover = item.cover
    ? '<img src="' + esc(item.cover) + '" alt="' + esc(item.title) +
      '" width="640" height="360" loading="lazy">'
    : svgWrap('<rect x="86" y="42" width="148" height="156" rx="6" fill="#fff"/>' +
      '<path d="M112 78 h96 M112 104 h96 M112 130 h70" stroke="' + GREY + '" stroke-width="7"/>' +
      '<rect x="86" y="42" width="148" height="18" rx="6" fill="' + ORANGE + '" stroke="' + ORANGE + '"/>', item.title);
  return '<article class="card post-card"><a class="card-visual post-cover" href="' + url +
    '" aria-label="' + esc(item.title) + '">' + cover + '</a><div class="card-body">' +
    '<div class="post-meta">' + esc(formatDate(item.date)) + ' &nbsp;&middot;&nbsp; ' +
    esc(item.category || 'Insights') + '</div>' +
    '<h3 class="card-title"><a href="' + url + '">' + esc(item.title) + '</a></h3>' +
    '<p class="card-text">' + esc(truncate(item.excerpt, 145)) + '</p>' +
    '<a class="card-link" href="' + url + '">Read article</a></div></article>';
}

function renderAppCard(item) {
  return '<article class="app-card"><h3>' + esc(item.name) + '</h3><p>' +
    esc(item.description) + '</p></article>';
}

/* ------------------------------------------------------------------ *
 * Full detail pages
 * ------------------------------------------------------------------ */

function answerFirst(item, db) {
  // A short, self-contained, quotable answer. GEO systems extract these
  // "answer-first" paragraphs far more reliably than marketing prose.
  const s = db.settings || {};
  const cat = categoryName(db, item.category);
  const airflow = (Array.isArray(item.specs) ? item.specs : [])
    .find((row) => /airflow/i.test(String(row.k || '')));
  return '<p class="geo-answer"><strong>' + esc(item.name) + '</strong> is a ' +
    esc(cat.toLowerCase()) + ' system manufactured by ' + esc(s.companyName || s.shortName || 'Yuchuan Air') +
    ' for ' + esc((Array.isArray(item.applications) && item.applications[0]) || 'industrial') +
    ' applications' + (airflow ? ', rated at ' + esc(airflow.v) : '') +
    '. ' + esc(item.summary || '') + '</p>';
}

function renderProductDetail(db, item, related, base) {
  const specs = Array.isArray(item.specs) ? item.specs : [];
  const features = Array.isArray(item.features) ? item.features : [];
  const apps = Array.isArray(item.applications) ? item.applications : [];
  const visual = item.image
    ? '<img src="' + esc(item.image) + '" alt="' + esc(item.name) + '" width="800" height="600">'
    : artFor(item, item.name);

  let html = '<section class="section"><div class="container"><div class="detail-grid">' +
    '<div class="detail-visual">' + visual + '</div>' +
    '<div><div class="detail-series">' + esc(item.series || categoryName(db, item.category)) + '</div>' +
    '<h1 class="detail-title">' + esc(item.name) + '</h1>' +
    '<p class="detail-summary">' + esc(item.summary) + '</p>' +
    '<div class="center-actions" style="justify-content:flex-start;margin-top:1.5rem">' +
    '<a class="btn btn-primary" href="/contact?product=' + encodeURIComponent(item.name) + '">Request a Quote</a>' +
    '<a class="btn btn-outline-dark btn-small" href="/products">All Products</a></div>' +
    '</div></div></div></section>' +
    '<div class="section--tight"><div class="container-narrow">' +
    '<h2>Product Overview</h2>' + answerFirst(item, db) +
    '<p>' + esc(item.description) + '</p>' +
    (features.length ? '<h2 style="margin-top:2.2rem">Key Features</h2><ul class="check-list">' +
      features.map((f) => '<li>' + esc(f) + '</li>').join('') + '</ul>' : '') +
    '</div></div>' +
    '<div class="section section--grey"><div class="container"><div class="split">' +
    '<div><span class="eyebrow">Technical Data</span><h2 class="section-title">Specifications</h2>' +
    '<table class="spec-table"><tbody>' + specs.map((row) =>
      '<tr><th>' + esc(row.k) + '</th><td>' + esc(row.v) + '</td></tr>').join('') +
    '</tbody></table></div>' +
    '<div><span class="eyebrow">Typical Uses</span><h2 class="section-title">Applications</h2>' +
    '<p class="section-lead">Engineered for the following processes. Contact us if your application is not listed - most systems can be configured to order.</p>' +
    '<div style="margin-top:1.4rem">' + apps.map((a) => '<span class="tag">' + esc(a) + '</span>').join('') + '</div>' +
    '<p style="margin-top:2rem"><a class="btn btn-outline-dark" href="/applications">See all applications</a></p>' +
    '</div></div></div></div>';

  if (related && related.length) {
    html += '<div class="section"><div class="container">' +
      '<div class="section-head"><span class="eyebrow">You May Also Like</span>' +
      '<h2 class="section-title">Related Products</h2></div>' +
      '<div class="card-grid">' + related.map((p) => renderProductCard(db, p, base)).join('') +
      '</div></div></div>';
  }
  return html;
}

function renderPostDetail(db, item, recent, base) {
  const cover = item.cover
    ? '<div style="margin:1.5rem 0 2rem;border-radius:6px;overflow:hidden">' +
      '<img src="' + esc(item.cover) + '" alt="' + esc(item.title) + '" width="1200" height="600"></div>'
    : '';
  let html = '<div class="container-narrow article">' +
    '<div class="article-meta">' + esc(formatDate(item.date)) + ' &nbsp;&middot;&nbsp; ' +
    esc(item.category || 'Insights') + ' &nbsp;&middot;&nbsp; ' + esc(item.author || '') + '</div>' +
    '<h1 style="font-size:clamp(1.9rem,4vw,2.8rem);text-transform:none">' + esc(item.title) + '</h1>' +
    cover +
    '<p style="font-size:1.15rem;color:#5a6f7e">' + esc(item.excerpt) + '</p>' +
    // Article HTML is authored by trusted administrators in the CMS.
    '<div class="article-body">' + String(item.content || '') + '</div>' +
    '<div style="margin-top:3rem;padding-top:1.5rem;border-top:1px solid #dde5ea">' +
    '<a class="btn btn-outline-dark btn-small" href="/blog">&larr; Back to Blog</a></div></div>';

  if (recent && recent.length) {
    html += '<div class="section section--grey"><div class="container">' +
      '<div class="section-head"><span class="eyebrow">Keep Reading</span>' +
      '<h2 class="section-title">Latest Insights</h2></div>' +
      '<div class="card-grid">' + recent.map((p) => renderPostCard(p)).join('') +
      '</div></div></div>';
  }
  void base;
  return html;
}

function renderContactInfo(db) {
  const s = db.settings || {};
  const rows = [
    { icon: 'pin', label: 'Head Office', value: s.address },
    { icon: 'mail', label: 'Email', value: s.email, href: 'mailto:' + (s.email || '') },
    { icon: 'phone', label: 'Phone', value: s.phone, href: 'tel:' + String(s.phone || '').replace(/\s/g, '') },
    {
      icon: 'phone', label: 'WhatsApp', value: s.whatsapp,
      href: s.whatsapp ? 'https://wa.me/' + String(s.whatsapp).replace(/[^0-9]/g, '') : ''
    },
    { icon: 'clock', label: 'Working Hours', value: s.workingHours }
  ];
  return rows.filter((r) => r.value).map((r) => {
    const content = r.href
      ? '<a href="' + esc(r.href) + '">' + esc(r.value) + '</a>'
      : esc(r.value);
    return '<div class="info-row"><span class="info-icon">' + icon(r.icon) + '</span>' +
      '<div><h3>' + esc(r.label) + '</h3><p>' + content + '</p></div></div>';
  }).join('');
}

/* ------------------------------------------------------------------ *
 * FAQ block (visible to users AND extractable by AI answer engines)
 * ------------------------------------------------------------------ */

function pageFaqs(db, ctx) {
  const all = published(db.faqs).sort(byOrder);
  const scope = String(ctx.faqScope || 'general');
  const exact = all.filter((f) => String(f.scope || 'general') === scope);
  const chosen = exact.length ? exact : all.filter((f) => String(f.scope || 'general') === 'general');
  return chosen.slice(0, 8);
}

function renderFaqSection(faqs, title) {
  if (!faqs.length) return '';
  return '<section class="section section--grey faq-section" id="faq"><div class="container-narrow">' +
    '<div class="section-head"><span class="eyebrow">Buyer Questions</span>' +
    '<h2 class="section-title">' + esc(title || 'Frequently Asked Questions') + '</h2></div>' +
    '<div class="faq-list">' + faqs.map((f) =>
      '<details class="faq-item"><summary class="faq-q"><h3>' + esc(f.question) +
      '</h3><span class="faq-toggle" aria-hidden="true">+</span></summary>' +
      '<div class="faq-a"><p>' + esc(f.answer) + '</p></div></details>').join('') +
    '</div></div></section>';
}

function faqJsonLd(faqs) {
  if (!faqs.length) return null;
  return {
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f.question,
      acceptedAnswer: { '@type': 'Answer', text: f.answer }
    }))
  };
}

/* ------------------------------------------------------------------ *
 * Build the complete set of HTML fragments for one request
 * ------------------------------------------------------------------ */

function buildFragments(db, ctx, base) {
  const s = db.settings || {};
  const products = published(db.products).sort(byOrder);
  const posts = published(db.posts).sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  const cats = published(db.categories).sort(byOrder);
  const apps = published(db.applications).sort(byOrder);
  const frag = { header: renderHeader(db, ctx), footer: renderFooter(db), fills: {}, hosts: {}, extra: '' };

  // data-fill text nodes
  Object.keys(s).forEach((key) => { frag.fills[key] = String(s[key]); });

  switch (ctx.page) {
    case 'home': {
      frag.hosts['hero-art'] = heroArt();
      frag.hosts['stats-grid'] = renderStats(db);
      frag.hosts['featured-products'] = products.filter((p) => p.featured === true).slice(0, 6)
        .map((p) => renderProductCard(db, p, base)).join('') ||
        products.slice(0, 6).map((p) => renderProductCard(db, p, base)).join('');
      const counts = {};
      products.forEach((p) => { counts[p.category] = (counts[p.category] || 0) + 1; });
      frag.hosts['category-grid'] = cats.map((c) =>
        '<a class="tile" href="/collections/' + encodeURIComponent(c.slug) + '">' +
        '<span class="tile-icon">' + icon('box') + '</span>' +
        '<span class="tile-name">' + esc(c.name) + '</span>' +
        '<span class="tile-count">' + (counts[c.slug] || 0) +
        ' model' + ((counts[c.slug] || 0) === 1 ? '' : 's') + '</span></a>').join('');
      frag.hosts['applications-grid'] = apps.slice(0, 6).map(renderAppCard).join('');
      frag.hosts['latest-posts'] = posts.slice(0, 3).map(renderPostCard).join('');
      break;
    }
    case 'products': {
      const q = String(ctx.query.get('q') || '').trim().toLowerCase();
      const cat = String(ctx.query.get('category') || '');
      let list = products;
      if (cat) list = list.filter((p) => p.category === cat);
      if (q) list = list.filter((p) => [p.name, p.series, p.category, p.summary, p.description,
        (p.features || []).join(' '), (p.applications || []).join(' ')].join(' ').toLowerCase().includes(q));
      frag.hosts['product-list'] = list.length
        ? list.map((p) => renderProductCard(db, p, base)).join('')
        : '<div class="empty-state">No products match your filters. <a href="/products">Clear filters</a></div>';
      frag.hosts['result-count'] = 'Showing ' + list.length + ' product' + (list.length === 1 ? '' : 's');
      frag.hosts['filter-category'] = '<option value="">All Categories</option>' +
        cats.map((c) => '<option value="' + esc(c.slug) + '"' + (c.slug === cat ? ' selected' : '') +
          '>' + esc(c.name) + '</option>').join('');
      break;
    }
    case 'collection': {
      const list = products.filter((p) => p.category === ctx.category.slug);
      frag.hosts['product-list'] = list.map((p) => renderProductCard(db, p, base)).join('');
      frag.hosts['result-count'] = 'Showing ' + list.length + ' product' + (list.length === 1 ? '' : 's');
      frag.hosts['filter-category'] = '<option value="">All Categories</option>' +
        cats.map((c) => '<option value="' + esc(c.slug) + '"' +
          (c.slug === ctx.category.slug ? ' selected' : '') + '>' + esc(c.name) + '</option>').join('');
      frag.replaceH1 = esc(ctx.category.name);
      frag.replaceLead = esc(ctx.category.description || ctx.description);
      break;
    }
    case 'product': {
      const related = products.filter((p) => p.category === ctx.item.category && p.id !== ctx.item.id).slice(0, 3);
      frag.hosts['product-detail'] = renderProductDetail(db, ctx.item, related, base);
      frag.hosts['breadcrumb-current'] = ctx.item.name;
      frag.replaceH1 = esc(ctx.item.name);
      frag.replaceLead = esc(ctx.item.summary || '');
      break;
    }
    case 'post': {
      const recent = posts.filter((p) => p.id !== ctx.item.id).slice(0, 3);
      frag.hosts['post-detail'] = renderPostDetail(db, ctx.item, recent, base);
      frag.hosts['breadcrumb-current'] = ctx.item.title;
      frag.replaceH1 = esc(ctx.item.title);
      break;
    }
    case 'applications':
      frag.hosts['applications-list'] = apps.map(renderAppCard).join('');
      break;
    case 'about':
      frag.hosts['stats-grid'] = renderStats(db);
      frag.hosts['about-certifications'] = esc(s.certifications || '');
      break;
    case 'blog': {
      const q = String(ctx.query.get('q') || '').trim().toLowerCase();
      const list = q
        ? posts.filter((p) => [p.title, p.excerpt, p.content, p.category].join(' ').toLowerCase().includes(q))
        : posts;
      frag.hosts['post-list'] = list.map(renderPostCard).join('');
      frag.hosts['result-count'] = 'Showing ' + list.length + ' article' + (list.length === 1 ? '' : 's');
      break;
    }
    case 'contact':
      frag.hosts['contact-info'] = renderContactInfo(db);
      break;
    default:
      break;
  }

  const faqs = pageFaqs(db, ctx);
  if (faqs.length) frag.extra = renderFaqSection(faqs, ctx.faqTitle);
  frag.faqs = faqs;
  return frag;
}

module.exports = {
  esc,
  truncate,
  published,
  byOrder,
  categoryName,
  artFor,
  heroArt,
  brandMark,
  icon,
  renderHeader,
  renderFooter,
  renderProductCard,
  renderPostCard,
  renderFaqSection,
  faqJsonLd,
  buildFragments
};
