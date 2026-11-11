/* ==================================================================
   Yuchuan Air - admin panel controller
   Panels: Dashboard, Products, Categories, Articles, Applications,
   Inquiries, Site Settings, Backup & Security.

   Every write goes through /api/admin/* (httpOnly session cookie).
   ================================================================== */

(function () {
  'use strict';

  var db = null;
  var panel = 'dashboard';
  var username = '';
  var toastTimer = null;
  var MAX_UPLOAD_BYTES = 6 * 1024 * 1024;

  /* ----------------------------- helpers ----------------------------- */

  function $(selector, root) { return (root || document).querySelector(selector); }
  function $$(selector, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(selector));
  }
  function esc(value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/[&<>"']/g, function (ch) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
      });
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
  function toast(message, isError) {
    var el = $('#toast');
    if (!el) return;
    el.textContent = message;
    el.className = 'toast' + (isError ? ' is-error' : '');
    el.hidden = false;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () { el.hidden = true; }, 3400);
  }
  function shortDate(value) {
    if (!value) return '—';
    var d = new Date(value);
    if (isNaN(d.getTime())) return String(value);
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }
  function statusPill(on, onText, offText) {
    return '<span class="status-pill ' + (on ? 'on' : 'off') + '">' +
      esc(on ? (onText || 'Published') : (offText || 'Draft')) + '</span>';
  }
  function truncate(value, max) {
    var str = String(value || '');
    return str.length > max ? str.slice(0, max) + '…' : str;
  }

  /* ----------------------------- form schemas ----------------------------- */

  var SCHEMAS = {
    products: {
      title: 'Product',
      fields: [
        { key: 'name', label: 'Product Name', type: 'text', required: true },
        { key: 'slug', label: 'URL Slug', type: 'text', hint: 'Leave blank to generate automatically from the name.' },
        { section: 'Classification' },
        { key: 'category', label: 'Category', type: 'category' },
        { key: 'series', label: 'Series / Model Line', type: 'text', hint: 'e.g. AeroFlex, HydroGuard, PureCore' },
        { key: 'order', label: 'Display Order', type: 'number', hint: 'Lower numbers appear first.' },
        { key: 'image', label: 'Product Image', type: 'image', hint: 'Upload a JPG/PNG/WEBP (max 6 MB) or paste an image URL. Leave empty to use the built-in illustration.' },
        { section: 'Content' },
        { key: 'summary', label: 'Short Summary', type: 'textarea', required: true, hint: 'Shown on product cards and meta descriptions.' },
        { key: 'description', label: 'Full Description', type: 'textarea' },
        { key: 'features', label: 'Key Features', type: 'lines', hint: 'One feature per line.' },
        { key: 'specs', label: 'Specifications', type: 'pairs', hint: 'One per line, format:  Airflow: 1,500 CFM' },
        { key: 'applications', label: 'Typical Applications', type: 'csv', hint: 'Comma separated, e.g. Welding, Grinding, Sanding' },
        { section: 'Publishing' },
        { key: 'published', label: 'Published on website', type: 'checkbox', default: true },
        { key: 'featured', label: 'Featured on homepage', type: 'checkbox' }
      ]
    },
    categories: {
      title: 'Category',
      fields: [
        { key: 'name', label: 'Category Name', type: 'text', required: true },
        { key: 'slug', label: 'URL Slug', type: 'text', hint: 'Used in /products?category=<slug>. Leave blank to auto-generate.' },
        { key: 'series', label: 'Series Name', type: 'text' },
        { key: 'description', label: 'Description', type: 'textarea' },
        { key: 'image', label: 'Category Image', type: 'image' },
        { key: 'order', label: 'Display Order', type: 'number' },
        { key: 'published', label: 'Published on website', type: 'checkbox', default: true }
      ]
    },
    posts: {
      title: 'Article',
      fields: [
        { key: 'title', label: 'Article Title', type: 'text', required: true },
        { key: 'slug', label: 'URL Slug', type: 'text', hint: 'Leave blank to auto-generate from the title.' },
        { section: 'Article' },
        { key: 'category', label: 'Category / Topic', type: 'text', hint: 'e.g. Engineering Guide, Health & Safety' },
        { key: 'author', label: 'Author', type: 'text' },
        { key: 'date', label: 'Publish Date', type: 'date' },
        { key: 'cover', label: 'Cover Image', type: 'image', hint: 'Optional. Upload or paste an image URL.' },
        { key: 'excerpt', label: 'Excerpt', type: 'textarea', hint: 'Short summary shown on blog cards.' },
        { key: 'content', label: 'Article Body (HTML)', type: 'html', hint: 'HTML is allowed: <p>, <h2>, <h3>, <ul>, <li>, <strong>. Only trusted administrators can edit this field.' },
        { section: 'SEO & Publishing' },
        { key: 'seoTitle', label: 'SEO Title', type: 'text' },
        { key: 'seoDescription', label: 'SEO Description', type: 'textarea' },
        { key: 'order', label: 'Display Order', type: 'number' },
        { key: 'published', label: 'Published on website', type: 'checkbox', default: true }
      ]
    },
    applications: {
      title: 'Application',
      fields: [
        { key: 'name', label: 'Application Name', type: 'text', required: true },
        { key: 'slug', label: 'URL Slug', type: 'text' },
        { key: 'description', label: 'Description', type: 'textarea', required: true },
        { key: 'icon', label: 'Icon Name', type: 'text', hint: 'Optional label used by the front-end.' },
        { key: 'image', label: 'Image', type: 'image' },
        { key: 'order', label: 'Display Order', type: 'number' },
        { key: 'published', label: 'Published on website', type: 'checkbox', default: true }
      ]
    },
    faqs: {
      title: 'FAQ',
      fields: [
        { key: 'question', label: 'Question', type: 'text', required: true, hint: 'Write the exact question a buyer (or an AI assistant) would ask.' },
        { key: 'answer', label: 'Answer', type: 'textarea', required: true, hint: 'Answer in 2-4 self-contained, factual sentences. This is the block AI answer engines quote most often.' },
        { section: 'Placement' },
        { key: 'scope', label: 'Show on', type: 'text', hint: 'general (homepage), products (product & category pages), company (about/contact), resources (articles).' },
        { key: 'order', label: 'Display Order', type: 'number' },
        { key: 'published', label: 'Published on website', type: 'checkbox', default: true }
      ]
    }
  };

  var SETTING_FIELDS = [
    { section: 'Company Identity' },
    { key: 'companyName', label: 'Full Legal Company Name', type: 'text' },
    { key: 'shortName', label: 'Short Brand Name', type: 'text' },
    { key: 'tagline', label: 'Tagline / Header Subtitle', type: 'text' },
    { key: 'founded', label: 'Founded Year', type: 'text', hint: 'Used in Organization JSON-LD and llms.txt. Currently 2018.' },
    { key: 'sinceLabel', label: 'Homepage "Since …" Eyebrow', type: 'text', hint: 'Shown above the commitment section on the homepage. Keep it consistent with Founded Year.' },
    { key: 'certifications', label: 'Certifications Line', type: 'text', hint: 'Only list certificates the company actually holds; shown in the footer, About page and llms.txt.' },
    { section: 'Contact Details (shown in top bar, footer and contact page)' },
    { key: 'email', label: 'Sales Email', type: 'text' },
    { key: 'phone', label: 'Phone', type: 'text', hint: 'International format, e.g. +86 531 8351 6866. Whitespace is stripped for the tel: link.' },
    { key: 'whatsapp', label: 'WhatsApp', type: 'text', hint: 'Full number with country code, e.g. +86 172 7882 7749. Digits are used for the wa.me link.' },
    { key: 'address', label: 'Address', type: 'text', hint: 'Full street address in English, used on the contact page, footer and privacy notice.' },
    { key: 'addressLocality', label: 'City (PostalAddress schema)', type: 'text' },
    { key: 'addressRegion', label: 'State / Province (PostalAddress schema)', type: 'text' },
    { key: 'addressCountry', label: 'Country code (PostalAddress schema)', type: 'text', hint: 'ISO 3166-1 alpha-2, e.g. CN.' },
    { key: 'workingHours', label: 'Working Hours', type: 'text', hint: 'Include the time zone for overseas buyers, e.g. 08:00 - 21:00 Beijing Time (GMT+8).' },
    { section: 'Homepage Content' },
    { key: 'heroBadge', label: 'Hero Badge', type: 'text' },
    { key: 'heroTitle', label: 'Hero Headline', type: 'text' },
    { key: 'heroText', label: 'Hero Paragraph', type: 'textarea' },
    { key: 'heroPrimaryLabel', label: 'Primary Button Label', type: 'text' },
    { key: 'heroSecondaryLabel', label: 'Secondary Button Label', type: 'text' },
    { key: 'introTitle', label: 'Intro Section Title', type: 'text' },
    { key: 'introText', label: 'Intro Section Text', type: 'textarea' },
    { key: 'commitmentTitle', label: 'Commitment Section Title', type: 'text' },
    { key: 'commitmentText', label: 'Commitment Section Text', type: 'textarea' },
    { key: 'resourcesTitle', label: 'Resources Section Title', type: 'text' },
    { key: 'resourcesText', label: 'Resources Section Text', type: 'textarea' },
    { key: 'ctaTitle', label: 'Call-to-Action Title', type: 'text' },
    { key: 'ctaText', label: 'Call-to-Action Text', type: 'textarea' },
    { key: 'stats', label: 'Homepage Stats', type: 'stats', hint: 'One per line, format:  35+|Countries with Installed Projects . Use verified figures only - AI answer engines cross-check them.' },
    { key: 'footerNote', label: 'Footer Description', type: 'textarea' },
    { section: 'SEO & Domain' },
    { key: 'siteUrl', label: 'Canonical Site URL', type: 'text', hint: 'REQUIRED before launch: https://yourdomain.com . Fixes canonical tags, JSON-LD, sitemap.xml, robots.txt and llms.txt.' },
    { key: 'seoTitle', label: 'Default SEO Title', type: 'text' },
    { key: 'seoDescription', label: 'Default SEO Description', type: 'textarea' },
    { key: 'seoKeywords', label: 'SEO Keywords', type: 'text' },
    { key: 'ogImage', label: 'Social Share Image (1200x630 PNG/JPG)', type: 'image', hint: 'Upload a 1200x630 image. SVG works for preview but LinkedIn / WhatsApp prefer PNG or JPG.' },
    { key: 'logoUrl', label: 'Company Logo (Organization schema)', type: 'image' },
    { section: 'Search Console & GEO / AI crawlers' },
    { key: 'googleSiteVerification', label: 'Google Search Console verification code', type: 'text', hint: 'Only the code from the meta tag, not the whole tag.' },
    { key: 'bingSiteVerification', label: 'Bing Webmaster verification code', type: 'text' },
    { key: 'indexNowKey', label: 'IndexNow key', type: 'text', hint: 'Optional. Used for instant submission to Bing / Yandex; see SEO-GEO.md.' },
    { key: 'aiCrawlersAllow', label: 'Allow AI / LLM crawlers (GPTBot, ClaudeBot, PerplexityBot…)', type: 'checkbox', default: true, hint: 'Keep this ON for GEO. Turning it off removes you from ChatGPT / Perplexity / Gemini answers.' },
    { section: 'Social profiles (entity trust / sameAs)' },
    { key: 'linkedinUrl', label: 'LinkedIn company page URL', type: 'text' },
    { key: 'facebookUrl', label: 'Facebook page URL', type: 'text' },
    { key: 'youtubeUrl', label: 'YouTube channel URL', type: 'text' },
    { key: 'twitterHandle', label: 'X / Twitter handle', type: 'text', hint: 'e.g. @yuchuanair' },
    { section: 'Analytics & conversion tracking' },
    { key: 'gaMeasurementId', label: 'Google Analytics 4 Measurement ID', type: 'text', hint: 'e.g. G-XXXXXXXXXX. Enables the generate_lead conversion event.' },
    { key: 'gtmContainerId', label: 'Google Tag Manager Container ID', type: 'text', hint: 'e.g. GTM-XXXXXXX. Leave empty if you use GA4 directly.' },
    { key: 'googleAdsId', label: 'Google Ads Conversion ID', type: 'text', hint: 'e.g. AW-1234567890' },
    { key: 'googleAdsConversionLabel', label: 'Google Ads Conversion Label', type: 'text' },
    { key: 'metaPixelId', label: 'Meta (Facebook) Pixel ID', type: 'text' },
    { key: 'linkedinPartnerId', label: 'LinkedIn Insight Tag Partner ID', type: 'text' },
    { section: 'Privacy & compliance (EU / UK visitors)' },
    { key: 'cookieConsentEnabled', label: 'Require cookie consent before loading analytics', type: 'checkbox', default: true, hint: 'Keep ON for English-speaking / EU / UK markets. Google tags run in Consent Mode v2 (denied by default); Meta and LinkedIn tags are only loaded after the visitor accepts. Turning it OFF may breach GDPR / ePrivacy and limits Google Ads conversion data.' },
    { key: 'privacyUpdatedAt', label: 'Privacy Policy "Last updated" date', type: 'text', hint: 'Shown on /privacy. Update it whenever you change the policy.' },
    { section: 'Lead notifications' },
    { key: 'inquiryEmail', label: 'Inquiry notification recipient', type: 'text', hint: 'Where new-inquiry emails are delivered (default info@hanxvonfluid.cn). For security the sending credentials are NOT stored here: set EMAIL_PROVIDER / EMAIL_API_KEY / EMAIL_FROM on the server. See DEPLOY.md section 16.4. Verify by submitting one test inquiry.' },
    { key: 'inquiryWebhook', label: 'Instant inquiry Webhook URL (optional extra channel)', type: 'text', hint: 'Paste a Slack, WeCom, Feishu, DingTalk, Zapier or Make webhook. Every new inquiry is pushed there within seconds, in addition to the email.' }
  ];

  /* ----------------------------- field rendering ----------------------------- */

  function fieldValue(field, item) {
    var value = item && item[field.key] !== undefined ? item[field.key] : field.default;
    switch (field.type) {
      case 'lines': return Array.isArray(value) ? value.join('\n') : '';
      case 'csv': return Array.isArray(value) ? value.join(', ') : '';
      case 'pairs': return Array.isArray(value)
        ? value.map(function (x) { return (x.k || '') + ': ' + (x.v || ''); }).join('\n') : '';
      case 'stats': return Array.isArray(value)
        ? value.map(function (x) { return (x.value || '') + '|' + (x.label || ''); }).join('\n') : '';
      case 'checkbox': return value === true;
      case 'number': return value === undefined || value === null || value === '' ? '' : String(value);
      default: return value === undefined || value === null ? '' : String(value);
    }
  }

  function parseField(field, control) {
    var raw = control.value;
    switch (field.type) {
      case 'number': return raw === '' ? 0 : Number(raw);
      case 'checkbox': return control.checked;
      case 'lines': return String(raw).split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
      case 'csv': return String(raw).split(',').map(function (s) { return s.trim(); }).filter(Boolean);
      case 'pairs': return String(raw).split('\n').map(function (line) {
        var i = line.indexOf(':');
        if (i < 0) return null;
        return { k: line.slice(0, i).trim(), v: line.slice(i + 1).trim() };
      }).filter(function (x) { return x && (x.k || x.v); });
      case 'stats': return String(raw).split('\n').map(function (line) {
        var i = line.indexOf('|');
        if (i < 0) return null;
        return { value: line.slice(0, i).trim(), label: line.slice(i + 1).trim() };
      }).filter(Boolean);
      default: return raw;
    }
  }

  function renderField(field, item, prefix) {
    if (field.section) return '<h3 class="form-section-title">' + esc(field.section) + '</h3>';
    var id = prefix + field.key;
    var value = fieldValue(field, item);
    var hint = field.hint ? '<div class="hint">' + esc(field.hint) + '</div>' : '';
    var required = field.required ? ' required' : '';
    var control;

    switch (field.type) {
      case 'checkbox':
        return '<div class="check-field"><input type="checkbox" id="' + id + '" name="' + field.key + '"' +
          (value ? ' checked' : '') + '><label for="' + id + '">' + esc(field.label) + '</label></div>' + hint;
      case 'textarea':
      case 'lines':
      case 'pairs':
      case 'stats':
      case 'html':
        control = '<textarea id="' + id + '" name="' + field.key + '"' +
          (field.type === 'html' ? ' class="tall"' : '') + required + '>' + esc(value) + '</textarea>';
        break;
      case 'category':
        var options = (db.categories || []).map(function (c) {
          return '<option value="' + esc(c.slug) + '"' + (value === c.slug ? ' selected' : '') + '>' +
            esc(c.name) + '</option>';
        }).join('');
        control = '<select id="' + id + '" name="' + field.key + '"><option value="">— Select category —</option>' +
          options + '</select>';
        break;
      case 'image':
        var preview = value
          ? '<img src="' + esc(value) + '" alt="Image preview" width="150" height="108">'
          : 'No image selected';
        control = '<div class="upload-row">' +
          '<input type="text" id="' + id + '" name="' + field.key + '" value="' + esc(value) +
          '" placeholder="/uploads/... or https://...">' +
          '<label class="btn btn-small btn-outline-dark upload-btn">Upload' +
          '<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden ' +
          'data-upload data-target="' + id + '" data-preview="' + id + '-preview"></label></div>' +
          '<div class="upload-preview" id="' + id + '-preview">' + preview + '</div>';
        break;
      case 'date':
        control = '<input type="date" id="' + id + '" name="' + field.key + '" value="' + esc(value) + '">';
        break;
      case 'number':
        control = '<input type="number" id="' + id + '" name="' + field.key + '" value="' + esc(value) + '" step="1">';
        break;
      default:
        control = '<input type="text" id="' + id + '" name="' + field.key + '" value="' +
          esc(value) + '"' + required + '>';
    }
    return '<div class="form-field"><label for="' + id + '">' + esc(field.label) +
      (field.required ? ' <span class="req">*</span>' : '') + '</label>' + control + hint + '</div>';
  }

  function bindUploads(scope) {
    $$('[data-upload]', scope).forEach(function (input) {
      input.addEventListener('change', function () {
        var file = input.files && input.files[0];
        if (!file) return;
        if (file.size > MAX_UPLOAD_BYTES) { toast('Image must be smaller than 6 MB.', true); return; }
        var reader = new FileReader();
        reader.onload = function () {
          api('/api/admin/upload', { method: 'POST', body: { dataUrl: String(reader.result) } })
            .then(function (res) {
              var target = $('#' + input.getAttribute('data-target'));
              var preview = $('#' + input.getAttribute('data-preview'));
              if (target) target.value = res.url;
              if (preview) preview.innerHTML = '<img src="' + esc(res.url) + '" alt="Uploaded preview" width="150" height="108">';
              toast('Image uploaded. Save to apply.');
            })
            .catch(function (err) { toast(err.message, true); });
        };
        reader.onerror = function () { toast('Could not read the image file.', true); };
        reader.readAsDataURL(file);
      });
    });
  }

  /* ----------------------------- modal ----------------------------- */

  function openModal(title, html, onSubmit, submitLabel) {
    $('#modal-title').textContent = title;
    $('#modal-fields').innerHTML = html;
    $('#modal-save').textContent = submitLabel || 'Save Changes';
    var form = $('#entity-form');
    form.onsubmit = function (event) {
      event.preventDefault();
      if (onSubmit) onSubmit(form);
    };
    $('#modal').hidden = false;
  }

  function closeModal() {
    $('#modal').hidden = true;
    var form = $('#entity-form');
    if (form) form.onsubmit = null;
    $('#modal-save').textContent = 'Save Changes';
    $('#modal-save').disabled = false;
  }

  function openEditor(collection, item) {
    var schema = SCHEMAS[collection];
    if (!schema) return;
    var isNew = !item;
    var html = schema.fields.map(function (field) {
      return renderField(field, item || {}, 'f-');
    }).join('');

    openModal((isNew ? 'Add ' : 'Edit ') + schema.title, html, function (form) {
      var payload = {};
      schema.fields.forEach(function (field) {
        if (field.section) return;
        var control = $('#f-' + field.key, form);
        if (control) payload[field.key] = parseField(field, control);
      });
      var saveBtn = $('#modal-save');
      saveBtn.disabled = true;
      var url = isNew
        ? '/api/admin/' + collection
        : '/api/admin/' + collection + '/' + encodeURIComponent(item.id);
      api(url, { method: isNew ? 'POST' : 'PUT', body: payload })
        .then(function () {
          closeModal();
          return reload();
        })
        .then(function () { toast(isNew ? 'Created successfully.' : 'Changes saved.'); })
        .catch(function (err) { toast(err.message, true); saveBtn.disabled = false; });
    });
    bindUploads($('#modal-fields'));
  }

  function confirmDelete(collection, id, label) {
    if (!window.confirm('Delete "' + label + '" permanently? This cannot be undone.')) return;
    api('/api/admin/' + collection + '/' + encodeURIComponent(id), { method: 'DELETE' })
      .then(function () { return reload(); })
      .then(function () { toast('Deleted.'); })
      .catch(function (err) { toast(err.message, true); });
  }

  /* ----------------------------- panels ----------------------------- */

  var TITLES = {
    dashboard: 'Dashboard',
    products: 'Products',
    categories: 'Categories',
    posts: 'Articles',
    applications: 'Applications',
    faqs: 'FAQ / GEO Content',
    inquiries: 'Inquiries',
    settings: 'Site Settings',
    backup: 'Backup & Security'
  };

  function addButton(collection, label) {
    return '<button class="btn btn-primary btn-small" type="button" data-add="' + collection + '">' +
      '+ ' + esc(label) + '</button>';
  }

  function renderDashboard() {
    var unread = (db.inquiries || []).filter(function (i) { return !i.read; }).length;
    var recent = (db.inquiries || []).slice(0, 5);
    var cards = [
      { n: (db.products || []).length, l: 'Products' },
      { n: (db.categories || []).length, l: 'Categories' },
      { n: (db.posts || []).length, l: 'Articles' },
      { n: (db.faqs || []).length, l: 'FAQ / GEO blocks' },
      { n: (db.inquiries || []).length, l: 'Inquiries (' + unread + ' new)' }
    ];
    var html = '<div class="stat-cards">' + cards.map(function (c) {
      return '<div class="stat-card"><div class="num">' + esc(c.n) + '</div><div class="lbl">' + esc(c.l) + '</div></div>';
    }).join('') + '</div>' +
      '<div class="card card-pad" style="margin-bottom:1.2rem">' +
      '<h2 style="font-size:1.05rem">Quick Actions</h2>' +
      '<div class="quick-actions">' + addButton('products', 'Add Product') +
      addButton('posts', 'Write Article') +
      '<button class="btn btn-outline-dark btn-small" type="button" data-go="settings">Edit Site Settings</button>' +
      '<button class="btn btn-outline-dark btn-small" type="button" data-go="backup">Download Backup</button>' +
      '</div></div>' +
      '<div class="card"><div style="padding:1.1rem 1.3rem;border-bottom:1px solid var(--line)">' +
      '<h2 style="font-size:1.05rem;margin:0">Recent Inquiries</h2></div>' +
      (recent.length
        ? '<div class="table-wrap" style="border:0"><table class="data"><thead><tr><th>Name</th><th>Company</th><th>Product</th><th>Date</th><th>Status</th></tr></thead><tbody>' +
          recent.map(function (i) {
            return '<tr><td>' + esc(i.name) + '</td><td>' + esc(i.company || '—') + '</td><td>' +
              esc(i.product || '—') + '</td><td class="small">' + esc(shortDate(i.createdAt)) + '</td><td>' +
              (i.read ? statusPill(true, 'Read', '') : '<span class="status-pill unread">New</span>') + '</td></tr>';
          }).join('') + '</tbody></table></div>'
        : '<div class="empty">No inquiries yet. They will appear here when a visitor submits the contact form.</div>') +
      '</div>' +
      '<p class="small muted" style="margin-top:1.2rem">All content is stored in <code>data/db.json</code>. ' +
      'Images live in <code>data/uploads/</code>. Use Backup &amp; Security to export before any migration.</p>';
    return html;
  }

  function renderProducts() {
    var items = db.products || [];
    var rows = items.map(function (p) {
      var thumb = p.image
        ? '<img class="thumb" src="' + esc(p.image) + '" alt="" width="52" height="42">'
        : '<div class="thumb-ph">SVG</div>';
      var search = [p.name, p.series, p.category, p.summary].join(' ').toLowerCase();
      return '<tr data-search="' + esc(search) + '"><td>' + thumb + '</td>' +
        '<td><strong>' + esc(p.name) + '</strong><div class="small muted">/' + esc(p.slug) + '</div></td>' +
        '<td>' + esc(p.category || '—') + '</td><td class="small">' + esc(p.series || '—') + '</td>' +
        '<td>' + statusPill(p.published !== false) + (p.featured ? ' <span class="status-pill unread">Featured</span>' : '') + '</td>' +
        '<td>' + esc(p.order || 0) + '</td>' +
        '<td><div class="row-actions">' +
        '<button class="btn btn-outline-dark btn-small" type="button" data-edit="products" data-id="' + esc(p.id) + '">Edit</button>' +
        '<button class="btn btn-danger btn-small" type="button" data-del="products" data-id="' + esc(p.id) + '" data-label="' + esc(p.name) + '">Delete</button>' +
        '</div></td></tr>';
    }).join('');
    return listShell('Products', 'Manage the product catalog. Changes appear on the website immediately.',
      addButton('products', 'Add Product'), items.length,
      '<th>Image</th><th>Name</th><th>Category</th><th>Series</th><th>Status</th><th>Order</th><th>Actions</th>', rows);
  }

  function renderCategories() {
    var items = db.categories || [];
    var rows = items.map(function (c) {
      var count = (db.products || []).filter(function (p) { return p.category === c.slug; }).length;
      return '<tr data-search="' + esc((c.name + ' ' + c.slug + ' ' + (c.series || '')).toLowerCase()) + '">' +
        '<td><strong>' + esc(c.name) + '</strong></td><td class="small">/' + esc(c.slug) + '</td>' +
        '<td>' + esc(c.series || '—') + '</td><td>' + count + ' product(s)</td>' +
        '<td>' + statusPill(c.published !== false) + '</td><td>' + esc(c.order || 0) + '</td>' +
        '<td><div class="row-actions">' +
        '<button class="btn btn-outline-dark btn-small" type="button" data-edit="categories" data-id="' + esc(c.id) + '">Edit</button>' +
        '<button class="btn btn-danger btn-small" type="button" data-del="categories" data-id="' + esc(c.id) + '" data-label="' + esc(c.name) + '">Delete</button>' +
        '</div></td></tr>';
    }).join('');
    return listShell('Categories', 'Categories power the product menu and catalog filters. A category in use cannot be deleted.',
      addButton('categories', 'Add Category'), items.length,
      '<th>Name</th><th>Slug</th><th>Series</th><th>Products</th><th>Status</th><th>Order</th><th>Actions</th>', rows);
  }

  function renderPosts() {
    var items = db.posts || [];
    var rows = items.map(function (p) {
      return '<tr data-search="' + esc((p.title + ' ' + (p.category || '')).toLowerCase()) + '">' +
        '<td><strong>' + esc(truncate(p.title, 60)) + '</strong><div class="small muted">/' + esc(p.slug) + '</div></td>' +
        '<td class="small">' + esc(p.category || '—') + '</td>' +
        '<td class="small">' + esc(p.date || '—') + '</td>' +
        '<td>' + statusPill(p.published !== false) + '</td>' +
        '<td>' + esc(p.order || 0) + '</td>' +
        '<td><div class="row-actions">' +
        '<button class="btn btn-outline-dark btn-small" type="button" data-edit="posts" data-id="' + esc(p.id) + '">Edit</button>' +
        '<button class="btn btn-danger btn-small" type="button" data-del="posts" data-id="' + esc(p.id) + '" data-label="' + esc(p.title) + '">Delete</button>' +
        '</div></td></tr>';
    }).join('');
    return listShell('Articles', 'Blog posts and insights. The article body accepts HTML so you can format headings and lists.',
      addButton('posts', 'Write Article'), items.length,
      '<th>Title</th><th>Topic</th><th>Date</th><th>Status</th><th>Order</th><th>Actions</th>', rows);
  }

  function renderApplications() {
    var items = db.applications || [];
    var rows = items.map(function (a) {
      return '<tr data-search="' + esc(a.name.toLowerCase()) + '">' +
        '<td><strong>' + esc(a.name) + '</strong></td>' +
        '<td class="small">' + esc(truncate(a.description, 90)) + '</td>' +
        '<td>' + statusPill(a.published !== false) + '</td><td>' + esc(a.order || 0) + '</td>' +
        '<td><div class="row-actions">' +
        '<button class="btn btn-outline-dark btn-small" type="button" data-edit="applications" data-id="' + esc(a.id) + '">Edit</button>' +
        '<button class="btn btn-danger btn-small" type="button" data-del="applications" data-id="' + esc(a.id) + '" data-label="' + esc(a.name) + '">Delete</button>' +
        '</div></td></tr>';
    }).join('');
    return listShell('Applications', 'Process-based solution cards shown on the Applications page and homepage.',
      addButton('applications', 'Add Application'), items.length,
      '<th>Name</th><th>Description</th><th>Status</th><th>Order</th><th>Actions</th>', rows);
  }

  function renderFaqs() {
    var items = db.faqs || [];
    var rows = items.map(function (f) {
      return '<tr data-search="' + esc((f.question + ' ' + (f.answer || '')).toLowerCase()) + '">' +
        '<td><strong>' + esc(truncate(f.question, 90)) + '</strong>' +
        '<div class="small muted">' + esc(truncate(f.answer, 110)) + '</div></td>' +
        '<td class="small">' + esc(f.scope || 'general') + '</td>' +
        '<td>' + statusPill(f.published !== false) + '</td><td>' + esc(f.order || 0) + '</td>' +
        '<td><div class="row-actions">' +
        '<button class="btn btn-outline-dark btn-small" type="button" data-edit="faqs" data-id="' + esc(f.id) + '">Edit</button>' +
        '<button class="btn btn-danger btn-small" type="button" data-del="faqs" data-id="' + esc(f.id) + '" data-label="' + esc(truncate(f.question, 40)) + '">Delete</button>' +
        '</div></td></tr>';
    }).join('');
    return listShell('FAQ / GEO Content',
      'Visible Q&A blocks with FAQPage structured data. These are the passages AI answer engines quote most often.',
      addButton('faqs', 'Add FAQ'), items.length,
      '<th>Question &amp; Answer</th><th>Scope</th><th>Status</th><th>Order</th><th>Actions</th>', rows);
  }

  function listShell(title, description, actionButton, count, headers, rows) {
    return '<div class="panel-head"><div><h2 style="font-size:1.15rem;margin:0 0 .25rem">' + esc(title) + '</h2>' +
      '<p>' + esc(description) + '</p></div>' + actionButton + '</div>' +
      '<div class="toolbar-row"><input type="search" id="table-search" placeholder="Search…" aria-label="Search rows">' +
      '<span class="small muted" style="align-self:center">' + count + ' item(s)</span></div>' +
      '<div class="table-wrap"><table class="data" id="data-table"><thead><tr>' + headers + '</tr></thead>' +
      '<tbody>' + (rows || '<tr><td colspan="7" class="empty">Nothing here yet.</td></tr>') + '</tbody></table></div>';
  }

  function renderInquiries() {
    var items = db.inquiries || [];
    var rows = items.map(function (i) {
      return '<tr data-search="' + esc((i.name + ' ' + i.email + ' ' + (i.company || '')).toLowerCase()) + '">' +
        '<td>' + (i.read ? '' : '<span class="status-pill unread">New</span> ') + '<strong>' + esc(i.name) + '</strong></td>' +
        '<td class="small">' + esc(i.email) + '</td><td>' + esc(i.company || '—') + '</td>' +
        '<td class="small">' + esc(i.product || '—') + '</td>' +
        '<td class="small"><span class="status-pill ' + (i.channel === 'ai-referral' ? 'unread' : 'on') + '">' +
        esc(i.channel || 'direct') + '</span></td>' +
        '<td class="small">' + esc(shortDate(i.createdAt)) + '</td>' +
        '<td><div class="row-actions">' +
        '<button class="btn btn-outline-dark btn-small" type="button" data-view="' + esc(i.id) + '">View</button>' +
        (i.read ? '' : '<button class="btn btn-outline-dark btn-small" type="button" data-read="' + esc(i.id) + '">Mark read</button>') +
        '<button class="btn btn-danger btn-small" type="button" data-del="inquiries" data-id="' + esc(i.id) + '" data-label="' + esc(i.name) + '">Delete</button>' +
        '</div></td></tr>';
    }).join('');
    return '<div class="panel-head"><div><h2 style="font-size:1.15rem;margin:0 0 .25rem">Customer Inquiries</h2>' +
      '<p>Every inquiry records its traffic source (organic / ads / AI referral / direct) so you can see which channel produces buyers.</p></div>' +
      '<a class="btn btn-outline-dark btn-small" href="/api/admin/inquiries.csv">Export CSV</a></div>' +
      '<div class="toolbar-row"><input type="search" id="table-search" placeholder="Search…" aria-label="Search inquiries"></div>' +
      '<div class="table-wrap"><table class="data" id="data-table"><thead><tr>' +
      '<th>Name</th><th>Email</th><th>Company</th><th>Product</th><th>Channel</th><th>Date</th><th>Actions</th>' +
      '</tr></thead><tbody>' +
      (rows || '<tr><td colspan="7" class="empty">No inquiries yet.</td></tr>') + '</tbody></table></div>';
  }

  function renderSettings() {
    var settings = db.settings || {};
    var html = SETTING_FIELDS.map(function (field) {
      return renderField(field, settings, 's-');
    }).join('');
    return '<div class="panel-head"><div><h2 style="font-size:1.15rem;margin:0 0 .25rem">Site Settings</h2>' +
      '<p>These values control every shared text block, contact detail and SEO field across the website.</p></div></div>' +
      '<div class="card card-pad" style="margin-bottom:1.2rem"><div id="email-status" class="small muted">Checking inquiry email channel…</div></div>' +
      '<div class="card card-pad"><form id="settings-form">' + html +
      '<div style="margin-top:1.4rem;display:flex;gap:.7rem;align-items:center;flex-wrap:wrap">' +
      '<button class="btn btn-primary" type="submit" id="settings-save">Save Settings</button>' +
      '<span class="form-status" id="settings-status" role="status" aria-live="polite"></span></div>' +
      '</form></div>';
  }

  function renderBackup() {
    return '<div class="panel-head"><div><h2 style="font-size:1.15rem;margin:0 0 .25rem">Backup &amp; Security</h2>' +
      '<p>Export before migrating to a new server. The backup includes all content, settings and inquiries.</p></div></div>' +
      '<div class="card card-pad" style="margin-bottom:1.2rem">' +
      '<h3 style="font-size:1rem">1 / Export full site data</h3>' +
      '<p class="small muted">Downloads a JSON file containing products, categories, articles, applications, settings and inquiries. ' +
      'Uploaded images are separate files in <code>data/uploads/</code> - copy that folder too.</p>' +
      '<a class="btn btn-primary btn-small" href="/api/admin/export">Download Backup (JSON)</a></div>' +
      '<div class="card card-pad" style="margin-bottom:1.2rem">' +
      '<h3 style="font-size:1rem">2 / Import a backup</h3>' +
      '<p class="small muted">Replaces all current content with the data from the selected backup file. Export first if you want to keep a copy.</p>' +
      '<input type="file" id="import-file" accept="application/json,.json" aria-label="Choose backup JSON file">' +
      '<p class="form-status" id="import-status" role="status" aria-live="polite"></p></div>' +
      '<div class="card card-pad" style="margin-bottom:1.2rem">' +
      '<h3 style="font-size:1rem">3 / Change admin password</h3>' +
      '<p class="small muted">You will be signed out after a successful change.</p>' +
      '<form id="password-form" style="max-width:420px">' +
      '<div class="form-field"><label for="pw-current">Current Password</label>' +
      '<input id="pw-current" type="password" name="currentPassword" required autocomplete="current-password"></div>' +
      '<div class="form-field"><label for="pw-new">New Password (min. 8 characters)</label>' +
      '<input id="pw-new" type="password" name="newPassword" required minlength="8" autocomplete="new-password"></div>' +
      '<button class="btn btn-primary btn-small" type="submit">Update Password</button>' +
      '<p class="form-status" id="password-status" role="status" aria-live="polite"></p></form></div>' +
      '<div class="card card-pad"><h3 style="font-size:1rem">Migration notes</h3>' +
      '<ul class="small muted" style="line-height:1.9">' +
      '<li>Stop the site, copy the entire project folder (including <code>data/</code>) to the new server.</li>' +
      '<li>Keep <code>config.json</code> so the admin password hash stays valid - or set <code>ADMIN_PASSWORD</code> on first boot.</li>' +
      '<li>Update <strong>Canonical Site URL</strong> in Site Settings to the live domain.</li>' +
      '<li>Verify <code>/sitemap.xml</code>, contact form, and admin login after the DNS switch.</li>' +
      '</ul></div>';
  }

  /* ----------------------------- panel wiring ----------------------------- */

  function renderPanel() {
    $$('.side-nav button').forEach(function (btn) {
      btn.classList.toggle('is-active', btn.getAttribute('data-panel') === panel);
    });
    $('#panel-title').textContent = TITLES[panel] || 'Dashboard';

    var renderers = {
      dashboard: renderDashboard,
      products: renderProducts,
      categories: renderCategories,
      posts: renderPosts,
      applications: renderApplications,
      faqs: renderFaqs,
      inquiries: renderInquiries,
      settings: renderSettings,
      backup: renderBackup
    };
    var renderer = renderers[panel] || renderDashboard;
    var host = $('#main');
    host.innerHTML = renderer();

    wirePanelEvents();
    updateBadge();
    if (panel === 'settings') loadEmailStatus();
  }

  /** Shows whether the server-side mail credentials are configured (never the key). */
  function loadEmailStatus() {
    var host = $('#email-status');
    if (!host) return;
    api('/api/admin/email-status').then(function (s) {
      if (s.enabled) {
        host.innerHTML = '<strong style="color:#0a7a45">Inquiry email is ACTIVE</strong> &middot; provider: ' +
          esc(s.provider || '-') + ' &middot; delivered to <strong>' + esc(s.to || '-') +
          '</strong>. Submit one test inquiry to confirm delivery.';
      } else {
        host.innerHTML = '<strong style="color:#a33">Inquiry email is NOT configured.</strong> ' +
          'Inquiries are still saved in the Inquiries panel, but no email will be sent. ' +
          'Set <code>EMAIL_PROVIDER</code>, <code>EMAIL_API_KEY</code> and <code>EMAIL_FROM</code> ' +
          'on the server (see DEPLOY.md 16.4).';
      }
    }).catch(function () {
      host.textContent = 'Could not check the inquiry email channel status.';
    });
  }

  function updateBadge() {
    var unread = (db && db.inquiries ? db.inquiries : []).filter(function (i) { return !i.read; }).length;
    var badge = $('#unread-badge');
    if (badge) {
      badge.textContent = String(unread);
      badge.hidden = unread === 0;
    }
    if ($('#admin-name')) $('#admin-name').textContent = 'Signed in as ' + username;
  }

  function findItem(collection, id) {
    return (db[collection] || []).filter(function (item) { return String(item.id) === String(id); })[0];
  }

  function wirePanelEvents() {
    $$('[data-add]').forEach(function (btn) {
      btn.addEventListener('click', function () { openEditor(btn.getAttribute('data-add'), null); });
    });
    $$('[data-go]').forEach(function (btn) {
      btn.addEventListener('click', function () { panel = btn.getAttribute('data-go'); renderPanel(); });
    });
    $$('[data-edit]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var collection = btn.getAttribute('data-edit');
        var item = findItem(collection, btn.getAttribute('data-id'));
        if (item) openEditor(collection, item);
      });
    });
    $$('[data-del]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        confirmDelete(btn.getAttribute('data-del'), btn.getAttribute('data-id'), btn.getAttribute('data-label'));
      });
    });

    var search = $('#table-search');
    if (search) {
      search.addEventListener('input', function () {
        var q = search.value.trim().toLowerCase();
        $$('#data-table tbody tr[data-search]').forEach(function (tr) {
          tr.style.display = (!q || tr.getAttribute('data-search').indexOf(q) !== -1) ? '' : 'none';
        });
      });
    }

    $$('[data-view]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var item = findItem('inquiries', btn.getAttribute('data-view'));
        if (!item) return;
        var html = '<dl class="info-grid">' +
          '<div><dt>Name</dt><dd>' + esc(item.name) + '</dd></div>' +
          '<div><dt>Email</dt><dd><a href="mailto:' + esc(item.email) + '">' + esc(item.email) + '</a></dd></div>' +
          '<div><dt>Company</dt><dd>' + esc(item.company || '—') + '</dd></div>' +
          '<div><dt>Country</dt><dd>' + esc(item.country || '—') + '</dd></div>' +
          '<div><dt>Phone / WhatsApp</dt><dd>' + esc(item.phone || '—') + '</dd></div>' +
          '<div><dt>Product</dt><dd>' + esc(item.product || '—') + '</dd></div>' +
          '<div><dt>Received</dt><dd>' + esc(shortDate(item.createdAt)) + '</dd></div>' +
          '<div><dt>Channel</dt><dd>' + esc(item.channel || 'direct') + '</dd></div>' +
          '<div><dt>UTM source / campaign</dt><dd>' +
          esc((item.source && item.source.utmSource) || '—') + ' / ' +
          esc((item.source && item.source.utmCampaign) || '—') + '</dd></div>' +
          '<div><dt>Referrer</dt><dd>' + esc((item.source && item.source.referrer) || '—') + '</dd></div>' +
          '<div><dt>First landing page</dt><dd>' +
          esc((item.source && item.source.landingPage) || '—') + '</dd></div>' +
          '</dl><h3 style="font-size:.9rem;margin-top:1.2rem">Message</h3>' +
          '<div class="inquiry-body">' + esc(item.message) + '</div>';
        openModal('Inquiry from ' + item.name, html, function () { closeModal(); }, 'Close');
        if (!item.read) {
          api('/api/admin/inquiries/' + encodeURIComponent(item.id), { method: 'PUT', body: { read: true } })
            .then(reload).catch(function (err) { toast(err.message, true); });
        }
      });
    });

    $$('[data-read]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        api('/api/admin/inquiries/' + encodeURIComponent(btn.getAttribute('data-read')),
          { method: 'PUT', body: { read: true } })
          .then(reload).then(function () { toast('Marked as read.'); })
          .catch(function (err) { toast(err.message, true); });
      });
    });

    var settingsForm = $('#settings-form');
    if (settingsForm) {
      settingsForm.addEventListener('submit', function (event) {
        event.preventDefault();
        var payload = {};
        SETTING_FIELDS.forEach(function (field) {
          if (field.section) return;
          var control = $('#s-' + field.key, settingsForm);
          if (control) payload[field.key] = parseField(field, control);
        });
        var status = $('#settings-status');
        var save = $('#settings-save');
        if (save) save.disabled = true;
        api('/api/admin/settings', { method: 'PUT', body: payload })
          .then(function () { return reload(); })
          .then(function () {
            if (status) { status.className = 'form-status is-ok'; status.textContent = 'Settings saved and live on the website.'; }
            toast('Settings saved.');
          })
          .catch(function (err) {
            if (status) { status.className = 'form-status is-error'; status.textContent = err.message; }
          })
          .then(function () { if (save) save.disabled = false; });
      });
    }

    var importFile = $('#import-file');
    if (importFile) {
      importFile.addEventListener('change', function () {
        var file = importFile.files && importFile.files[0];
        if (!file) return;
        var status = $('#import-status');
        var reader = new FileReader();
        reader.onload = function () {
          var parsed;
          try { parsed = JSON.parse(String(reader.result)); }
          catch (err) { status.className = 'form-status is-error'; status.textContent = 'Invalid JSON file.'; return; }
          if (!window.confirm('Replace ALL current site content with this backup?')) return;
          api('/api/admin/import', { method: 'POST', body: { db: parsed } })
            .then(function () { return reload(); })
            .then(function () {
              status.className = 'form-status is-ok';
              status.textContent = 'Backup imported successfully.';
              toast('Backup imported.');
            })
            .catch(function (err) {
              status.className = 'form-status is-error';
              status.textContent = err.message;
            });
        };
        reader.readAsText(file);
      });
    }

    var passwordForm = $('#password-form');
    if (passwordForm) {
      passwordForm.addEventListener('submit', function (event) {
        event.preventDefault();
        var status = $('#password-status');
        api('/api/admin/password', {
          method: 'POST',
          body: {
            currentPassword: $('#pw-current').value,
            newPassword: $('#pw-new').value
          }
        }).then(function () {
          passwordForm.reset();
          status.className = 'form-status is-ok';
          status.textContent = 'Password changed. Signing out…';
          window.setTimeout(showLogin, 900);
        }).catch(function (err) {
          status.className = 'form-status is-error';
          status.textContent = err.message;
        });
      });
    }
  }

  /* ----------------------------- session ----------------------------- */

  function reload() {
    return api('/api/admin/data').then(function (data) {
      db = data;
      renderPanel();
    });
  }

  function showApp(name) {
    username = name || username || 'admin';
    $('#login-view').hidden = true;
    $('#app-view').hidden = false;
    return reload();
  }

  function showLogin() {
    db = null;
    $('#app-view').hidden = true;
    $('#login-view').hidden = false;
    var form = $('#login-form');
    if (form) form.reset();
    var status = $('#login-status');
    if (status) { status.textContent = ''; status.className = 'form-status'; }
  }

  function logout() {
    api('/api/admin/logout', { method: 'POST', body: {} })
      .catch(function () { /* ignore */ })
      .then(showLogin);
  }

  /* ----------------------------- bootstrap ----------------------------- */

  document.addEventListener('DOMContentLoaded', function () {
    $$('[data-close]').forEach(function (el) {
      el.addEventListener('click', closeModal);
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && !$('#modal').hidden) closeModal();
    });

    var loginForm = $('#login-form');
    loginForm.addEventListener('submit', function (event) {
      event.preventDefault();
      var status = $('#login-status');
      var submit = $('#login-submit');
      submit.disabled = true;
      status.className = 'form-status';
      status.textContent = '';
      api('/api/admin/login', {
        method: 'POST',
        body: { username: $('#login-username').value, password: $('#login-password').value }
      }).then(function (res) {
        return showApp(res.username);
      }).then(function () {
        toast('Welcome back.');
      }).catch(function (err) {
        status.className = 'form-status is-error';
        status.textContent = err.message;
      }).then(function () { submit.disabled = false; });
    });

    $$('.side-nav button').forEach(function (btn) {
      btn.addEventListener('click', function () {
        panel = btn.getAttribute('data-panel');
        renderPanel();
      });
    });
    $('#logout-btn').addEventListener('click', logout);
    $('#logout-btn-2').addEventListener('click', logout);

    api('/api/admin/me')
      .then(function (res) { return showApp(res.username); })
      .catch(function () { showLogin(); });
  });
})();
