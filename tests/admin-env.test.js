'use strict';

/**
 * Regression test: ADMIN_PASSWORD must override the committed config.json hash.
 *
 * Managed platforms (Render / Docker / VPS) inject the admin password as an env
 * var. Before the fix it was only read on the very first boot, so the default
 * password documented in README.md stayed valid on the production site.
 *
 * Run: node tests/admin-env.test.js
 * Optional: TEST_ENV_PORT=3399 (default) to use a different spare port.
 */

const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.TEST_ENV_PORT || 3399);
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'yc-admin-env-'));
const STRONG = 'Env-Override-Strong-Pass!2026';
const DEFAULT = 'Ycefddc22af0!';

let pass = 0;
let fail = 0;

function ck(name, cond) {
  if (cond) { pass += 1; console.log('PASS ' + name); }
  else { fail += 1; console.log('FAIL ' + name); }
}

function request(pathname, body) {
  return new Promise(function (resolve, reject) {
    const payload = body ? JSON.stringify(body) : '';
    const req = http.request({
      host: '127.0.0.1',
      port: PORT,
      path: pathname,
      method: body ? 'POST' : 'GET',
      headers: body
        ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
        : {}
    }, function (res) {
      res.resume();
      res.on('end', function () { resolve(res.statusCode); });
    });
    req.on('error', reject);
    req.setTimeout(4000, function () { req.destroy(new Error('timeout')); });
    req.end(payload || undefined);
  });
}

function waitReady(attempts) {
  function retry(err) {
    if (attempts <= 1) throw err;
    return new Promise(function (r) { setTimeout(r, 250); })
      .then(function () { return waitReady(attempts - 1); });
  }
  return request('/api/site').then(function (code) {
    if (code === 200) return true;
    return retry(new Error('server not ready, HTTP ' + code));
  }).catch(retry);
}

const child = spawn(process.execPath, ['server.js'], {
  cwd: ROOT,
  env: Object.assign({}, process.env, {
    PORT: String(PORT),
    HOST: '127.0.0.1',
    DATA_DIR: DATA_DIR,
    ADMIN_PASSWORD: STRONG
  }),
  stdio: ['ignore', 'pipe', 'pipe']
});

let serverLog = '';
child.stdout.on('data', function (d) { serverLog += d.toString(); });
child.stderr.on('data', function (d) { serverLog += d.toString(); });

function cleanup() {
  try { child.kill(); } catch (err) { /* ignore */ }
  try { fs.rmSync(DATA_DIR, { recursive: true, force: true }); } catch (err) { /* ignore */ }
}

(async function () {
  try {
    await waitReady(40);
    ck('ADMIN_PASSWORD env overrides config.json hash',
      (await request('/api/admin/login', { username: 'admin', password: STRONG })) === 200);
    ck('documented default password rejected when env is set',
      (await request('/api/admin/login', { username: 'admin', password: DEFAULT })) === 401);
    ck('production secret never written into config.json or logs',
      !serverLog.includes(STRONG) &&
      !fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8').includes(STRONG));
  } catch (err) {
    fail += 1;
    console.log('FAIL harness :: ' + err.message);
    console.log(serverLog.slice(-600));
  } finally {
    cleanup();
    console.log('RESULT pass=' + pass + ' fail=' + fail);
    process.exit(fail ? 1 : 0);
  }
})();
