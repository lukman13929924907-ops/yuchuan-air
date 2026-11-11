'use strict';

/**
 * Cookie consent + Google Consent Mode v2.
 *
 * Design:
 *  - The server emits a `consent default = denied` command BEFORE any Google
 *    tag, so GA4 / Ads / GTM stay cookieless until the visitor accepts.
 *  - Meta Pixel and LinkedIn Insight do not support Consent Mode, so they are
 *    NOT present in the HTML at all; they are injected only after acceptance.
 *  - The choice is remembered in localStorage. Visitors can reopen the banner
 *    from the "Cookie settings" link in the footer at any time (withdrawal).
 *  - No third-party dependency, no network call before consent.
 *
 * Configuration comes from window.YC_TRACK (server-rendered, public IDs only).
 */
(function () {
  var t = window.YC_TRACK || {};
  var KEY = 'yc_consent_v1';
  var banner = null;

  function read() {
    try { return window.localStorage.getItem(KEY); } catch (err) { return null; }
  }
  function save(value) {
    try { window.localStorage.setItem(KEY, value); } catch (err) { /* private mode */ }
  }
  function onReady(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn, { once: true });
    } else {
      fn();
    }
  }

  /** Push the Consent Mode update. Safe when no Google tag is configured. */
  function updateConsent(granted) {
    var v = granted ? 'granted' : 'denied';
    if (typeof window.gtag === 'function') {
      window.gtag('consent', 'update', {
        'ad_storage': v,
        'ad_user_data': v,
        'ad_personalization': v,
        'analytics_storage': v,
        'functionality_storage': 'granted',
        'personalization_storage': v,
        'security_storage': 'granted'
      });
    }
    if (window.dataLayer) {
      window.dataLayer.push({ event: granted ? 'yc_consent_granted' : 'yc_consent_denied' });
    }
  }

  function injectScript(src) {
    var tag = document.createElement('script');
    tag.async = true;
    tag.src = src;
    document.head.appendChild(tag);
  }

  /** Load the non-Consent-Mode vendors. Called only after explicit acceptance. */
  function loadOptionalTags() {
    if (t.meta && !window.fbq) {
      var fbq = window.fbq = function () {
        fbq.callMethod ? fbq.callMethod.apply(fbq, arguments) : fbq.queue.push(arguments);
      };
      if (!window._fbq) window._fbq = fbq;
      fbq.push = fbq;
      fbq.loaded = true;
      fbq.version = '2.0';
      fbq.queue = [];
      injectScript('https://connect.facebook.net/en_US/fbevents.js');
      window.fbq('init', t.meta);
      window.fbq('track', 'PageView');
    }
    if (t.linkedin && !window._linkedin_data_partner_ids) {
      window._linkedin_data_partner_ids = [t.linkedin];
      injectScript('https://snap.licdn.com/li.lms-analytics/insight.min.js');
    }
  }

  function hideBanner() {
    if (banner && banner.parentNode) banner.parentNode.removeChild(banner);
    banner = null;
  }

  function showBanner() {
    if (banner) return;
    banner = document.createElement('div');
    banner.className = 'yc-consent';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-label', 'Cookie preferences');
    banner.innerHTML =
      '<div class="yc-consent-inner">' +
      '<div class="yc-consent-text"><strong>Your privacy matters</strong>' +
      '<p>We use optional analytics and advertising cookies to understand how this site is used. ' +
      'They only load if you agree, and you can change your choice at any time. ' +
      '<a href="/privacy#cookies">Read our Privacy Policy</a>.</p></div>' +
      '<div class="yc-consent-actions">' +
      '<button type="button" class="btn btn-outline-dark btn-small" data-yc="deny">Essential only</button>' +
      '<button type="button" class="btn btn-primary btn-small" data-yc="grant">Accept all</button>' +
      '</div></div>';
    document.body.appendChild(banner);

    banner.addEventListener('click', function (event) {
      var btn = event.target && event.target.closest ? event.target.closest('[data-yc]') : null;
      if (!btn) return;
      var granted = btn.getAttribute('data-yc') === 'grant';
      save(granted ? 'granted' : 'denied');
      updateConsent(granted);
      if (granted) loadOptionalTags();
      hideBanner();
    });
  }

  /** Public API so the footer link can reopen the preferences dialog. */
  window.YC_CONSENT = {
    open: function () {
      if (!t.hasOptional || !t.consentRequired || !window.localStorage) {
        window.location.href = '/privacy#cookies';
        return;
      }
      onReady(showBanner);
    },
    status: read,
    reset: function () { try { window.localStorage.removeItem(KEY); } catch (err) {} }
  };

  // Footer "Cookie settings" link (event delegation also covers SSR markup).
  onReady(function () {
    document.addEventListener('click', function (event) {
      var link = event.target && event.target.closest
        ? event.target.closest('[data-yc-consent]') : null;
      if (!link) return;
      event.preventDefault();
      window.YC_CONSENT.open();
    });
  });

  // --- Apply the stored choice as early as possible --------------------
  var state = read();
  var gate = Boolean(t.consentRequired && t.hasOptional);

  if (!gate) {
    // Consent gate disabled in Site Settings: behave like a granted visitor.
    onReady(function () { if (t.hasOptional) loadOptionalTags(); });
  } else if (state === 'granted') {
    updateConsent(true);
    onReady(loadOptionalTags);
  } else if (state === 'denied') {
    updateConsent(false);
  } else {
    onReady(showBanner);
  }
})();
