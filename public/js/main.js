/* ==================================================================
   Yuchuan Air - front-end controller
   Handles: header/footer, mobile nav, SEO, product/article rendering,
   filters, inquiry form, and built-in SVG equipment illustrations.

   Content comes from /api/* so every text and product can be edited
   from the /admin panel without touching any HTML file.
   ================================================================== */

(function () {
  'use strict';

  /* ----------------------------- helpers ----------------------------- */

  var site = null;
  // When the server has already rendered the full page (data-ssr="1"), the
  // browser only wires up interactions - it must NOT overwrite the HTML that
  // search engines and AI crawlers just received.
  var SSR = document.body && document.body.getAttribute('data-ssr') === '1';

  /* ---------------------- lead attribution ------------------------- */

  function firstTouch() {
    var params = new URLSearchParams(location.search);
    var fresh = {
      utm_source: params.get('utm_source') || '',
      utm_medium: params.get('utm_medium') || '',
      utm_campaign: params.get('utm_campaign') || '',
      utm_term: params.get('utm_term') || '',
      utm_content: params.get('utm_content') || '',
      gclid: params.get('gclid') || '',
      fbclid: params.get('fbclid') || '',
      referrer: document.referrer || '',
      landing_page: location.pathname + location.search,
      language: navigator.language || navigator.userLanguage || ''
    };
    try {
      var saved = JSON.parse(sessionStorage.getItem('yc_first_touch') || 'null');
      if (!saved) {
        sessionStorage.setItem('yc_first_touch', JSON.stringify(fresh));
        return fresh;
      }
      // Last-click attribution: a new campaign parameter overrides the stored one.
      if (fresh.utm_source || fresh.gclid || fresh.fbclid) {
        ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'fbclid']
          .forEach(function (key) { if (fresh[key]) saved[key] = fresh[key]; });
        sessionStorage.setItem('yc_first_touch', JSON.stringify(saved));
      }
      return saved;
    } catch (err) {
      return fresh;
    }
  }

  function fireConversion(channelHint) {
    try {
      var t = window.YC_TRACK || {};
      var detail = { event: 'generate_lead', lead_source: channelHint || 'website', value: 1, currency: 'USD' };
      if (window.dataLayer && window.dataLayer.push) window.dataLayer.push(detail);
      if (typeof window.gtag === 'function') {
        window.gtag('event', 'generate_lead', {
          event_category: 'lead', event_label: channelHint || 'website', value: 1, currency: 'USD'
        });
        if (t.adsId && t.adsLabel) {
          window.gtag('event', 'conversion', { send_to: t.adsId + '/' + t.adsLabel, value: 1, currency: 'USD' });
        }
      }
      if (typeof window.fbq === 'function') window.fbq('track', 'Lead');
      if (typeof window.lintrk === 'function') window.lintrk('track', { conversion_id: t.linkedinConversionId || 0 });
    } catch (err) { /* analytics must never break the form */ }
  }

  function $(selector, root) {
    return (root || document).querySelector(selector);
  }

  function $$(selector, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(selector));
  }

  function esc(value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/[&<>"']/g, function (ch) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
      });
  }

  function truncate(text, max) {
    var str = String(text || '');
    return str.length > max ? str.slice(0, max).replace(/\s+\S*$/, '') + '…' : str;
  }

  function formatDate(value) {
    if (!value) return '';
    var d = new Date(value);
    if (isNaN(d.getTime())) return String(value);
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function api(path, options) {
    var opts = Object.assign({ headers: {} }, options || {});
    if (opts.body && typeof opts.body !== 'string') {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(opts.body);
    }
    return fetch(path, opts).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) throw new Error(data.error || 'Request failed (' + res.status + ')');
        return data;
      });
    });
  }

  function setText(selector, value, root) {
    var el = $(selector, root);
    if (el && value !== undefined && value !== null) el.textContent = String(value);
  }

  function setMeta(name, content) {
    var el = $('meta[name="' + name + '"]');
    if (!el) {
      el = document.createElement('meta');
      el.setAttribute('name', name);
      document.head.appendChild(el);
    }
    el.setAttribute('content', String(content || ''));
  }

  function categoryName(slug) {
    var found = (site && site.categories ? site.categories : [])
      .filter(function (c) { return c.slug === slug; })[0];
    return found ? found.name : 'Products';
  }

  function productUrl(item) {
    return '/products/' + encodeURIComponent(item.slug);
  }

  function postUrl(item) {
    return '/blog/' + encodeURIComponent(item.slug);
  }

  /* ----------------------------- SVG art ----------------------------- */

  var INK = '#0d2436';
  var ORANGE = '#f26522';
  var LIGHT = '#ffffff';
  var GREY = '#dbe7ed';

  function svgWrap(inner, label) {
    return '<svg viewBox="0 0 320 240" xmlns="http://www.w3.org/2000/svg" role="img" ' +
      'aria-label="' + esc(label || 'Industrial air filtration equipment') + '">' +
      '<g fill="none" stroke="' + INK + '" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">' +
      inner + '</g></svg>';
  }

  var ART = {
    quick: '<rect x="62" y="88" width="120" height="112" rx="5" fill="' + LIGHT + '"/>' +
      '<rect x="76" y="104" width="92" height="14" rx="2" fill="' + GREY + '" stroke="none"/>' +
      '<rect x="76" y="126" width="92" height="14" rx="2" fill="' + GREY + '" stroke="none"/>' +
      '<path d="M182 112 L232 70 L272 82" stroke-width="8"/>' +
      '<circle cx="182" cy="112" r="8" fill="' + ORANGE + '" stroke="' + ORANGE + '"/>' +
      '<path d="M264 74 L294 60 L294 108 L264 96 Z" fill="#ffe3d2" stroke="' + ORANGE + '"/>' +
      '<path d="M96 168 h52" stroke="' + ORANGE + '" stroke-width="4"/>' +
      '<circle cx="86" cy="200" r="9" fill="' + LIGHT + '"/><circle cx="158" cy="200" r="9" fill="' + LIGHT + '"/>' +
      '<path d="M226 34 l-14 24 h14 l-8 20 24 -28 h-15 l9 -16 z" fill="' + ORANGE + '" stroke="' + ORANGE + '"/>',

    fume: '<rect x="52" y="98" width="112" height="104" rx="5" fill="' + LIGHT + '"/>' +
      '<rect x="66" y="114" width="84" height="12" rx="2" fill="' + GREY + '" stroke="none"/>' +
      '<rect x="66" y="134" width="84" height="12" rx="2" fill="' + GREY + '" stroke="none"/>' +
      '<rect x="66" y="154" width="84" height="12" rx="2" fill="' + GREY + '" stroke="none"/>' +
      '<circle cx="76" cy="202" r="9" fill="' + LIGHT + '"/><circle cx="140" cy="202" r="9" fill="' + LIGHT + '"/>' +
      '<path d="M164 122 L218 66 L266 82" stroke-width="8"/>' +
      '<circle cx="164" cy="122" r="8" fill="' + ORANGE + '" stroke="' + ORANGE + '"/>' +
      '<circle cx="218" cy="66" r="8" fill="' + LIGHT + '"/>' +
      '<path d="M258 74 L294 58 L294 110 L258 96 Z" fill="#ffe3d2" stroke="' + ORANGE + '"/>' +
      '<path d="M300 68 q16 -10 16 0 M300 84 q16 -10 16 0" stroke="' + ORANGE + '" stroke-width="2"/>',

    arm: '<rect x="40" y="66" width="46" height="112" rx="4" fill="' + LIGHT + '"/>' +
      '<path d="M86 92 L160 92 L226 138" stroke-width="12"/>' +
      '<circle cx="160" cy="92" r="12" fill="' + ORANGE + '" stroke="' + ORANGE + '"/>' +
      '<circle cx="226" cy="138" r="10" fill="' + LIGHT + '"/>' +
      '<path d="M220 138 L262 116 L282 116 L282 164 L262 164 Z" fill="#ffe3d2" stroke="' + ORANGE + '"/>' +
      '<path d="M292 126 q14 -8 20 0 M292 146 q14 -8 20 0" stroke="' + ORANGE + '" stroke-width="2"/>' +
      '<path d="M40 196 h244" stroke="' + GREY + '" stroke-width="3"/>',

    table: '<path d="M40 116 h240 v14 H40 z" fill="' + LIGHT + '"/>' +
      '<path d="M60 130 v66 M260 130 v66" stroke-width="5"/>' +
      '<path d="M40 196 h240" stroke-width="4"/>' +
      '<path d="M74 108 v-18 M124 108 v-18 M174 108 v-18 M224 108 v-18" stroke="' + ORANGE + '" stroke-width="3" stroke-dasharray="5 6"/>' +
      '<path d="M96 152 v22 m-8 -8 l8 8 8 -8 M160 152 v22 m-8 -8 l8 8 8 -8 M224 152 v22 m-8 -8 l8 8 8 -8" stroke="' + ORANGE + '" stroke-width="3"/>' +
      '<rect x="112" y="56" width="96" height="26" rx="3" fill="' + GREY + '" stroke="none"/>' +
      '<path d="M136 56 q10 -18 24 -18 q14 0 24 18" stroke="' + ORANGE + '" stroke-width="2"/>',

    wet: '<rect x="70" y="60" width="180" height="140" rx="6" fill="' + LIGHT + '"/>' +
      '<path d="M70 150 h180" stroke-width="4"/>' +
      '<path d="M84 168 q16 -10 32 0 t32 0 t32 0 t32 0 t32 0" stroke="' + '#2b7fa8' + '" stroke-width="3"/>' +
      '<path d="M84 184 q16 -10 32 0 t32 0 t32 0 t32 0 t32 0" stroke="' + '#2b7fa8' + '" stroke-width="3"/>' +
      '<path d="M118 60 V34 h84 v26" stroke-width="4"/>' +
      '<rect x="132" y="20" width="56" height="16" rx="3" fill="' + GREY + '" stroke="none"/>' +
      '<circle cx="160" cy="106" r="24" fill="#ffe3d2" stroke="' + ORANGE + '"/>' +
      '<path d="M160 92 v28 M146 106 h28" stroke="' + ORANGE + '" stroke-width="3"/>',

    cartridge: '<rect x="92" y="44" width="136" height="120" rx="5" fill="' + LIGHT + '"/>' +
      '<path d="M112 58 v92 M138 58 v92 M164 58 v92 M190 58 v92" stroke="' + GREY + '" stroke-width="9"/>' +
      '<path d="M92 164 h136 l-22 40 H114 z" fill="' + LIGHT + '"/>' +
      '<path d="M114 204 h92" stroke-width="4"/>' +
      '<rect x="76" y="28" width="168" height="16" rx="3" fill="' + ORANGE + '" stroke="' + ORANGE + '"/>' +
      '<path d="M228 84 q26 -10 40 6 M228 110 q26 -10 40 6" stroke="' + ORANGE + '" stroke-width="2"/>',

    booth: '<path d="M52 196 V72 h216 v124" stroke-width="4"/>' +
      '<path d="M52 72 L84 46 h152 l32 26" stroke-width="4"/>' +
      '<path d="M52 196 h216" stroke-width="4"/>' +
      '<rect x="132" y="46" width="56" height="22" rx="3" fill="' + ORANGE + '" stroke="' + ORANGE + '"/>' +
      '<path d="M96 100 v62 M160 100 v62 M224 100 v62" stroke="' + GREY + '" stroke-width="3" stroke-dasharray="5 7"/>' +
      '<path d="M112 150 v20 m-7 -7 l7 7 7 -7 M176 150 v20 m-7 -7 l7 7 7 -7 M240 150 v20 m-7 -7 l7 7 7 -7" stroke="' + ORANGE + '" stroke-width="2"/>',

    ambient: '<rect x="70" y="70" width="180" height="66" rx="5" fill="' + LIGHT + '"/>' +
      '<path d="M70 44 h180 M110 44 v26 M210 44 v26" stroke-width="4"/>' +
      '<rect x="92" y="88" width="136" height="30" rx="3" fill="' + GREY + '" stroke="none"/>' +
      '<path d="M54 160 q28 -14 56 0 t56 0 t56 0 t56 0" stroke="' + ORANGE + '" stroke-width="3" stroke-dasharray="7 8"/>' +
      '<path d="M54 186 q28 -14 56 0 t56 0 t56 0 t56 0" stroke="' + ORANGE + '" stroke-width="3" stroke-dasharray="7 8"/>' +
      '<path d="M150 136 v14 m-7 -7 l7 7 7 -7" stroke="' + ORANGE + '" stroke-width="3"/>',

    mist: '<rect x="56" y="90" width="150" height="106" rx="5" fill="' + LIGHT + '"/>' +
      '<rect x="74" y="108" width="114" height="54" rx="3" fill="' + GREY + '" stroke="none"/>' +
      '<path d="M96 108 v54 M156 108 v54" stroke="' + INK + '" stroke-width="3"/>' +
      '<circle cx="235" cy="84" r="14" fill="#ffe3d2" stroke="' + ORANGE + '"/>' +
      '<circle cx="266" cy="66" r="9" fill="#ffe3d2" stroke="' + ORANGE + '"/>' +
      '<circle cx="272" cy="104" r="7" fill="#ffe3d2" stroke="' + ORANGE + '"/>' +
      '<path d="M206 122 q22 -18 30 -38 M206 142 q30 -10 52 -32" stroke="' + ORANGE + '" stroke-width="2" stroke-dasharray="5 7"/>' +
      '<rect x="56" y="196" width="150" height="8" rx="3" fill="' + GREY + '" stroke="none"/>'
  };

  var ART_BY_CATEGORY = {
    'quick-ship': 'quick',
    'portable-fume-extractors': 'fume',
    'wall-mounted-fume-extractors': 'fume',
    'extraction-arms-blowers': 'arm',
    'downdraft-tables-booths': 'table',
    'wet-dust-collectors': 'wet',
    'cartridge-dust-collectors': 'cartridge',
    'environmental-welding-booths': 'booth',
    'ambient-air-cleaners': 'ambient',
    'oil-mist-voc-collectors': 'mist'
  };

  function artFor(item, label) {
    if (item && item.image) {
      return '<img src="' + esc(item.image) + '" alt="' + esc(label || item.name || 'Product image') +
        '" width="640" height="480" loading="lazy">';
    }
    var key = ART_BY_CATEGORY[item && item.category] || 'fume';
    return svgWrap(ART[key], label || (item && item.name));
  }

  function brandMark(size) {
    return '<svg class="brand-mark" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" ' +
      'role="img" aria-label="Yuchuan Air logo" width="' + (size || 42) + '" height="' + (size || 42) + '">' +
      '<rect x="2" y="2" width="44" height="44" rx="8" fill="#0d2436"/>' +
      '<g fill="#f26522">' +
      '<path d="M24 9 c5 3 6 9 3 14 c-2 3 -1 6 0 8 c-6 -1 -10 -6 -9 -12 c1 -5 3 -8 6 -10 z"/>' +
      '<path d="M39 21 c-3 5 -9 7 -14 4 c-3 -2 -6 -1 -8 0 c1 -6 5 -11 12 -12 c5 -1 8 1 10 8 z" opacity=".85"/>' +
      '<path d="M27 40 c-5 -3 -7 -9 -4 -14 c2 -3 1 -6 0 -8 c6 1 10 6 9 12 c-1 5 -3 8 -5 10 z" opacity=".7"/>' +
      '</g><circle cx="24" cy="24" r="4" fill="#fff"/></svg>';
  }

  function icon(name) {
    var paths = {
      mail: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 7 l10 7 10 -7"/>',
      phone: '<path d="M6 2 h4 l2 5 -3 2 c1 4 4 7 8 8 l2 -3 5 2 v4 c0 1 -1 2 -2 2 C11 22 2 13 2 4 c0 -1 1 -2 2 -2 z"/>',
      pin: '<path d="M12 22 s8 -7 8 -13 a8 8 0 0 0 -16 0 c0 6 8 13 8 13 z"/><circle cx="12" cy="9" r="3"/>',
      clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6 v6 l4 2"/>',
      box: '<rect x="3" y="6" width="18" height="14" rx="2"/><path d="M3 10 h18 M9 6 v14"/>',
      arrow: '<path d="M4 12 h16 M14 6 l6 6 -6 6"/>'
    };
    return '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" ' +
      'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      (paths[name] || paths.box) + '</svg>';
  }

  function heroArt() {
    return '<svg viewBox="0 0 520 420" xmlns="http://www.w3.org/2000/svg" role="img" ' +
      'aria-label="Industrial dust collector and fume extraction system illustration">' +
      '<defs><linearGradient id="hg" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0" stop-color="#ffffff" stop-opacity=".14"/>' +
      '<stop offset="1" stop-color="#ffffff" stop-opacity=".03"/></linearGradient></defs>' +
      '<circle cx="270" cy="200" r="185" fill="url(#hg)"/>' +
      '<g fill="none" stroke="#8fb4c8" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M40 350 h440" stroke-width="4"/>' +
      // collector cabinet
      '<rect x="72" y="152" width="158" height="178" rx="8" fill="#e8f1f6"/>' +
      '<rect x="92" y="174" width="118" height="16" rx="3" fill="#b9d2df" stroke="none"/>' +
      '<rect x="92" y="200" width="118" height="16" rx="3" fill="#b9d2df" stroke="none"/>' +
      '<rect x="92" y="226" width="118" height="16" rx="3" fill="#b9d2df" stroke="none"/>' +
      '<rect x="92" y="264" width="118" height="44" rx="4" fill="#c9dde7" stroke="none"/>' +
      '<path d="M72 330 h158 l-20 20 H92 z" fill="#d7e7ee"/>' +
      '<circle cx="104" cy="340" r="0"/>' +
      // extraction arm
      '<path d="M230 190 L318 96 L404 124" stroke="#f26522" stroke-width="14"/>' +
      '<circle cx="230" cy="190" r="13" fill="#0d2436" stroke="#f26522"/>' +
      '<circle cx="318" cy="96" r="13" fill="#0d2436" stroke="#f26522"/>' +
      '<path d="M398 108 L462 86 L462 166 L398 144 Z" fill="#f26522" stroke="#ffb98d"/>' +
      // workpiece
      '<path d="M356 292 h150 v14 H356 z" fill="#e8f1f6"/>' +
      '<path d="M372 306 v38 M490 306 v38" stroke-width="5"/>' +
      '<rect x="390" y="264" width="82" height="28" rx="3" fill="#c9dde7" stroke="none"/>' +
      '</g>' +
      // fume particles
      '<g fill="#ffb98d" opacity=".85">' +
      '<circle cx="424" cy="228" r="5"/><circle cx="444" cy="206" r="7"/>' +
      '<circle cx="412" cy="196" r="4"/><circle cx="456" cy="238" r="4"/>' +
      '<circle cx="398" cy="214" r="3"/></g>' +
      '<g fill="none" stroke="#ffb98d" stroke-width="2" stroke-dasharray="6 8" opacity=".7">' +
      '<path d="M420 250 q-70 -20 -130 -66"/><path d="M446 250 q-70 -8 -146 -42"/>' +
      '</g></svg>';
  }

  /* ----------------------------- header / footer ----------------------------- */

  function navLink(href, label, current) {
    var active = current === href ? ' aria-current="page"' : '';
    return '<a href="' + href + '"' + active + '>' + esc(label) + '</a>';
  }

  function renderHeader() {
    if (SSR) return; // server-rendered header is already in the HTML
    var s = site.settings;
    var path = location.pathname;
    var current = path === '/' ? '/' :
      (path.indexOf('/products') === 0 ? '/products' :
        (path.indexOf('/blog') === 0 ? '/blog' :
          (path.indexOf('/applications') === 0 ? '/applications' :
            (path.indexOf('/about') === 0 ? '/about' :
              (path.indexOf('/contact') === 0 ? '/contact' : '')))));

    var submenu = (site.categories || []).slice(0, 10).map(function (c) {
      return '<a href="/collections/' + encodeURIComponent(c.slug) + '">' + esc(c.name) + '</a>';
    }).join('');

    var topbar = '<div class="topbar"><div class="container">' +
      '<div class="topbar-left">' +
      '<span><strong>' + esc(s.heroBadge || 'Fast Delivery') + '</strong></span>' +
      '<a href="mailto:' + esc(s.email) + '">' + esc(s.email) + '</a>' +
      '<span>' + esc(s.workingHours || '') + '</span>' +
      '</div><div class="topbar-left"><a href="tel:' + esc(String(s.phone || '').replace(/\s/g, '')) + '">' +
      esc(s.phone) + '</a></div></div></div>';

    var header = '<header class="site-header"><div class="container header-inner">' +
      '<a class="brand" href="/" aria-label="' + esc(s.shortName || 'Home') + '">' +
      brandMark() + '<span class="brand-text"><span class="brand-name">' +
      esc(s.shortName || 'Yuchuan Air') + '</span><span class="brand-sub">' +
      esc(s.tagline || 'Industrial Air Filtration') + '</span></span></a>' +
      '<button class="nav-toggle" type="button" aria-label="Open menu" aria-expanded="false" aria-controls="main-nav"><span></span></button>' +
      '<nav class="main-nav" id="main-nav" aria-label="Main navigation">' +
      '<button class="nav-close" type="button" aria-label="Close menu">×</button><ul>' +
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

    var host = $('#site-header');
    if (host) host.innerHTML = topbar + header;
  }

  function wireNav() {
    var toggle = $('.nav-toggle');
    var nav = $('.main-nav');
    var overlay = $('.nav-overlay');
    var close = $('.nav-close');
    if (!toggle || !nav || !overlay) return;

    function setOpen(open) {
      nav.classList.toggle('is-open', open);
      overlay.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      document.body.style.overflow = open ? 'hidden' : '';
    }
    toggle.addEventListener('click', function () {
      setOpen(!nav.classList.contains('is-open'));
    });
    if (close) close.addEventListener('click', function () { setOpen(false); });
    overlay.addEventListener('click', function () { setOpen(false); });
    $$('.main-nav a').forEach(function (link) {
      link.addEventListener('click', function () { setOpen(false); });
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') setOpen(false);
    });
    window.addEventListener('resize', function () {
      if (window.innerWidth > 980) setOpen(false);
    });
  }

  function renderFooter() {
    if (SSR) return; // server-rendered footer is already in the HTML
    var s = site.settings;
    var catLinks = (site.categories || []).slice(0, 6).map(function (c) {
      return '<li><a href="/collections/' + encodeURIComponent(c.slug) + '">' + esc(c.name) + '</a></li>';
    }).join('');

    var html = '<footer class="site-footer"><div class="container"><div class="footer-grid">' +
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
      '<li><a href="/blog">Blog & Insights</a></li>' +
      '<li><a href="/contact">Request a Quote</a></li>' +
      '<li><a href="/admin">Admin Login</a></li></ul></div>' +
      '<div><h3>Get in Touch</h3><ul class="footer-links footer-contact">' +
      '<li>' + icon('pin') + '<span>' + esc(s.address || '') + '</span></li>' +
      '<li>' + icon('mail') + '<a href="mailto:' + esc(s.email) + '">' + esc(s.email) + '</a></li>' +
      '<li>' + icon('phone') + '<a href="tel:' + esc(String(s.phone || '').replace(/\s/g, '')) + '">' + esc(s.phone) + '</a></li>' +
      (s.whatsapp ? '<li>' + icon('phone') + '<span>WhatsApp: ' + esc(s.whatsapp) + '</span></li>' : '') +
      '</ul></div></div>' +
      '<div class="footer-bottom"><span>© ' + new Date().getFullYear() + ' ' +
      esc(s.companyName || '') + '. All rights reserved.</span>' +
      '<span>' + esc(s.certifications || '') + ' &nbsp;|&nbsp; <a href="/sitemap.xml">Sitemap</a></span>' +
      '</div></div></footer>';

    var host = $('#site-footer');
    if (host) host.innerHTML = html;
  }

  /* ----------------------------- shared rendering ----------------------------- */

  function fillSettings() {
    var s = site.settings || {};
    $$('[data-fill]').forEach(function (el) {
      var value = s[el.getAttribute('data-fill')];
      if (value !== undefined && value !== null && value !== '') el.textContent = String(value);
    });
  }

  function renderStats() {
    var host = $('#stats-grid');
    if (!host) return;
    var stats = Array.isArray(site.settings.stats) ? site.settings.stats : [];
    if (!stats.length) return;
    host.innerHTML = stats.map(function (item) {
      return '<div class="stat"><div class="stat-value">' + esc(item.value) +
        '</div><div class="stat-label">' + esc(item.label) + '</div></div>';
    }).join('');
  }

  function renderProductCard(item) {
    var url = productUrl(item);
    return '<article class="card"><a class="card-visual" href="' + url + '" aria-label="' + esc(item.name) + '">' +
      artFor(item, item.name) + '</a><div class="card-body">' +
      '<div class="card-series">' + esc(item.series || categoryName(item.category)) + '</div>' +
      '<h3 class="card-title"><a href="' + url + '">' + esc(item.name) + '</a></h3>' +
      '<p class="card-text">' + esc(truncate(item.summary, 135)) + '</p>' +
      '<a class="card-link" href="' + url + '">Explore product</a></div></article>';
  }

  function renderPostCard(item) {
    var url = postUrl(item);
    var cover = item.cover
      ? '<img src="' + esc(item.cover) + '" alt="' + esc(item.title) + '" width="640" height="360" loading="lazy">'
      : svgWrap('<rect x="86" y="42" width="148" height="156" rx="6" fill="' + LIGHT + '"/>' +
        '<path d="M112 78 h96 M112 104 h96 M112 130 h70" stroke="' + GREY + '" stroke-width="7"/>' +
        '<rect x="86" y="42" width="148" height="18" rx="6" fill="' + ORANGE + '" stroke="' + ORANGE + '"/>', item.title);
    return '<article class="card post-card"><a class="card-visual post-cover" href="' + url + '" aria-label="' + esc(item.title) + '">' +
      cover + '</a><div class="card-body"><div class="post-meta">' + esc(formatDate(item.date)) +
      ' &nbsp;·&nbsp; ' + esc(item.category || 'Insights') + '</div>' +
      '<h3 class="card-title"><a href="' + url + '">' + esc(item.title) + '</a></h3>' +
      '<p class="card-text">' + esc(truncate(item.excerpt, 145)) + '</p>' +
      '<a class="card-link" href="' + url + '">Read article</a></div></article>';
  }

  function renderAppCard(item) {
    return '<article class="app-card"><h3>' + esc(item.name) + '</h3><p>' +
      esc(item.description) + '</p></article>';
  }

  function applySeo(options) {
    if (SSR) return; // the server injected canonical / OG / JSON-LD already
    var settings = site.settings || {};
    var opts = options || {};
    var title = opts.title || document.title;
    var description = opts.description || settings.seoDescription || '';
    document.title = title;
    setMeta('description', description);
    setMeta('og:title', title);
    setMeta('og:description', description);
    setMeta('og:type', opts.type || 'website');
    var canonical = $('link[rel="canonical"]');
    var base = String(settings.siteUrl || location.origin).replace(/\/+$/, '');
    if (canonical) canonical.setAttribute('href', base + location.pathname);
    var ogUrl = $('meta[property="og:url"]');
    if (ogUrl) ogUrl.setAttribute('content', base + location.pathname);
  }

  function showError(host, message) {
    if (host) host.innerHTML = '<div class="empty-state">' + esc(message) + '</div>';
  }

  /* ----------------------------- pages ----------------------------- */

  function initHome() {
    fillSettings();
    if (SSR) return;
    renderStats();
    var heroArtHost = $('#hero-art');
    if (heroArtHost) heroArtHost.innerHTML = heroArt();

    var featureHost = $('#featured-products');
    api('/api/products?featured=1&limit=6').then(function (data) {
      if (featureHost) {
        featureHost.innerHTML = data.items.length
          ? data.items.map(renderProductCard).join('')
          : '<div class="empty-state">No featured products yet.</div>';
      }
    }).catch(function (err) { showError(featureHost, err.message); });

    var catHost = $('#category-grid');
    if (catHost) {
      var cats = site.categories || [];
      var counts = {};
      api('/api/products').then(function (data) {
        data.items.forEach(function (p) { counts[p.category] = (counts[p.category] || 0) + 1; });
        catHost.innerHTML = cats.map(function (c) {
          var n = counts[c.slug] || 0;
          return '<a class="tile" href="/collections/' + encodeURIComponent(c.slug) + '">' +
            '<span class="tile-icon">' + icon('box') + '</span>' +
            '<span class="tile-name">' + esc(c.name) + '</span>' +
            '<span class="tile-count">' + n + ' model' + (n === 1 ? '' : 's') + '</span></a>';
        }).join('');
      }).catch(function (err) { showError(catHost, err.message); });
    }

    var appHost = $('#applications-grid');
    if (appHost) {
      appHost.innerHTML = (site.applications || []).slice(0, 6).map(renderAppCard).join('');
    }

    var postHost = $('#latest-posts');
    api('/api/posts?limit=3').then(function (data) {
      if (postHost) {
        postHost.innerHTML = data.items.length
          ? data.items.map(renderPostCard).join('')
          : '<div class="empty-state">No articles published yet.</div>';
      }
    }).catch(function (err) { showError(postHost, err.message); });

    applySeo({ title: site.settings.seoTitle || document.title });
  }

  function initProducts() {
    fillSettings();
    applySeo({ title: 'Industrial Air Filtration Products | ' + (site.settings.shortName || 'Yuchuan Air') });

    var grid = $('#product-list');
    var countEl = $('#result-count');
    var categorySelect = $('#filter-category');
    var searchInput = $('#filter-q');
    var params = new URLSearchParams(location.search);

    if (categorySelect) {
      if (!SSR) {
        categorySelect.innerHTML = '<option value="">All Categories</option>' +
          (site.categories || []).map(function (c) {
            return '<option value="' + esc(c.slug) + '">' + esc(c.name) + '</option>';
          }).join('');
        var initial = params.get('category') || '';
        if (initial) categorySelect.value = initial;
      }
      categorySelect.addEventListener('change', load);
    }

    var timer = null;
    if (searchInput) {
      var q = params.get('q') || '';
      if (q) searchInput.value = q;
      searchInput.addEventListener('input', function () {
        window.clearTimeout(timer);
        timer = window.setTimeout(load, 250);
      });
    }

    function load() {
      var query = new URLSearchParams();
      var c = categorySelect ? categorySelect.value : '';
      var q = searchInput ? searchInput.value.trim() : '';
      if (c) query.set('category', c);
      if (q) query.set('q', q);
      if (grid) grid.innerHTML = '<p class="loading">Loading products…</p>';
      api('/api/products?' + query.toString()).then(function (data) {
        if (grid) {
          grid.innerHTML = data.items.length
            ? data.items.map(renderProductCard).join('')
            : '<div class="empty-state">No products match your filters. <a href="/products">Clear filters</a></div>';
        }
        if (countEl) countEl.textContent = 'Showing ' + data.items.length + ' product' + (data.items.length === 1 ? '' : 's');
        var newUrl = '/products' + (query.toString() ? '?' + query.toString() : '');
        try { history.replaceState(null, '', newUrl); } catch (err) { /* ignore */ }
      }).catch(function (err) { showError(grid, err.message); });
    }

    if (!SSR) load();
  }

  function initProductDetail() {
    if (SSR) return; // full detail HTML came from the server
    var parts = location.pathname.split('/').filter(Boolean);
    var slug = parts.length > 1 ? decodeURIComponent(parts[1]) : (new URLSearchParams(location.search).get('slug') || '');
    var host = $('#product-detail');
    if (!slug) { showError(host, 'Product not found.'); return; }

    api('/api/products/' + encodeURIComponent(slug)).then(function (data) {
      var p = data.item;
      var specs = Array.isArray(p.specs) ? p.specs : [];
      var features = Array.isArray(p.features) ? p.features : [];
      var apps = Array.isArray(p.applications) ? p.applications : [];

      applySeo({
        title: p.name + ' | ' + (site.settings.shortName || 'Yuchuan Air'),
        description: p.summary || site.settings.seoDescription,
        type: 'product'
      });

      var html = '<section class="section"><div class="container"><div class="detail-grid">' +
        '<div class="detail-visual">' + artFor(p, p.name) + '</div>' +
        '<div><div class="detail-series">' + esc(p.series || categoryName(p.category)) + '</div>' +
        '<h1 class="detail-title">' + esc(p.name) + '</h1>' +
        '<p class="detail-summary">' + esc(p.summary) + '</p>' +
        '<div class="center-actions" style="justify-content:flex-start;margin-top:1.5rem">' +
        '<a class="btn btn-primary" href="/contact?product=' + encodeURIComponent(p.name) + '">Request a Quote</a>' +
        '<a class="btn btn-outline-dark btn-small" href="/products">All Products</a></div>' +
        '</div></div></div></section>' +
        '<div class="section--tight"><div class="container-narrow">' +
        '<h2>Product Overview</h2><p>' + esc(p.description) + '</p>' +
        (features.length ? '<h2 style="margin-top:2.2rem">Key Features</h2><ul class="check-list">' +
          features.map(function (f) { return '<li>' + esc(f) + '</li>'; }).join('') + '</ul>' : '') +
        '</div></div>' +
        '<div class="section section--grey"><div class="container"><div class="split">' +
        '<div><span class="eyebrow">Technical Data</span><h2 class="section-title">Specifications</h2>' +
        '<table class="spec-table"><tbody>' + specs.map(function (row) {
          return '<tr><th>' + esc(row.k) + '</th><td>' + esc(row.v) + '</td></tr>';
        }).join('') + '</tbody></table></div>' +
        '<div><span class="eyebrow">Typical Uses</span><h2 class="section-title">Applications</h2>' +
        '<p class="section-lead">Engineered for the following processes. Contact us if your application is not listed - most systems can be configured to order.</p>' +
        '<div style="margin-top:1.4rem">' + apps.map(function (a) {
          return '<span class="tag">' + esc(a) + '</span>';
        }).join('') + '</div>' +
        '<p style="margin-top:2rem"><a class="btn btn-outline-dark" href="/applications">See all applications</a></p>' +
        '</div></div></div></div>';

      var relatedHtml = '';
      if (data.related && data.related.length) {
        relatedHtml = '<div class="section"><div class="container">' +
          '<div class="section-head"><span class="eyebrow">You May Also Like</span>' +
          '<h2 class="section-title">Related Products</h2></div>' +
          '<div class="card-grid">' + data.related.map(renderProductCard).join('') + '</div></div></div>';
      }

      if (host) host.innerHTML = html + relatedHtml;
      var crumb = $('#breadcrumb-current');
      if (crumb) crumb.textContent = p.name;
    }).catch(function (err) {
      showError(host, err.message);
      applySeo({ title: 'Product not found | Yuchuan Air' });
    });
  }

  function initApplications() {
    fillSettings();
    applySeo({ title: 'Industrial Applications | ' + (site.settings.shortName || 'Yuchuan Air') });
    if (SSR) return;
    var host = $('#applications-list');
    if (host) {
      host.innerHTML = (site.applications || []).length
        ? (site.applications || []).map(renderAppCard).join('')
        : '<div class="empty-state">No applications published yet.</div>';
    }
  }

  function initAbout() {
    fillSettings();
    if (SSR) return;
    renderStats();
    applySeo({ title: 'About Us | ' + (site.settings.shortName || 'Yuchuan Air') });
    var cert = $('#about-certifications');
    if (cert && site.settings.certifications) cert.textContent = site.settings.certifications;
  }

  function initBlog() {
    fillSettings();
    applySeo({ title: 'Blog & Insights | ' + (site.settings.shortName || 'Yuchuan Air') });
    var grid = $('#post-list');
    var countEl = $('#result-count');
    var searchInput = $('#filter-q');
    var timer = null;

    if (searchInput) {
      var params = new URLSearchParams(location.search);
      var q = params.get('q') || '';
      if (q) searchInput.value = q;
      searchInput.addEventListener('input', function () {
        window.clearTimeout(timer);
        timer = window.setTimeout(load, 250);
      });
    }

    function load() {
      var query = new URLSearchParams();
      var q = searchInput ? searchInput.value.trim() : '';
      if (q) query.set('q', q);
      if (grid) grid.innerHTML = '<p class="loading">Loading articles…</p>';
      api('/api/posts?' + query.toString()).then(function (data) {
        if (grid) {
          grid.innerHTML = data.items.length
            ? data.items.map(renderPostCard).join('')
            : '<div class="empty-state">No articles found.</div>';
        }
        if (countEl) countEl.textContent = 'Showing ' + data.items.length + ' article' + (data.items.length === 1 ? '' : 's');
      }).catch(function (err) { showError(grid, err.message); });
    }
    if (!SSR) load();
  }

  function initPost() {
    if (SSR) return; // full article HTML came from the server
    var parts = location.pathname.split('/').filter(Boolean);
    var slug = parts.length > 1 ? decodeURIComponent(parts[1]) : (new URLSearchParams(location.search).get('slug') || '');
    var host = $('#post-detail');
    if (!slug) { showError(host, 'Article not found.'); return; }

    api('/api/posts/' + encodeURIComponent(slug)).then(function (data) {
      var p = data.item;
      applySeo({
        title: p.seoTitle || (p.title + ' | ' + (site.settings.shortName || 'Yuchuan Air')),
        description: p.seoDescription || p.excerpt,
        type: 'article'
      });
      var cover = p.cover
        ? '<img src="' + esc(p.cover) + '" alt="' + esc(p.title) + '" width="1200" height="600">'
        : '';
      var html = '<div class="container-narrow article">' +
        '<div class="article-meta">' + esc(formatDate(p.date)) + ' &nbsp;·&nbsp; ' +
        esc(p.category || 'Insights') + ' &nbsp;·&nbsp; ' + esc(p.author || '') + '</div>' +
        '<h1 style="font-size:clamp(1.9rem,4vw,2.8rem);text-transform:none">' + esc(p.title) + '</h1>' +
        (cover ? '<div style="margin:1.5rem 0 2rem;border-radius:6px;overflow:hidden">' + cover + '</div>' : '') +
        '<p style="font-size:1.15rem;color:#5a6f7e">' + esc(p.excerpt) + '</p>' +
        // Article HTML is authored by trusted administrators in the CMS.
        '<div class="article-body">' + String(p.content || '') + '</div>' +
        '<div style="margin-top:3rem;padding-top:1.5rem;border-top:1px solid #dde5ea">' +
        '<a class="btn btn-outline-dark btn-small" href="/blog">← Back to Blog</a></div></div>';

      var recentHtml = '';
      if (data.recent && data.recent.length) {
        recentHtml = '<div class="section section--grey"><div class="container">' +
          '<div class="section-head"><span class="eyebrow">Keep Reading</span>' +
          '<h2 class="section-title">Latest Insights</h2></div>' +
          '<div class="card-grid">' + data.recent.map(renderPostCard).join('') + '</div></div></div>';
      }
      if (host) host.innerHTML = html + recentHtml;
      var crumb = $('#breadcrumb-current');
      if (crumb) crumb.textContent = p.title;
    }).catch(function (err) {
      showError(host, err.message);
      applySeo({ title: 'Article not found | Yuchuan Air' });
    });
  }

  function initContact() {
    fillSettings();
    applySeo({ title: 'Contact Us & Request a Quote | ' + (site.settings.shortName || 'Yuchuan Air') });

    if (!SSR) {
      var infoHost = $('#contact-info');
      if (infoHost) {
        var s = site.settings;
        var rows = [
          { icon: 'pin', label: 'Head Office', value: s.address },
          { icon: 'mail', label: 'Email', value: s.email, href: 'mailto:' + s.email },
          { icon: 'phone', label: 'Phone', value: s.phone, href: 'tel:' + String(s.phone || '').replace(/\s/g, '') },
          {
            icon: 'phone', label: 'WhatsApp', value: s.whatsapp,
            href: s.whatsapp ? 'https://wa.me/' + String(s.whatsapp).replace(/[^0-9]/g, '') : ''
          },
          { icon: 'clock', label: 'Working Hours', value: s.workingHours }
        ];
        infoHost.innerHTML = rows.filter(function (r) { return r.value; }).map(function (r) {
          var content = r.href
            ? '<a href="' + esc(r.href) + '">' + esc(r.value) + '</a>'
            : esc(r.value);
          return '<div class="info-row"><span class="info-icon">' + icon(r.icon) + '</span>' +
            '<div><h3>' + esc(r.label) + '</h3><p>' + content + '</p></div></div>';
        }).join('');
      }
    }

    var form = $('#inquiry-form');
    if (!form) return;
    var productField = $('#inquiry-product');
    var params = new URLSearchParams(location.search);
    var requested = params.get('product');
    if (productField && requested) productField.value = requested;

    var touch = firstTouch();
    function applyAttribution() {
      Object.keys(touch).forEach(function (key) {
        var el = form.querySelector('[name="' + key + '"]');
        if (el) el.value = touch[key] || '';
      });
      var pageEl = form.querySelector('[name="page_url"]');
      if (pageEl) pageEl.value = location.href;
    }
    applyAttribution();

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var status = $('#form-status');
      var submit = $('#form-submit');
      var payload = {};
      Array.prototype.slice.call(new FormData(form).entries()).forEach(function (entry) {
        payload[entry[0]] = String(entry[1]);
      });
      if (submit) { submit.disabled = true; submit.textContent = 'Sending…'; }
      if (status) { status.className = 'form-status'; status.textContent = ''; }

      api('/api/inquiries', { method: 'POST', body: payload }).then(function () {
        form.reset();
        applyAttribution();
        fireConversion(touch.utm_source || touch.gclid || document.referrer || 'direct');
        if (status) {
          status.className = 'form-status is-visible is-ok';
          status.textContent = 'Thank you! Your inquiry has been received. Our engineering team will reply shortly.';
        }
      }).catch(function (err) {
        if (status) {
          status.className = 'form-status is-visible is-error';
          status.textContent = err.message;
        }
      }).then(function () {
        if (submit) { submit.disabled = false; submit.textContent = 'Send Inquiry'; }
      });
    });
  }

  /* ----------------------------- bootstrap ----------------------------- */

  var PAGES = {
    home: initHome,
    products: initProducts,
    product: initProductDetail,
    applications: initApplications,
    about: initAbout,
    blog: initBlog,
    post: initPost,
    contact: initContact
  };

  document.addEventListener('DOMContentLoaded', function () {
    firstTouch(); // remember the true first landing page for lead attribution
    api('/api/site').then(function (data) {
      site = data;
      renderHeader();
      renderFooter();
      wireNav();
      fillSettings();
      var page = document.body.getAttribute('data-page') || '';
      var handler = PAGES[page];
      if (handler) handler();
      else applySeo();
    }).catch(function (err) {
      var header = $('#site-header');
      if (header) header.innerHTML = '<div style="padding:1rem;text-align:center;background:#fdecec;color:#a12a20">' +
        'Unable to load site data: ' + esc(err.message) + '</div>';
    });
  });
})();
