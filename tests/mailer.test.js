'use strict';

/**
 * Unit tests for lib/mailer.js.
 * Run: node tests/mailer.test.js
 * No network access: global.fetch is stubbed.
 */

const assert = require('assert');
const mailer = require('../lib/mailer');

const ENV_KEYS = ['EMAIL_PROVIDER', 'EMAIL_API_KEY', 'RESEND_API_KEY',
  'EMAIL_FROM', 'EMAIL_TO', 'EMAIL_ENDPOINT'];

function clearEnv() {
  ENV_KEYS.forEach(function (key) { delete process.env[key]; });
}

let pass = 0;
let fail = 0;

function ck(name, fn) {
  try { fn(); pass += 1; console.log('PASS ' + name); }
  catch (err) { fail += 1; console.log('FAIL ' + name + ' :: ' + err.message); }
}

async function ack(name, fn) {
  try { await fn(); pass += 1; console.log('PASS ' + name); }
  catch (err) { fail += 1; console.log('FAIL ' + name + ' :: ' + err.message); }
}

const settings = {
  shortName: 'Yuchuan Air',
  inquiryEmail: 'info@hanxvonfluid.cn'
};

const item = {
  id: 'inq-unit-1',
  name: 'John\r\nSmith',
  email: 'buyer@example.com',
  company: 'ACME Industrial Ltd',
  country: 'Germany',
  phone: '+49 30 123456',
  product: 'HydroGuard WDC-12000',
  message: 'Please quote two units with spare filter cartridges.',
  channel: 'organic-search',
  createdAt: '2026-11-11T06:00:00.000Z',
  source: {
    utmSource: 'google', utmMedium: 'organic', utmCampaign: 'dust-collector',
    gclid: '', fbclid: '', referrer: 'https://www.google.com/',
    landingPage: 'https://example.com/products/hydroguard', language: 'en-US'
  }
};

const cfg = {
  email: {
    provider: 'resend',
    apiKey: 're_test_secret_123',
    from: 'Yuchuan Air <noreply@example.com>',
    to: 'fallback@example.com',
    endpoint: ''
  }
};

const BASE = 'https://example.com';

clearEnv();

ck('readConfig reads config.json values', function () {
  const c = mailer.readConfig(cfg);
  assert.strictEqual(c.provider, 'resend');
  assert.strictEqual(c.apiKey, 're_test_secret_123');
  assert.strictEqual(c.to, 'fallback@example.com');
});

ck('environment variables override config.json', function () {
  process.env.EMAIL_API_KEY = 're_from_env';
  process.env.EMAIL_TO = 'env@example.com';
  const c = mailer.readConfig(cfg);
  assert.strictEqual(c.apiKey, 're_from_env');
  assert.strictEqual(c.to, 'env@example.com');
  clearEnv();
});

ck('RESEND_API_KEY works as a fallback', function () {
  process.env.RESEND_API_KEY = 're_resend_env';
  assert.strictEqual(mailer.readConfig({}).apiKey, 're_resend_env');
  clearEnv();
});

ck('buildMessage strips CR/LF from the subject', function () {
  const m = mailer.buildMessage(settings, item, BASE, mailer.readConfig(cfg));
  assert.ok(!/[\r\n]/.test(m.subject), 'subject must not contain newlines');
  assert.strictEqual(m.subject.indexOf('[Inquiry]'), 0);
  assert.ok(m.subject.indexOf('HydroGuard') > -1);
  assert.ok(m.subject.indexOf('Germany') > -1);
});

ck('buildMessage sets Reply-To to the buyer email', function () {
  const m = mailer.buildMessage(settings, item, BASE, mailer.readConfig(cfg));
  assert.strictEqual(m.replyTo, 'buyer@example.com');
});

ck('buildMessage includes attribution and the full message', function () {
  const m = mailer.buildMessage(settings, item, BASE, mailer.readConfig(cfg));
  assert.ok(m.text.indexOf('organic-search') > -1);
  assert.ok(m.text.indexOf('google / organic / dust-collector') > -1);
  assert.ok(m.text.indexOf('landing page') > -1 || m.text.indexOf('Landing page') > -1);
  assert.ok(m.text.indexOf('spare filter cartridges') > -1);
  assert.ok(m.text.indexOf(BASE + '/admin') > -1);
});

ck('buildRequest: resend shape', function () {
  const c = mailer.readConfig(cfg);
  const r = mailer.buildRequest(c, mailer.buildMessage(settings, item, BASE, c));
  assert.strictEqual(r.url, 'https://api.resend.com/emails');
  assert.strictEqual(r.headers.Authorization, 'Bearer re_test_secret_123');
  assert.ok(Array.isArray(r.body.to));
  assert.strictEqual(r.body.reply_to, 'buyer@example.com');
});

ck('buildRequest: postmark shape', function () {
  const c = Object.assign({}, mailer.readConfig(cfg), { provider: 'postmark' });
  const r = mailer.buildRequest(c, mailer.buildMessage(settings, item, BASE, c));
  assert.strictEqual(r.url, 'https://api.postmarkapp.com/email');
  assert.strictEqual(r.headers['X-Postmark-Server-Token'], 're_test_secret_123');
  assert.ok(r.body.TextBody.indexOf('ACME Industrial') > -1);
});

ck('buildRequest: custom HTTPS endpoint', function () {
  const c = Object.assign({}, mailer.readConfig(cfg), {
    provider: 'custom', endpoint: 'https://hooks.example.com/mail'
  });
  const r = mailer.buildRequest(c, mailer.buildMessage(settings, item, BASE, c));
  assert.strictEqual(r.url, 'https://hooks.example.com/mail');
  assert.strictEqual(r.body.type, 'inquiry');
});

ck('buildRequest rejects unsupported or non-HTTPS endpoints', function () {
  const c = Object.assign({}, mailer.readConfig(cfg), { provider: 'unknown' });
  assert.strictEqual(mailer.buildRequest(c, {}), null);
  const d = Object.assign({}, mailer.readConfig(cfg), {
    provider: 'custom', endpoint: 'http://insecure.example.com/mail'
  });
  assert.strictEqual(mailer.buildRequest(d, {}), null);
});

ck('status never exposes the API key', function () {
  const st = mailer.status(cfg, settings);
  assert.strictEqual(st.enabled, true);
  assert.strictEqual(st.provider, 'resend');
  assert.strictEqual(st.to, 'info@hanxvonfluid.cn');
  assert.strictEqual(JSON.stringify(st).indexOf('re_test_secret_123'), -1);
  assert.strictEqual(Object.keys(st).indexOf('apiKey'), -1);
});

(async function () {
  const originalFetch = global.fetch;
  const originalWarn = console.warn;
  let calls = [];
  console.warn = function () { /* keep failure-path tests quiet */ };

  global.fetch = function (url, options) {
    calls.push({ url: url, options: options });
    return Promise.resolve({ ok: true, status: 200 });
  };

  await ack('unconfigured email is a silent no-op', async function () {
    calls = [];
    const attempted = mailer.sendInquiryEmail({ email: {} }, settings, item, BASE);
    assert.strictEqual(attempted, false);
    assert.strictEqual(calls.length, 0);
  });

  await ack('configured email sends to the admin recipient with Reply-To', async function () {
    calls = [];
    const attempted = mailer.sendInquiryEmail(cfg, settings, item, BASE);
    assert.strictEqual(attempted, true);
    await new Promise(function (resolve) { setImmediate(resolve); });
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].url, 'https://api.resend.com/emails');
    const body = JSON.parse(calls[0].options.body);
    assert.strictEqual(body.to[0], 'info@hanxvonfluid.cn');
    assert.strictEqual(body.reply_to, 'buyer@example.com');
    assert.strictEqual(calls[0].options.headers.Authorization, 'Bearer re_test_secret_123');
  });

  await ack('provider failure never throws into the request handler', async function () {
    global.fetch = function () { return Promise.reject(new Error('network down')); };
    mailer.sendInquiryEmail(cfg, settings, item, BASE);
    await new Promise(function (resolve) { setImmediate(resolve); });
    assert.ok(true);
  });

  global.fetch = originalFetch;
  console.warn = originalWarn;
  clearEnv();

  console.log('RESULT pass=' + pass + ' fail=' + fail);
  if (fail) process.exit(1);
})();
