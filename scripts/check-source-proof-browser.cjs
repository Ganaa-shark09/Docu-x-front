const fs = require('fs'),
  os = require('os'),
  path = require('path'),
  cp = require('child_process');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'docux-proof-browser-'));
const chrome = cp.spawn(
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--remote-debugging-port=0',
    '--user-data-dir=' + profile,
    'about:blank',
  ],
  { windowsHide: true, stdio: 'ignore' },
);
let seq = 0,
  ws,
  pending = new Map(),
  failures = [],
  requests = [];
const id = '11111111-1111-4111-8111-111111111111';
const row = {
  uuid: id,
  source: {
    uuid: id,
    kind: 'document',
    reference: id,
    identity: 'fixture',
    pin: { documents: [] },
  },
  locator_type: 'text_offsets',
  locator: { page: 1, start: 0, end: 5 },
  precision: 'exact',
  method: 'imported_data',
  disclosure: 'internal_only',
  validity: 'valid',
  code: 'validated_source',
  captured_at: '2026-10-21T00:00:00Z',
  review_state: 'unreviewed',
  review_revision: 0,
  valid_from: null,
  valid_until: null,
  review_due_at: null,
};
function response(url) {
  const p = new URL(url).pathname;
  if (p.endsWith('/csrf/')) return { csrfToken: 'isolated-browser-fixture' };
  if (p.endsWith('/refresh/')) return { access: 'isolated-browser-fixture' };
  if (p.endsWith('/profile/'))
    return { id: 1, username: 'UI test', role: 'company_admin', company: 1 };
  if (p.endsWith('/context/')) return { claims: [], evidence: [row], next: false, previous: false };
  if (p.endsWith('/citation/'))
    return {
      ...row,
      excerpt: 'Authorized excerpt fixture',
      documents: [{ uuid: id, title: 'Source fixture' }],
    };
  if (p.endsWith('/unread-count/')) return { count: 0 };
  if (p.endsWith('/runs/' + id + '/'))
    return {
      uuid: id,
      definition_uuid: id,
      version_uuid: id,
      department: null,
      initiated_by: 1,
      status: 'completed',
      current_step: null,
      started_at: null,
      completed_at: null,
      error_type: '',
      error_message: '',
      correlation_id: id,
      revision: 1,
      documents: [],
      capabilities: {},
    };
  if (p.endsWith('/definitions/' + id + '/'))
    return {
      uuid: id,
      name: 'Source Proof browser fixture',
      workflow_type: 'generic',
      is_active: true,
    };
  if (p.endsWith('/versions/' + id + '/'))
    return { uuid: id, number: 1, steps: [], transitions: [], configuration: {} };
  return [];
}
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const n = ++seq;
    pending.set(n, { resolve, reject });
    ws.send(JSON.stringify({ id: n, method, params }));
    setTimeout(() => {
      if (pending.has(n)) {
        pending.delete(n);
        reject(Error('CDP timeout ' + method));
      }
    }, 20000).unref();
  });
}
async function evaluate(expression) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw Error(r.exceptionDetails.text);
  return r.result.value;
}
async function until(expression) {
  for (let i = 0; i < 120; i++) {
    if (await evaluate(expression)) return;
    await wait(250);
  }
  throw Error('UI wait timeout ' + expression);
}
(async () => {
  try {
    let port;
    for (let i = 0; i < 120; i++) {
      try {
        port = fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0];
        if (port) break;
      } catch {}
      await wait(100);
    }
    const tabs = await (await fetch('http://127.0.0.1:' + port + '/json')).json();
    ws = new WebSocket(tabs.find((t) => t.type === 'page').webSocketDebuggerUrl);
    await new Promise((r) => (ws.onopen = r));
    ws.onmessage = async (e) => {
      const m = JSON.parse(e.data);
      if (m.id) {
        const cb = pending.get(m.id);
        if (cb) {
          pending.delete(m.id);
          m.error ? cb.reject(Error(m.error.message)) : cb.resolve(m.result);
        }
        return;
      }
      if (m.method === 'Fetch.requestPaused') {
        const a = m.params;
        requests.push(a.request.method + ' ' + new URL(a.request.url).pathname);
        await send('Fetch.fulfillRequest', {
          requestId: a.requestId,
          responseCode: 200,
          responseHeaders: [
            { name: 'Content-Type', value: 'application/json' },
            { name: 'Access-Control-Allow-Origin', value: 'http://localhost:4200' },
            { name: 'Access-Control-Allow-Credentials', value: 'true' },
            {
              name: 'Access-Control-Allow-Headers',
              value: 'authorization,content-type,x-csrftoken',
            },
            { name: 'Access-Control-Allow-Methods', value: 'GET,POST,OPTIONS' },
          ],
          body: Buffer.from(JSON.stringify(response(a.request.url))).toString('base64'),
        });
      }
      if (m.method === 'Runtime.exceptionThrown') failures.push(m.params.exceptionDetails.text);
    };
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Fetch.enable', {
      patterns: [
        { urlPattern: '*://localhost:8000/*' },
        { urlPattern: '*://127.0.0.1:8000/*' },
        { urlPattern: '*/api/*' },
      ],
    });
    await send('Page.navigate', { url: 'http://localhost:4200/workflows/runs/' + id });
    await until("!!document.querySelector('app-source-proof-panel button')");
    await evaluate("document.querySelector('app-source-proof-panel button').click()");
    await until("!!document.querySelector('app-source-proof-panel .proof-item')");
    await evaluate("document.querySelector('app-source-proof-panel .proof-item').click()");
    await until("!!document.querySelector('app-source-proof-panel blockquote')");
    const results = [];
    for (const theme of ['light', 'dark'])
      for (const width of [1440, 768, 390]) {
        await send('Emulation.setDeviceMetricsOverride', {
          width,
          height: 1000,
          deviceScaleFactor: 1,
          mobile: width < 700,
        });
        await send('Emulation.setEmulatedMedia', {
          features: [{ name: 'prefers-color-scheme', value: theme }],
        });
        await evaluate("document.documentElement.setAttribute('data-theme','" + theme + "')");
        await wait(150);
        const result = await evaluate(
          `(()=>{const el=document.querySelector('app-source-proof-panel');const style=getComputedStyle(el.querySelector('section'));return {overflow:document.documentElement.scrollWidth>innerWidth,panelOverflow:el.scrollWidth>el.clientWidth,columns:getComputedStyle(el.querySelector('.proof-columns')).gridTemplateColumns,background:style.backgroundColor,color:style.color,excerpt:el.querySelector('blockquote').textContent,href:el.querySelector('a').getAttribute('href')}})()`,
        );
        if (result.panelOverflow || result.overflow)
          throw Error('Horizontal overflow ' + theme + ' ' + width);
        results.push({ theme, width, ...result });
      }
    if (failures.length) throw Error(JSON.stringify(failures));
    console.log(
      JSON.stringify(
        {
          coverage: 'Isolated browser HTTP fixtures only; no real API or database writes',
          results,
          apiRequests: requests.length,
        },
        null,
        2,
      ),
    );
  } catch (e) {
    console.log(
      JSON.stringify({
        requests,
        failures,
        page: ws
          ? await evaluate('({url:location.href,text:document.body.innerText.slice(0,1800)})')
          : null,
      }),
    );
    throw e;
  } finally {
    if (ws) ws.close();
    chrome.kill();
  }
})().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
