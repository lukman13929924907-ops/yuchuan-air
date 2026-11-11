'use strict';

/**
 * SEO + GEO layer.
 *
 * Responsibilities:
 *   - Resolve a request path into a page context (title, canonical, entity).
 *   - Inject complete, absolute-URL metadata and JSON-LD into the HTML head.
 *   - Inject server-rendered visible content into the HTML body.
 *   - Emit robots.txt, sitemap.xml, llms.txt and llms-full.txt.
 *
 * All values come from data/db.json so administrators can change them from
 * the /admin panel without touching code. Zero third-party dependencies.
 */

const render = require('./render');

const esc = render.esc;
const TEXT_HOSTS = { 'result-count': true, 'breadcrumb-current': true, 'about-certifications': true };
const ID_SAFE = /^[A-Za-z0-9_\-]+$/;

/* ------------------------------------------------------------------ *
 * URL helpers
 * ------------------------------------------------------------------ */

function siteBaseUrl(req, db) {
  const configured = String((db.settings || {}).siteUrl || '').trim().replace(/\/+$/, '');
  if (configured) return configured;
  const fwdHost = String(req.headers['x-forwarded-host'] || '').split(',')[0].trim();
  const host = fwdHost || req.headers.host || 'localhost';
  const fwdProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const proto = fwdProto || (req.socket && req.socket.encrypted ? 'https' : 'http');
  return proto + '://' + host;
}

function absolute(base, value) {
  const str = String(value || '');
  if (/^https?:\/\//i.test(str)) return str;
  return base + (str.charAt(0) === '/' ? str : '/' + str);
}

function isoDay(value) {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

function escapeXml(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;'
  }[ch]));
}

function decodeSlug(value) {
  try { return decodeURIComponent(value); } catch (err) { return ''; }
}

function stripHtml(value) {
  return String(value || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ').trim();
}

/* ------------------------------------------------------------------ *
 * Page context
 * ------------------------------------------------------------------ */

function resolveContext(db, pathname, query) {
  const s = db.settings || {};
  const short = s.shortName || 'Yuchuan Air';
  const defDesc = s.seoDescription || '';
  const products = render.published(db.products);
  const posts = render.published(db.posts);
  const cats = render.published(db.categories);
  let p = pathname.replace(/\/+$/, '') || '/';
  if (p.endsWith('.html')) p = p.slice(0, -5) || '/';

  const ctx = {
    page: '', template: '', path: p, query,
    title: s.seoTitle || (short + ' - Industrial Air Filtration'),
    description: defDesc,
    navCurrent: '', faqScope: 'general', faqTitle: 'Frequently Asked Questions',
    noindex: false, item: null, category: null, crumbs: []
  };

  const crumb = (name, url) => ({ name, url });

  if (p === '/') {
    ctx.page = 'home'; ctx.template = 'index.html'; ctx.navCurrent = '/';
    ctx.title = s.seoTitle || short + ' | Industrial Air Filtration & Dust Collection Systems';
    ctx.crumbs = [crumb('Home', '/')];
  } else if (p === '/products') {
    ctx.page = 'products'; ctx.template = 'products.html'; ctx.navCurrent = '/products';
    ctx.title = 'Industrial Air Filtration & Dust Collection Equipment | ' + short;
    ctx.description = 'Browse ' + products.length + ' industrial air filtration systems from ' +
      (s.companyName || short) + ': welding fume extractors, cartridge and wet dust collectors, ' +
      'downdraft tables, extraction arms, oil mist collectors and ambient air cleaners.';
    ctx.crumbs = [crumb('Home', '/'), crumb('Products', '/products')];
    const cat = query.get('category');
    if (cat) {
      ctx.canonicalOverride = '/collections/' + encodeURIComponent(cat);
      ctx.noindex = true;
    } else if (query.get('q')) {
      ctx.noindex = true;
    }
  } else if (p.startsWith('/collections/')) {
    const slug = decodeSlug(p.slice('/collections/'.length));
    const cat = cats.find((c) => c.slug === slug);
    if (!cat) return null;
    ctx.page = 'collection'; ctx.template = 'products.html'; ctx.navCurrent = '/products';
    // Reuse the products controller so client-side filters still work.
    ctx.ssrPage = 'products';
    ctx.category = cat;
    ctx.title = cat.seoTitle || (cat.name + ' | ' + short);
    ctx.description = cat.seoDescription || cat.description ||
      (cat.name + ' from ' + (s.companyName || short) +
        '. Compare models, specifications and request a quotation for your application.');
    ctx.faqScope = 'products'; ctx.faqTitle = cat.name + ' - Common Questions';
    ctx.crumbs = [crumb('Home', '/'), crumb('Products', '/products'), crumb(cat.name, p)];
  } else if (p.startsWith('/products/')) {
    const slug = decodeSlug(p.slice('/products/'.length));
    const item = products.find((x) => x.slug === slug);
    if (!item) return null;
    ctx.page = 'product'; ctx.template = 'product.html'; ctx.navCurrent = '/products';
    ctx.item = item;
    ctx.title = item.seoTitle || (item.name + ' - Specifications & Quote | ' + short);
    ctx.description = item.seoDescription || item.summary || defDesc;
    ctx.faqScope = 'products'; ctx.faqTitle = item.name + ' - Common Questions';
    ctx.crumbs = [crumb('Home', '/'), crumb('Products', '/products'),
      crumb(render.categoryName(db, item.category), '/collections/' + encodeURIComponent(item.category)),
      crumb(item.name, p)];
  } else if (p === '/applications') {
    ctx.page = 'applications'; ctx.template = 'applications.html'; ctx.navCurrent = '/applications';
    ctx.title = 'Industrial Air Filtration Applications by Process | ' + short;
    ctx.description = 'Capture-at-source solutions for welding, grinding, metalworking, woodworking, ' +
      'painting, CNC machining and combustible dust. Match the process to the right equipment.';
    ctx.crumbs = [crumb('Home', '/'), crumb('Applications', '/applications')];
  } else if (p === '/about') {
    ctx.page = 'about'; ctx.template = 'about.html'; ctx.navCurrent = '/about';
    ctx.title = 'About ' + (s.companyName || short) + ' | Industrial Air Filtration Manufacturer';
    ctx.description = (s.companyName || short) + ' is a China-based manufacturer of industrial ' +
      'dust collection, welding fume extraction and energy-saving air filtration equipment, ' +
      'serving customers worldwide.';
    ctx.faqScope = 'company'; ctx.faqTitle = 'About Us - Common Questions';
    ctx.crumbs = [crumb('Home', '/'), crumb('About Us', '/about')];
  } else if (p === '/blog') {
    ctx.page = 'blog'; ctx.template = 'blog.html'; ctx.navCurrent = '/blog';
    ctx.title = 'Industrial Air Filtration Engineering Guides | ' + short;
    ctx.description = 'Technical guides on dust collection, welding fume control, filtration ' +
      'technology, OSHA and ATEX compliance, maintenance and energy saving.';
    ctx.crumbs = [crumb('Home', '/'), crumb('Blog & Insights', '/blog')];
    if (query.get('q')) ctx.noindex = true;
  } else if (p.startsWith('/blog/')) {
    const slug = decodeSlug(p.slice('/blog/'.length));
    const item = posts.find((x) => x.slug === slug);
    if (!item) return null;
    ctx.page = 'post'; ctx.template = 'post.html'; ctx.navCurrent = '/blog';
    ctx.item = item;
    ctx.title = item.seoTitle || (item.title + ' | ' + short);
    ctx.description = item.seoDescription || item.excerpt || defDesc;
    ctx.faqScope = 'resources'; ctx.faqTitle = 'Related Questions';
    ctx.crumbs = [crumb('Home', '/'), crumb('Blog', '/blog'), crumb(item.title, p)];
  } else if (p === '/contact') {
    ctx.page = 'contact'; ctx.template = 'contact.html'; ctx.navCurrent = '/contact';
    ctx.title = 'Request a Quote | Industrial Dust Collector Supplier - ' + short;
    ctx.description = 'Request a quotation from ' + (s.companyName || short) +
      ' for industrial dust collectors, fume extractors and air filtration systems. ' +
      'Tell us your process and our engineers will recommend a right-sized solution.';
    ctx.faqScope = 'company'; ctx.faqTitle = 'Before You Enquire';
    ctx.crumbs = [crumb('Home', '/'), crumb('Contact', '/contact')];
  } else if (p === '/privacy') {
    ctx.page = 'privacy'; ctx.template = 'privacy.html'; ctx.navCurrent = '';
    ctx.title = 'Privacy Policy | ' + short;
    ctx.description = 'How ' + (s.companyName || short) +
      ' handles enquiry data, cookies and analytics, and how to exercise your privacy rights.';
    ctx.crumbs = [crumb('Home', '/'), crumb('Privacy Policy', '/privacy')];
  } else {
    return null;
  }
  return ctx;
}

/* ------------------------------------------------------------------ *
 * JSON-LD
 * ------------------------------------------------------------------ */

function credentialsNode(s) {
  const list = String(s.certifications || '')
    .split(/\s*\/\s*/)
    .map((x) => x.trim())
    .filter(Boolean);
  if (!list.length) return null;
  return list.map((name) => ({
    '@type': 'EducationalOccupationalCredential',
    credentialCategory: 'certification',
    name: name
  }));
}

function organizationNode(db, base) {
  const s = db.settings || {};
  const sameAs = [s.linkedinUrl, s.facebookUrl, s.youtubeUrl, s.twitterUrl]
    .filter((x) => x && /^https?:\/\//i.test(String(x)));
  const node = {
    '@type': 'Organization',
    '@id': base + '/#organization',
    name: s.shortName || 'Yuchuan Air',
    legalName: s.companyName || s.shortName || 'Yuchuan Air',
    url: base + '/',
    description: s.seoDescription || '',
    email: s.email || '',
    telephone: s.phone || '',
    foundingDate: s.founded || undefined,
    address: {
      '@type': 'PostalAddress',
      streetAddress: s.address || '',
      addressLocality: s.addressLocality || '',
      addressRegion: s.addressRegion || '',
      addressCountry: s.addressCountry || 'CN'
    },
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'sales',
      email: s.email || '',
      telephone: s.phone || '',
      availableLanguage: ['English', 'Chinese'],
      areaServed: 'Worldwide'
    }
  };
  if (s.logoUrl || s.ogImage) {
    node.logo = { '@type': 'ImageObject', url: absolute(base, s.logoUrl || s.ogImage) };
  }
  const credentials = credentialsNode(s);
  if (credentials) node.hasCredential = credentials;
  if (sameAs.length) node.sameAs = sameAs;
  return node;
}

function websiteNode(db, base) {
  const s = db.settings || {};
  return {
    '@type': 'WebSite',
    '@id': base + '/#website',
    url: base + '/',
    name: s.shortName || 'Yuchuan Air',
    publisher: { '@id': base + '/#organization' },
    inLanguage: 'en',
    potentialAction: {
      '@type': 'SearchAction',
      target: { '@type': 'EntryPoint', urlTemplate: base + '/products?q={search_term_string}' },
      'query-input': 'required name=search_term_string'
    }
  };
}

function breadcrumbNode(ctx, base) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: ctx.crumbs.map((c, i) => ({
      '@type': 'ListItem', position: i + 1, name: c.name,
      item: absolute(base, c.url)
    }))
  };
}

function pageNodes(db, ctx, base, frag) {
  const s = db.settings || {};
  const nodes = [];
  const orgId = { '@id': base + '/#organization' };
  const canonical = absolute(base, ctx.canonicalOverride || ctx.path);

  if (ctx.page === 'product') {
    const p = ctx.item;
    const node = {
      '@type': 'Product',
      '@id': canonical + '#product',
      name: p.name,
      sku: p.slug,
      url: canonical,
      description: p.summary || p.description || '',
      category: render.categoryName(db, p.category),
      brand: { '@type': 'Brand', name: s.shortName || 'Yuchuan Air' },
      manufacturer: orgId,
      isRelatedTo: undefined,
      additionalProperty: (Array.isArray(p.specs) ? p.specs : []).map((row) => ({
        '@type': 'PropertyValue', name: row.k, value: row.v
      }))
    };
    if (p.image) node.image = absolute(base, p.image);
    if (Array.isArray(p.applications) && p.applications.length) {
      node.audience = {
        '@type': 'BusinessAudience',
        audienceType: p.applications.join(', ')
      };
    }
    nodes.push(node);
    nodes.push({
      '@type': 'WebPage', '@id': canonical + '#webpage', url: canonical,
      name: p.name, isPartOf: { '@id': base + '/#website' },
      primaryImageOfPage: p.image ? { '@type': 'ImageObject', url: absolute(base, p.image) } : undefined,
      dateModified: isoDay(s.contentUpdatedAt) || undefined,
      breadcrumb: { '@id': canonical + '#breadcrumb' }
    });
  } else if (ctx.page === 'post') {
    const p = ctx.item;
    nodes.push({
      '@type': 'BlogPosting',
      '@id': canonical + '#article',
      headline: p.title,
      description: p.excerpt || '',
      url: canonical,
      mainEntityOfPage: canonical,
      datePublished: isoDay(p.date) || undefined,
      dateModified: isoDay(p.dateModified || p.date || s.contentUpdatedAt) || undefined,
      inLanguage: 'en',
      articleSection: p.category || 'Engineering Guide',
      author: { '@type': 'Organization', name: p.author || s.companyName || s.shortName },
      publisher: orgId
    });
    if (p.cover) nodes[nodes.length - 1].image = absolute(base, p.cover);
  } else if (ctx.page === 'collection') {
    const list = render.published(db.products).filter((p) => p.category === ctx.category.slug);
    nodes.push({
      '@type': 'CollectionPage', '@id': canonical + '#webpage', url: canonical,
      name: ctx.category.name, description: ctx.description,
      isPartOf: { '@id': base + '/#website' },
      mainEntity: {
        '@type': 'ItemList',
        numberOfItems: list.length,
        itemListElement: list.map((p, i) => ({
          '@type': 'ListItem', position: i + 1, name: p.name,
          url: absolute(base, '/products/' + encodeURIComponent(p.slug))
        }))
      }
    });
  } else if (ctx.page === 'home') {
    nodes.push({
      '@type': 'WebPage', '@id': canonical + '#webpage', url: canonical,
      name: ctx.title, isPartOf: { '@id': base + '/#website' },
      about: orgId
    });
  } else if (ctx.page === 'contact') {
    nodes.push({
      '@type': 'ContactPage', '@id': canonical + '#webpage', url: canonical,
      name: ctx.title, isPartOf: { '@id': base + '/#website' },
      mainEntity: orgId
    });
  } else if (ctx.page === 'products' || ctx.page === 'blog') {
    const list = ctx.page === 'products'
      ? render.published(db.products)
      : render.published(db.posts);
    nodes.push({
      '@type': 'CollectionPage', '@id': canonical + '#webpage', url: canonical,
      name: ctx.title, description: ctx.description,
      mainEntity: {
        '@type': 'ItemList', numberOfItems: list.length,
        itemListElement: list.slice(0, 30).map((item, i) => ({
          '@type': 'ListItem', position: i + 1,
          name: item.name || item.title,
          url: absolute(base, (ctx.page === 'products' ? '/products/' : '/blog/') + encodeURIComponent(item.slug))
        }))
      }
    });
  }

  if (frag && frag.faqs && frag.faqs.length) {
    const faq = render.faqJsonLd(frag.faqs);
    if (faq) nodes.push(faq);
  }
  return nodes;
}

function jsonLdScript(db, ctx, base, frag) {
  const graph = [
    organizationNode(db, base),
    websiteNode(db, base),
    Object.assign(breadcrumbNode(ctx, base), {
      '@id': absolute(base, ctx.canonicalOverride || ctx.path) + '#breadcrumb'
    })
  ].concat(pageNodes(db, ctx, base, frag));

  const cleaned = JSON.parse(JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }));
  // Prevent an admin-authored string from terminating the script element.
  const json = JSON.stringify(cleaned).replace(/</g, '\\u003c');
  return '<script type="application/ld+json">' + json + '</script>';
}

/* ------------------------------------------------------------------ *
 * Head injection
 * ------------------------------------------------------------------ */

function trackingScripts(settings) {
  const s = settings || {};
  const out = [];
  const track = {};
  if (ID_SAFE.test(String(s.gaMeasurementId || ''))) track.ga = s.gaMeasurementId;
  if (ID_SAFE.test(String(s.googleAdsId || ''))) track.adsId = s.googleAdsId;
  if (ID_SAFE.test(String(s.googleAdsConversionLabel || ''))) track.adsLabel = s.googleAdsConversionLabel;
  if (ID_SAFE.test(String(s.metaPixelId || ''))) track.meta = s.metaPixelId;
  if (ID_SAFE.test(String(s.linkedinPartnerId || ''))) track.linkedin = String(s.linkedinPartnerId);
  if (ID_SAFE.test(String(s.gtmContainerId || ''))) track.gtm = String(s.gtmContainerId);

  const consentRequired = s.cookieConsentEnabled !== false;
  track.consentRequired = consentRequired;
  track.hasOptional = Boolean(track.ga || track.adsId || track.gtm || track.meta || track.linkedin);

  // Google Consent Mode v2: the default command MUST run before any Google tag.
  // Storage stays denied until consent.js issues an 'update' after acceptance.
  if (consentRequired && track.hasOptional) {
    out.push('<script>window.dataLayer=window.dataLayer||[];' +
      'window.gtag=window.gtag||function(){window.dataLayer.push(arguments);};' +
      'window.gtag("consent","default",{"ad_storage":"denied","ad_user_data":"denied",' +
      '"ad_personalization":"denied","analytics_storage":"denied",' +
      '"functionality_storage":"granted","personalization_storage":"denied",' +
      '"security_storage":"granted","wait_for_update":500});</script>');
  }

  if (track.ga) {
    out.push('<link rel="preconnect" href="https://www.google-analytics.com">');
    out.push('<script async src="https://www.googletagmanager.com/gtag/js?id=' + esc(track.ga) + '"></script>');
    out.push('<script>window.dataLayer=window.dataLayer||[];' +
      'window.gtag=window.gtag||function(){window.dataLayer.push(arguments);};' +
      'window.gtag("js",new Date());window.gtag("config",' + JSON.stringify(track.ga) + ');' +
      (track.adsId ? 'window.gtag("config",' + JSON.stringify(track.adsId) + ');' : '') + '</script>');
  }
  if (track.gtm) {
    out.push('<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({"gtm.start":new Date().getTime(),' +
      'event:"gtm.js"});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!="dataLayer"?"&l="+l:"";' +
      'j.async=true;j.src="https://www.googletagmanager.com/gtm.js?id="+i+dl;f.parentNode.insertBefore(j,f);' +
      '})(window,document,"script","dataLayer",' + JSON.stringify(track.gtm) + ');</script>');
  }
  // Meta Pixel and LinkedIn Insight Tag do NOT support Consent Mode, so they are
  // deliberately not emitted here. consent.js injects them only after acceptance.
  out.push('<script>window.YC_TRACK=' + JSON.stringify(track) + ';</script>');
  out.push('<script src="/js/consent.js" defer></script>');
  return out.join('\n');
}

function buildHeadTags(db, ctx, base, frag) {
  const s = db.settings || {};
  const canonical = absolute(base, ctx.canonicalOverride || ctx.path);
  const ogImage = absolute(base, s.ogImage || '/img/og-image.svg');
  const tags = [];

  tags.push('<meta name="robots" content="' +
    (ctx.noindex ? 'noindex,follow' :
      'index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1') + '">');
  tags.push('<meta name="author" content="' + esc(s.companyName || s.shortName || '') + '">');
  tags.push('<meta name="publisher" content="' + esc(s.shortName || '') + '">');
  tags.push('<meta name="language" content="en">');
  tags.push('<meta name="geo.region" content="CN-SD">');
  tags.push('<meta name="geo.placename" content="Jinan, Shandong">');
  tags.push('<link rel="canonical" href="' + esc(canonical) + '">');
  tags.push('<link rel="alternate" hreflang="en" href="' + esc(canonical) + '">');
  tags.push('<link rel="alternate" hreflang="x-default" href="' + esc(canonical) + '">');

  tags.push('<meta property="og:site_name" content="' + esc(s.companyName || s.shortName || '') + '">');
  tags.push('<meta property="og:type" content="' +
    (ctx.page === 'post' ? 'article' : (ctx.page === 'product' ? 'product' : 'website')) + '">');
  tags.push('<meta property="og:title" content="' + esc(ctx.title) + '">');
  tags.push('<meta property="og:description" content="' + esc(ctx.description) + '">');
  tags.push('<meta property="og:url" content="' + esc(canonical) + '">');
  tags.push('<meta property="og:image" content="' + esc(ogImage) + '">');
  tags.push('<meta property="og:image:width" content="1200">');
  tags.push('<meta property="og:image:height" content="630">');
  tags.push('<meta property="og:locale" content="en_US">');
  if (ctx.page === 'post' && ctx.item) {
    tags.push('<meta property="article:published_time" content="' + esc(isoDay(ctx.item.date)) + '">');
    tags.push('<meta property="article:modified_time" content="' +
      esc(isoDay(ctx.item.dateModified || ctx.item.date || s.contentUpdatedAt)) + '">');
    tags.push('<meta property="article:section" content="' + esc(ctx.item.category || '') + '">');
  }
  tags.push('<meta name="twitter:card" content="summary_large_image">');
  tags.push('<meta name="twitter:title" content="' + esc(ctx.title) + '">');
  tags.push('<meta name="twitter:description" content="' + esc(ctx.description) + '">');
  tags.push('<meta name="twitter:image" content="' + esc(ogImage) + '">');
  if (s.twitterHandle) {
    tags.push('<meta name="twitter:site" content="' + esc(s.twitterHandle) + '">');
  }
  if (s.googleSiteVerification) {
    tags.push('<meta name="google-site-verification" content="' + esc(s.googleSiteVerification) + '">');
  }
  if (s.bingSiteVerification) {
    tags.push('<meta name="msvalidate.01" content="' + esc(s.bingSiteVerification) + '">');
  }
  if (s.indexNowKey) {
    tags.push('<meta name="indexnow-key" content="' + esc(s.indexNowKey) + '">');
  }

  tags.push(jsonLdScript(db, ctx, base, frag));
  tags.push(trackingScripts(s));
  return tags.join('\n');
}

/* ------------------------------------------------------------------ *
 * HTML assembly
 * ------------------------------------------------------------------ */

function replaceHost(html, id, content, isText) {
  const re = new RegExp('<(div|p|span|section|ul|select)\\b([^>]*\\bid="' + id +
    '"[^>]*)>([\\s\\S]*?)<\\/\\1>', 'i');
  return html.replace(re, (match, tag, attrs) => {
    const value = isText ? esc(content) : String(content || '');
    return '<' + tag + attrs + '>' + value + '</' + tag + '>';
  });
}

function renderPage(templateHtml, db, ctx, base) {
  const frag = render.buildFragments(db, ctx, base);
  let html = templateHtml;

  // --- head ---------------------------------------------------------
  html = html.replace(/<title>[\s\S]*?<\/title>/i, '<title>' + esc(ctx.title) + '</title>');
  html = html.replace(/<meta\s+name="description"[^>]*>/i,
    '<meta name="description" content="' + esc(ctx.description) + '">');
  html = html.replace(/<meta\s+name="keywords"[^>]*>/i,
    '<meta name="keywords" content="' + esc((db.settings || {}).seoKeywords || '') + '">');
  // Remove static OG tags from the template, then add the complete set.
  html = html.replace(/\s*<meta\s+(?:property|name)="(?:og:|twitter:)[^"]*"[^>]*>/gi, '');
  html = html.replace(/\s*<link\s+rel="canonical"[^>]*>/gi, '');
  html = html.replace(/<\/head>/i, buildHeadTags(db, ctx, base, frag) + '\n</head>');

  // --- body ---------------------------------------------------------
  html = html.replace(/<body([^>]*)>/i, (m, attrs) => {
    let next = attrs.replace(/\s*data-page="[^"]*"/, '');
    return '<body' + next + ' data-page="' + (ctx.ssrPage || ctx.page) + '" data-ssr="1">';
  });

  html = html.replace(/<div id="site-header"><\/div>/i,
    '<div id="site-header">' + frag.header + '</div>');
  html = html.replace(/<div id="site-footer"><\/div>/i,
    '<div id="site-footer">' + frag.footer + '</div>');

  Object.keys(frag.hosts).forEach((id) => {
    const isSelect = id === 'filter-category';
    if (isSelect) {
      html = html.replace(/(<select\b[^>]*\bid="filter-category"[^>]*>)([\s\S]*?)(<\/select>)/i,
        (m, open, inner, close) => open + frag.hosts[id] + close);
    } else {
      html = replaceHost(html, id, frag.hosts[id], Boolean(TEXT_HOSTS[id]));
    }
  });

  Object.keys(frag.fills).forEach((key) => {
    const value = frag.fills[key];
    if (typeof value !== 'string' && typeof value !== 'number') return;
    const re = new RegExp('(<([a-z][a-z0-9]*)\\b[^>]*\\bdata-fill="' + key +
      '"[^>]*>)([\\s\\S]*?)(<\\/\\2>)', 'i');
    html = html.replace(re, (m, open, tag, inner, close) => open + esc(value) + close);
  });

  if (frag.replaceH1) {
    html = html.replace(/<h1[^>]*>[\s\S]*?<\/h1>/i, '<h1>' + frag.replaceH1 + '</h1>');
    if (frag.replaceLead) {
      html = html.replace(/(<h1[^>]*>[\s\S]*?<\/h1>\s*)<p[^>]*>[\s\S]*?<\/p>/i,
        (m, before) => before + '<p>' + frag.replaceLead + '</p>');
    }
  }

  if (frag.extra) html = html.replace(/<\/main>/i, frag.extra + '\n  </main>');
  return { html: html, faqs: frag.faqs };
}

function renderAdminHtml(templateHtml) {
  const tag = '<meta name="robots" content="noindex,nofollow,noarchive">';
  if (/<meta\s+name="robots"[^>]*>/i.test(templateHtml)) {
    return templateHtml.replace(/<meta\s+name="robots"[^>]*>/i, tag);
  }
  return templateHtml.replace(/<\/head>/i, tag + '\n</head>');
}

/* ------------------------------------------------------------------ *
 * Crawler-facing files
 * ------------------------------------------------------------------ */

const AI_CRAWLERS = [
  'GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-Web', 'anthropic-ai',
  'PerplexityBot', 'Perplexity-User', 'Google-Extended', 'Applebot-Extended',
  'CCBot', 'cohere-ai', 'Meta-ExternalAgent', 'Amazonbot', 'Bytespider', 'Bingbot'
];

function robotsTxt(db, base) {
  const s = db.settings || {};
  const lines = [
    '# ' + (s.companyName || 'Yuchuan Air'),
    'User-agent: *',
    'Allow: /',
    'Disallow: /admin',
    'Disallow: /api/',
    'Disallow: /*?q=',
    ''
  ];
  if (s.aiCrawlersAllow !== false) {
    lines.push('# AI / generative search crawlers - explicitly allowed for GEO');
    AI_CRAWLERS.forEach((ua) => {
      lines.push('User-agent: ' + ua);
      lines.push('Allow: /');
      lines.push('Disallow: /admin');
      lines.push('Disallow: /api/');
      lines.push('');
    });
  }
  lines.push('Sitemap: ' + base + '/sitemap.xml');
  lines.push('');
  return lines.join('\n');
}

function llmsTxt(db, base) {
  const s = db.settings || {};
  const products = render.published(db.products).sort(render.byOrder);
  const posts = render.published(db.posts)
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  const cats = render.published(db.categories).sort(render.byOrder);
  const apps = render.published(db.applications).sort(render.byOrder);

  const L = [];
  L.push('# ' + (s.companyName || s.shortName || 'Yuchuan Air'));
  L.push('');
  L.push('> ' + (s.shortName || 'Yuchuan Air') + ' (' + (s.companyName || '') +
    ') is a China-based manufacturer of industrial air filtration, dust collection,' +
    ' welding fume extraction and energy-saving equipment' +
    (s.founded ? ', founded in ' + s.founded : '') +
    ' and based in ' + (s.address || 'Jinan, Shandong, China') +
    '. The company supplies ' + products.length + ' documented equipment models for welding,' +
    ' grinding, machining, woodworking, painting and combustible dust applications,' +
    ' and exports worldwide. Credentials: ' + (s.certifications || 'available on request') + '.');
  L.push('');
  L.push('## Quick facts');
  L.push('- Founded: ' + (s.founded || ''));
  L.push('- Headquarters: ' + (s.address || ''));
  L.push('- Product range: ' + cats.map((c) => c.name).join(', '));
  L.push('- Verified company figures: ' + (Array.isArray(s.stats)
    ? s.stats.filter((x) => x && x.value).map((x) => String(x.value) + ' ' + String(x.label || '')).join('; ')
    : ''));
  L.push('- Credentials: ' + (s.certifications || ''));
  L.push('- Sales email: ' + (s.email || ''));
  L.push('- Phone: ' + (s.phone || ''));
  L.push('- WhatsApp: ' + (s.whatsapp || ''));
  L.push('- Working hours: ' + (s.workingHours || ''));
  L.push('');
  L.push('## Product categories');
  cats.forEach((c) => {
    L.push('- [' + c.name + '](' + base + '/collections/' + encodeURIComponent(c.slug) + '): ' +
      stripHtml(c.description || ('Industrial air filtration equipment in the ' + c.name + ' range.')));
  });
  L.push('');
  L.push('## Products');
  products.forEach((p) => {
    L.push('- [' + p.name + '](' + base + '/products/' + encodeURIComponent(p.slug) + '): ' +
      stripHtml(p.summary || '') +
      (Array.isArray(p.specs) && p.specs.length
        ? ' Key specs: ' + p.specs.slice(0, 3).map((r) => r.k + ' ' + r.v).join('; ') + '.'
        : ''));
  });
  L.push('');
  if (apps.length) {
    L.push('## Applications');
    apps.forEach((a) => {
      L.push('- [' + a.name + '](' + base + '/applications): ' + stripHtml(a.description || ''));
    });
    L.push('');
  }
  L.push('## Technical resources');
  posts.forEach((p) => {
    L.push('- [' + p.title + '](' + base + '/blog/' + encodeURIComponent(p.slug) + '): ' +
      stripHtml(p.excerpt || '') + ' (published ' + isoDay(p.date) + ')');
  });
  L.push('');
  L.push('## Company & contact');
  L.push('- [About us](' + base + '/about): company profile, capabilities and certifications.');
  L.push('- [Request a quote](' + base + '/contact): send process details to receive a ' +
    'recommended configuration, airflow calculation and quotation.');
  L.push('- [All products](' + base + '/products): complete equipment catalog.');
  L.push('- [Privacy policy](' + base + '/privacy): how enquiry data, cookies and consent are handled.');
  L.push('- [HTML sitemap](' + base + '/sitemap.xml).');
  L.push('');
  return L.join('\n');
}

function llmsFullTxt(db, base) {
  const s = db.settings || {};
  const L = [llmsTxt(db, base), '', '---', '', '# Full content', ''];
  render.published(db.products).sort(render.byOrder).forEach((p) => {
    L.push('## ' + p.name);
    L.push('URL: ' + base + '/products/' + encodeURIComponent(p.slug));
    L.push('Category: ' + render.categoryName(db, p.category));
    L.push('');
    L.push(stripHtml(p.summary || '') + ' ' + stripHtml(p.description || ''));
    if (Array.isArray(p.features) && p.features.length) {
      L.push(''); L.push('Key features: ' + p.features.join('; ') + '.');
    }
    if (Array.isArray(p.specs) && p.specs.length) {
      L.push(''); L.push('Specifications:');
      p.specs.forEach((r) => L.push('- ' + r.k + ': ' + r.v));
    }
    if (Array.isArray(p.applications) && p.applications.length) {
      L.push(''); L.push('Typical applications: ' + p.applications.join(', ') + '.');
    }
    L.push('');
  });
  render.published(db.posts)
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
    .forEach((p) => {
      L.push('## ' + p.title);
      L.push('URL: ' + base + '/blog/' + encodeURIComponent(p.slug));
      L.push('Published: ' + isoDay(p.date) + ' | Author: ' + (p.author || s.shortName || ''));
      L.push('');
      L.push(stripHtml(p.excerpt || ''));
      L.push('');
      L.push(stripHtml(p.content || ''));
      L.push('');
    });
  if (render.published(db.faqs).length) {
    L.push('## Frequently asked questions');
    L.push('');
    render.published(db.faqs).sort(render.byOrder).forEach((f) => {
      L.push('Q: ' + stripHtml(f.question));
      L.push('A: ' + stripHtml(f.answer));
      L.push('');
    });
  }
  return L.join('\n');
}

function sitemapXml(db, base) {
  const s = db.settings || {};
  const fallbackDay = isoDay(s.contentUpdatedAt) || new Date().toISOString().slice(0, 10);
  const staticPages = [
    { path: '/', priority: '1.0', changefreq: 'daily' },
    { path: '/products', priority: '0.9', changefreq: 'weekly' },
    { path: '/applications', priority: '0.7', changefreq: 'monthly' },
    { path: '/about', priority: '0.6', changefreq: 'monthly' },
    { path: '/blog', priority: '0.8', changefreq: 'weekly' },
    { path: '/contact', priority: '0.7', changefreq: 'monthly' },
    { path: '/privacy', priority: '0.3', changefreq: 'yearly' }
  ];
  const entries = staticPages.map((p) => ({
    loc: base + p.path, lastmod: fallbackDay,
    changefreq: p.changefreq, priority: p.priority
  }));

  render.published(db.categories).sort(render.byOrder).forEach((c) => {
    entries.push({
      loc: base + '/collections/' + encodeURIComponent(c.slug),
      lastmod: isoDay(c.dateModified || s.contentUpdatedAt) || fallbackDay,
      changefreq: 'weekly', priority: '0.8',
      image: c.image, title: c.name
    });
  });
  render.published(db.products).sort(render.byOrder).forEach((p) => {
    entries.push({
      loc: base + '/products/' + encodeURIComponent(p.slug),
      lastmod: isoDay(p.dateModified || s.contentUpdatedAt) || fallbackDay,
      changefreq: 'weekly', priority: '0.7',
      image: p.image, title: p.name
    });
  });
  render.published(db.posts)
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
    .forEach((p) => {
      entries.push({
        loc: base + '/blog/' + encodeURIComponent(p.slug),
        lastmod: isoDay(p.dateModified || p.date) || fallbackDay,
        changefreq: 'monthly', priority: '0.6',
        image: p.cover, title: p.title
      });
    });

  const body = entries.map((e) => {
    let node = '  <url>\n    <loc>' + escapeXml(e.loc) + '</loc>\n' +
      '    <lastmod>' + e.lastmod + '</lastmod>\n' +
      '    <changefreq>' + e.changefreq + '</changefreq>\n' +
      '    <priority>' + e.priority + '</priority>';
    if (e.image) {
      node += '\n    <image:image>\n      <image:loc>' + escapeXml(absolute(base, e.image)) +
        '</image:loc>\n      <image:title>' + escapeXml(e.title || '') +
        '</image:title>\n    </image:image>';
    }
    return node + '\n  </url>';
  }).join('\n');

  return '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" ' +
    'xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n' +
    body + '\n</urlset>\n';
}

module.exports = {
  siteBaseUrl,
  absolute,
  isoDay,
  stripHtml,
  resolveContext,
  renderPage,
  renderAdminHtml,
  robotsTxt,
  llmsTxt,
  llmsFullTxt,
  sitemapXml,
  buildHeadTags,
  trackingScripts,
  AI_CRAWLERS
};
