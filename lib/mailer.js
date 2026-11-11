'use strict';

/**
 * Outbound inquiry email over an HTTP mail API.
 *
 * Design constraints (important):
 *  - No third-party packages. Uses the global fetch available in Node 18+
 *    and in edge runtimes, so this module keeps working if the site is later
 *    moved to a serverless environment.
 *  - Credentials come ONLY from config.json or EMAIL_* environment variables.
 *    They must NEVER be stored in data/db.json, because /api/site returns
 *    db.settings verbatim to every visitor.
 *  - Fire-and-forget: a failed email must never fail the customer's inquiry.
 *
 * Providers: resend | postmark | custom
 *   EMAIL_PROVIDER=resend
 *   EMAIL_API_KEY=re_xxxxxxxx            (or RESEND_API_KEY)
 *   EMAIL_FROM="Yuchuan Air <noreply@yourdomain.com>"
 *   EMAIL_TO=info@hanxvonfluid.cn
 *   EMAIL_ENDPOINT=https://...           (only for provider=custom)
 */

const REQUEST_TIMEOUT_MS = 8000;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function clean(value, max) {
  return String(value === undefined || value === null ? '' : value)
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, max === undefined ? 200 : max);
}

function readConfig(config) {
  const raw = (config && config.email) || {};
  const env = process.env || {};
  return {
    provider: String(env.EMAIL_PROVIDER || raw.provider || '').trim().toLowerCase(),
    apiKey: String(env.EMAIL_API_KEY || env.RESEND_API_KEY || raw.apiKey || '').trim(),
    from: String(env.EMAIL_FROM || raw.from || '').trim(),
    to: String(env.EMAIL_TO || raw.to || '').trim(),
    endpoint: String(env.EMAIL_ENDPOINT || raw.endpoint || '').trim()
  };
}

/** Effective delivery address: the admin panel can override the config default. */
function recipient(cfg, settings) {
  const override = String((settings || {}).inquiryEmail || '').trim();
  return override && EMAIL_RE.test(override) ? override : cfg.to;
}

function buildMessage(settings, item, base, cfg) {
  const src = item.source || {};
  const who = clean(item.name, 80) || 'Buyer';
  const product = clean(item.product, 80) || 'General inquiry';
  const country = clean(item.country, 60) || '-';
  const subject = '[Inquiry] ' + who + ' - ' + product + ' - ' + country;

  const utm = [src.utmSource || src.utm_source, src.utmMedium || src.utm_medium,
    src.utmCampaign || src.utm_campaign].filter(Boolean).map(function (v) { return clean(v, 60); }).join(' / ');
  const clickIds = [src.gclid, src.fbclid, src.msclkid].filter(Boolean)
    .map(function (v) { return clean(v, 100); }).join(', ');

  const lines = [
    'NEW EXPORT INQUIRY - ' + clean(settings.shortName || 'Yuchuan Air', 80),
    '',
    'Name:    ' + clean(item.name, 120),
    'Email:   ' + clean(item.email, 160),
    'Company: ' + clean(item.company || '-', 160),
    'Country: ' + clean(item.country || '-', 100),
    'Phone:   ' + clean(item.phone || '-', 80),
    'Product: ' + clean(item.product || '-', 160),
    '',
    '--- attribution ---',
    'Channel:       ' + clean(item.channel || '-', 60),
    'UTM:           ' + (utm || '-'),
    'Click IDs:     ' + (clickIds || '-'),
    'Referrer:      ' + clean(src.referrer || '-', 200),
    'Landing page:  ' + clean(src.landingPage || src.landing_page || '-', 200),
    'Language:      ' + clean(src.language || '-', 20),
    '',
    '--- message ---',
    String(item.message || '').slice(0, 4000),
    '',
    '-------------------------',
    'Reply directly to this email to answer the buyer (Reply-To is set automatically).',
    'All inquiries: ' + base + '/admin',
    'Received (UTC): ' + clean(item.createdAt, 40)
  ];

  return {
    id: clean(item.id, 80),
    from: cfg.from,
    to: cfg.to,
    subject: subject,
    text: lines.join('\n'),
    replyTo: EMAIL_RE.test(String(item.email || '')) ? String(item.email).trim() : ''
  };
}

function buildRequest(cfg, message) {
  if (cfg.provider === 'resend') {
    return {
      url: 'https://api.resend.com/emails',
      headers: {
        'Authorization': 'Bearer ' + cfg.apiKey,
        'Content-Type': 'application/json'
      },
      body: {
        from: message.from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        reply_to: message.replyTo || undefined
      }
    };
  }
  if (cfg.provider === 'postmark') {
    return {
      url: 'https://api.postmarkapp.com/email',
      headers: {
        'X-Postmark-Server-Token': cfg.apiKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: {
        From: message.from,
        To: message.to,
        Subject: message.subject,
        TextBody: message.text,
        ReplyTo: message.replyTo || undefined,
        MessageStream: 'outbound'
      }
    };
  }
  if (cfg.provider === 'custom' && /^https:\/\//i.test(cfg.endpoint)) {
    return {
      url: cfg.endpoint,
      headers: {
        'Authorization': 'Bearer ' + cfg.apiKey,
        'Content-Type': 'application/json'
      },
      body: {
        from: message.from,
        to: message.to,
        subject: message.subject,
        text: message.text,
        replyTo: message.replyTo,
        type: 'inquiry',
        inquiryId: message.id
      }
    };
  }
  return null;
}

/** Returns true when a send was attempted; false when email is not configured. */
function sendInquiryEmail(config, settings, item, base) {
  const cfg = readConfig(config);
  cfg.to = recipient(cfg, settings);
  if (!cfg.provider || !cfg.apiKey || !cfg.from || !cfg.to) return false;
  if (typeof fetch !== 'function') {
    console.warn('[mailer] global fetch unavailable; email notification skipped');
    return false;
  }

  const message = buildMessage(settings || {}, item, base, cfg);
  const request = buildRequest(cfg, message);
  if (!request) {
    console.warn('[mailer] unsupported EMAIL_PROVIDER: ' + cfg.provider);
    return false;
  }

  const controller = new AbortController();
  const timer = setTimeout(function () { controller.abort(); }, REQUEST_TIMEOUT_MS);
  if (typeof timer.unref === 'function') timer.unref();

  Promise.resolve()
    .then(function () {
      return fetch(request.url, {
        method: 'POST',
        headers: request.headers,
        body: JSON.stringify(request.body),
        signal: controller.signal
      });
    })
    .then(function (response) {
      if (response.ok) {
        console.log('[mailer] inquiry email sent to ' + cfg.to);
        return null;
      }
      return response.text().then(function (text) {
        console.warn('[mailer] provider returned ' + response.status + ': ' + clean(text, 200));
      });
    })
    .catch(function (err) {
      console.warn('[mailer] email send failed: ' + (err && err.message));
    })
    .finally(function () { clearTimeout(timer); });

  return true;
}

/** Safe to expose to the admin panel: never includes the API key. */
function status(config, settings) {
  const cfg = readConfig(config);
  const to = recipient(cfg, settings);
  return {
    enabled: Boolean(cfg.provider && cfg.apiKey && cfg.from && to),
    provider: cfg.provider || '',
    to: to || ''
  };
}

module.exports = {
  sendInquiryEmail: sendInquiryEmail,
  status: status,
  readConfig: readConfig,
  buildMessage: buildMessage,
  buildRequest: buildRequest
};
