// Headless-browser UI test of the built web app: presses every button and
// checks the result (no extra dependencies; uses the Chrome DevTools Protocol).
// 1. npm run build && npx vite preview --port 4173
// 2. node tools/web-smoke-test.mjs [path-to-chromium-or-edge]
// Needs internet for the OpenStreetMap checks; the payment pause test waits 60 s.
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const URL_UNDER_TEST = process.env.SATARK_URL || 'http://localhost:4173/';
const candidates = [
  process.argv[2],
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/chromium', '/usr/bin/google-chrome',
].filter(Boolean);
const browserPath = candidates.find(path => existsSync(path));
if (!browserPath) throw new Error('No Chromium-based browser found; pass its path as an argument.');

const port = 9333;
const downloads = mkdtempSync(join(tmpdir(), 'satark-dl-'));
const browser = spawn(browserPath, [
  '--headless=new', '--disable-gpu', '--disable-extensions', `--remote-debugging-port=${port}`, '--window-size=412,915',
  `--user-data-dir=${mkdtempSync(join(tmpdir(), 'satark-ui-'))}`, 'about:blank',
], { stdio: 'ignore' });

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let targets;
for (let i = 0; i < 40 && !targets; i += 1) {
  await sleep(250);
  targets = await fetch(`http://127.0.0.1:${port}/json`).then(r => r.json()).catch(() => null);
}
const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(resolve => ws.addEventListener('open', resolve));
let nextId = 0;
const pending = new Map();
const pageErrors = [];
ws.addEventListener('message', event => {
  const m = JSON.parse(event.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  else if (m.method === 'Runtime.exceptionThrown') {
    const d = m.params.exceptionDetails;
    const url = d.url || d.stackTrace?.callFrames?.[0]?.url || '';
    // Ignore errors from the browser's own built-in scripts (e.g. Edge's "getAllPromptList").
    const detail = d.exception?.preview?.properties?.map(p => `${p.name}=${p.value}`).join(',') || d.exception?.description || d.text;
    if (!url || url.startsWith(new URL(URL_UNDER_TEST).origin)) pageErrors.push(`${detail} @ ${url || 'unknown'}:${d.lineNumber}`);
  }
  else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') pageErrors.push(m.params.args.map(a => (a.type === 'object' && a.preview ? JSON.stringify(a.preview.properties?.map(p => `${p.name}=${p.value}`)) : (a.value ?? a.description))).join(' '));
});
const send = (method, params = {}) => new Promise(resolve => {
  const id = ++nextId;
  pending.set(id, resolve);
  ws.send(JSON.stringify({ id, method, params }));
});
const js = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'evaluation failed');
  return r.result?.result?.value;
};
const text = () => js('document.body.innerText');
const exists = sel => js(`!!document.querySelector(${JSON.stringify(sel)})`);
const click = sel => js(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) throw new Error('missing ${sel}'); if (el.disabled) throw new Error('disabled ${sel}'); el.click(); return true; })()`);
const clickText = (sel, label) => js(`(() => { const el = [...document.querySelectorAll(${JSON.stringify(sel)})].find(e => e.textContent.includes(${JSON.stringify(label)})); if (!el) throw new Error('missing ${label}'); el.click(); return true; })()`);
const type = (sel, value) => js(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); return true; })()`);
const attr = (sel, name) => js(`document.querySelector(${JSON.stringify(sel)})?.getAttribute(${JSON.stringify(name)})`);
const waitFor = async (predicate, timeoutMs = 20000) => {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) { if (await js(predicate)) return true; await sleep(300); }
  return false;
};

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: Boolean(ok) });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};
const step = async (name, fn) => {
  try { await fn(); } catch (error) { check(name, false, error.message); }
};

try {
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads, eventsEnabled: true });
  await send('Page.navigate', { url: URL_UNDER_TEST });
  await sleep(2500);

  // ---- App opens straight on the protection dashboard ----
  await step('opens directly on the protection dashboard', async () => {
    check('opens directly on the protection dashboard', (await exists('#dashboard-status')) && (await exists('#nav-home.active')),
      await js('document.querySelector("#dashboard-title")?.innerText || ""'));
  });
  await step('dashboard shows the protection numbers and cards', async () => {
    const t = await text();
    check('dashboard shows the protection numbers and cards', ['Threats blocked today', 'Risk alerts', 'Last security scan', 'Link protection',
      'Scam calls', 'Screen sharing', 'Network activity'].every(label => t.includes(label)));
  });
  await step('security scan runs and shows results', async () => {
    await click('#btn-scan');
    const ok = await waitFor('!!document.querySelector("#scan-checks li")', 5000);
    check('security scan runs and shows results', ok && (await exists('#scan-summary')), await js('document.querySelector("#scan-summary")?.innerText || ""'));
  });
  await step('emergency safety checklist opens and closes', async () => {
    await click('#btn-emergency');
    await sleep(200);
    const opened = (await exists('#emergency-checklist')) && (await attr('#btn-checklist-1930', 'href')) === 'tel:1930';
    await click('#btn-checklist-close');
    await sleep(200);
    check('emergency safety checklist opens and closes', opened && !(await exists('#emergency-checklist')));
  });
  await step('Scam calls card opens the call guardian', async () => {
    await click('#tile-calls');
    await sleep(200);
    check('Scam calls card opens the call guardian', (await exists('#btn-listen')) && (await exists('#nav-calls.active')));
  });
  await step('light theme background', async () => {
    const bg = await js('getComputedStyle(document.body).backgroundColor');
    check('light theme background', bg === 'rgb(245, 246, 248)', bg);
  });

  // ---- Calls (scam call guardian) ----
  await step('Start listening (web) explains it needs the app', async () => {
    await click('#btn-listen');
    await sleep(300);
    check('Start listening (web) explains it needs the app', (await text()).includes('works in the Android app'));
  });
  await step('Check is disabled while empty', async () => {
    check('Check is disabled while empty', await js('document.querySelector("#btn-check").disabled'));
  });
  await step('benign message → no scam signs', async () => {
    await type('#message-input', 'hi mom i will be home by seven please keep dinner ready');
    await click('#btn-check');
    await sleep(200);
    check('benign message → no scam signs', (await text()).includes('No scam signs found'));
  });
  await step('Clear empties message and result', async () => {
    await click('#btn-clear');
    await sleep(200);
    check('Clear empties message and result', (await js('document.querySelector("#message-input").value')) === '' && !(await exists('#check-result')));
  });
  await step('weak signs → "not enough for an alert"', async () => {
    await type('#message-input', 'I will go to the police station tomorrow');
    await click('#btn-check');
    await sleep(200);
    check('weak signs → "not enough for an alert"', (await text()).includes('not enough for an alert'));
  });
  await step('critical word → alert pop-up', async () => {
    check('no pop-up for weak signs', !(await exists('#critical-popup')));
    await type('#message-input', 'Sir please share the OTP you just received');
    await click('#btn-check');
    await sleep(200);
    check('critical word → alert pop-up', (await exists('#critical-popup')) && (await text()).includes('critical word detected'));
    const heard = await js('document.querySelector("#critical-reasons .critical-context")?.innerText || ""');
    check('pop-up shows where the critical word was heard', /share the otp you/i.test(heard), heard);
    await click('#btn-critical-dismiss');
    await sleep(200);
    check('Dismiss closes the pop-up', !(await exists('#critical-popup')));
  });
  await step('typing does not open the alert by itself', async () => {
    await type('#message-input', 'main police station se bol raha hoon kisi ko mat batana turant paise bhejo, near Punjabi University Patiala');
    await sleep(800);
    check('typing does not open the alert by itself', !(await exists('#alert-header')) && !(await exists('#check-result')));
  });
  await step('scam message → alert banner', async () => {
    await click('#btn-check');
    await sleep(200);
    check('scam message → alert banner', (await text()).includes("Possible 'digital arrest' scam"));
  });
  await step('possible scam without critical words → pop-up', async () => {
    check('possible scam without critical words → pop-up', (await exists('#critical-popup')) && (await text()).includes('Alert: possible scam'),
      await js('document.querySelector("#critical-scam-type")?.innerText || ""'));
    const place = await js('document.querySelector("#critical-place")?.innerText || ""');
    check('pop-up shows the place mentioned in the call', /Punjabi University/i.test(place), place);
    await click('#btn-critical-dismiss');
    await sleep(200);
  });

  // ---- Alert page ----
  await step('View details opens the warning page', async () => {
    await click('#btn-check-details');
    await sleep(500);
    check('View details opens the warning page', (await exists('#alert-header')) && !(await exists('.bottom-nav')) && (await text()).includes('Scam warning'));
  });
  await step('warning page lists reasons', async () => {
    check('warning page lists reasons', (await js('document.querySelectorAll("#alert-reasons li").length')) >= 2);
  });
  await step('Call 1930 is a dialer link only', async () => {
    check('Call 1930 is a dialer link only', (await attr('#btn-alert-call-1930', 'href')) === 'tel:1930');
  });
  await step('detected place is pre-filled and searched automatically', async () => {
    const place = await js('document.querySelector("#nearby-query")?.value');
    const searched = await waitFor('!!document.querySelector("#place-list") || !!document.querySelector("#nearby-message")', 60000);
    check('detected place is pre-filled and searched automatically', /punjabi university/i.test(place || '') && searched && (await exists('#alert-detected-place')), place);
  });
  await step('nearby results have encoded "Find phone number" links', async () => {
    if (!(await exists('#place-list'))) {
      await click('#cat-hospital');
      await waitFor('!!document.querySelector("#place-list") || !!document.querySelector("#nearby-message.danger")', 60000);
    }
    const href = await js('document.querySelector("#place-list a.find-phone")?.href || ""');
    check('nearby results have encoded "Find phone number" links', href.startsWith('https://www.google.com/maps/search/?api=1&query=') && !href.includes(' '), href.slice(0, 90));
  });
  await step('Back button returns to the call guardian', async () => {
    await click('#btn-alert-back');
    await sleep(300);
    check('Back button returns to the call guardian', (await exists('#btn-listen')) && (await exists('.bottom-nav')));
  });
  await step('the call guardian keeps the checked message after going back', async () => {
    check('the call guardian keeps the checked message after going back', (await js('document.querySelector("#message-input").value')).includes('police station') && (await exists('#btn-check-details')));
  });
  await step('Done button returns to Home', async () => {
    await click('#btn-check-details');
    await sleep(300);
    await click('#btn-alert-done');
    await sleep(300);
    check('Done button returns to Home', await exists('#btn-listen'));
  });
  await step('warning page shows the statement that triggered it', async () => {
    await click('#btn-check-details');
    await sleep(300);
    const trigger = await js('document.querySelector("#alert-trigger")?.innerText || ""');
    await click('#btn-alert-done');
    await sleep(300);
    check('warning page shows the statement that triggered it', /Triggered by/.test(trigger), trigger.slice(0, 90));
  });

  // ---- Nearby tab ----
  await step('Nearby tab opens', async () => {
    await click('#nav-nearby');
    await sleep(300);
    check('Nearby tab opens', (await exists('#nearby-query')) && (await exists('#nav-nearby.active')));
  });
  await step('Nearby uses the place from the latest call (no GPS)', async () => {
    const note = await js('document.querySelector("#nearby-call-place")?.innerText || ""');
    const query = await js('document.querySelector("#nearby-query").value');
    const noGps = !(await exists('#btn-use-location'));
    check('Nearby uses the place from the latest call (no GPS)', /punjabi university/i.test(note) && /punjabi university/i.test(query) && noGps, query);
  });
  await step('Search is disabled while empty', async () => {
    const before = await js('document.querySelector("#nearby-query").value');
    await type('#nearby-query', '');
    await sleep(100);
    const disabled = await js('document.querySelector("#btn-nearby-search").disabled');
    await type('#nearby-query', before);
    check('Search is disabled while empty', disabled);
  });
  await step('Search "Patiala" shows places without a map', async () => {
    await type('#nearby-query', 'Patiala');
    await click('#btn-nearby-search');
    const ok = await waitFor('!!document.querySelector("#place-list") || !!document.querySelector("#nearby-message.danger")', 60000);
    check('Search "Patiala" shows places without a map', ok && (await exists('#place-list')) && !(await exists('.leaflet-container')),
      (await js('document.querySelector("#nearby-message")?.textContent || ""')).slice(0, 80));
  });
  for (const id of ['shop', 'pharmacy', 'police', 'cybercrime', 'bank', 'hospital']) {
    await step(`category "${id}" button`, async () => {
      await click(`#cat-${id}`);
      const staleWhileSearching = await js('/Searching|Finding/.test(document.querySelector(".notice[role=status]")?.textContent || "") && document.querySelectorAll("#place-list .place").length > 0');
      if (staleWhileSearching) throw new Error('previous places still shown while searching');
      // Finished = places listed or an explanatory message shown (the list is cleared while searching).
      const done = await waitFor('!!document.querySelector("#place-list") || !!document.querySelector("#nearby-message")', 60000);
      const active = await exists(`#cat-${id}.active`);
      const outcome = await js('document.querySelectorAll("#place-list .place").length + " places; " + (document.querySelector("#nearby-message")?.textContent || "")');
      check(`category "${id}" button`, done && active, outcome.slice(0, 90));
      // OSM has no police station within 10 km of central Patiala: the search must widen to find one.
      if (id === 'police') check('police search widens until it finds a station', !outcome.startsWith('0 places'), outcome.slice(0, 120));
    });
  }
  await step('radius select changes the search', async () => {
    await type('#nearby-radius', '5');
    await waitFor('!document.querySelector(".notice[role=status]")', 60000);
    check('radius select changes the search', (await js('document.querySelector("#nearby-radius").value')) === '5');
  });
  await step('tapping a place highlights it', async () => {
    if (!(await exists('#place-list .place'))) { check('tapping a place highlights it', true, 'no places listed (skipped)'); return; }
    await click('#place-list .place');
    await sleep(200);
    check('tapping a place highlights it', await exists('#place-list .place.selected'));
  });
  await step('unknown place gives a helpful message', async () => {
    await type('#nearby-query', 'Qwxyzv Plkjhg');
    await click('#btn-nearby-search');
    await waitFor('!!document.querySelector("#nearby-message")', 30000);
    check('unknown place gives a helpful message', (await js('document.querySelector("#nearby-message")?.textContent || ""')).includes('not found'));
  });

  // ---- Links in messages + one connected incident ----
  await step('message with a fake bank link → dangerous link warning', async () => {
    await click('#nav-calls');
    await type('#message-input', 'Dear customer your SBI account will be blocked today. Update KYC at https://sbi-kyc-update.com/login and share the OTP');
    await click('#btn-check');
    await waitFor('!!document.querySelector("#check-links-danger")', 5000);
    if (await exists('#critical-popup')) await click('#btn-critical-dismiss');
    await sleep(200);
    const banner = await js('document.querySelector("#check-links-danger")?.innerText || ""');
    check('message with a fake bank link → dangerous link warning', banner.includes('sbi-kyc-update.com'), banner.slice(0, 100));
  });
  await step('dashboard joins the scam message and the link into one high-risk incident', async () => {
    await click('#nav-home');
    await waitFor('/High risk/.test(document.querySelector("#dashboard-title")?.innerText || "")', 8000);
    const title = await js('document.querySelector("#dashboard-title")?.innerText || ""');
    const timeline = await js('document.querySelector("#timeline")?.innerText || ""');
    check('dashboard joins the scam message and the link into one high-risk incident',
      title.includes('High risk') && timeline.includes('dangerous link') && (await exists('#risk-alerts')), title);
  });
  await step('"I\'m safe — dismiss" clears the current alerts', async () => {
    await click('#btn-dismiss-alerts');
    await waitFor('!document.querySelector("#risk-alerts")', 5000);
    check('"I\'m safe — dismiss" clears the current alerts', !(await exists('#risk-alerts')) && !/High risk/.test(await js('document.querySelector("#dashboard-title")?.innerText || ""')));
  });

  // ---- Protect: link checker ----
  await step('Protect tab checks a disguised shopping link', async () => {
    await click('#nav-protect');
    await type('#link-input', 'amaz0n-offer.in/win');
    await click('#btn-link-check');
    await waitFor('!!document.querySelector("#link-verdict")', 5000);
    const verdict = await js('document.querySelector("#link-verdict")?.innerText || ""');
    check('Protect tab checks a disguised shopping link', verdict.includes('Dangerous') && (await exists('#shield-web-note')), verdict.slice(0, 90));
  });
  await step('a short link is explained, an official site is not flagged', async () => {
    await type('#link-input', 'https://bit.ly/3abc');
    await click('#btn-link-check');
    await sleep(200);
    const short = await js('document.querySelector("#link-verdict")?.innerText || ""');
    await type('#link-input', 'https://www.onlinesbi.sbi');
    await click('#btn-link-check');
    await sleep(200);
    const official = await js('document.querySelector("#link-verdict")?.innerText || ""');
    check('a short link is explained, an official site is not flagged', short.includes('Short link') && official.includes('Official site'), `${short.slice(0, 40)} | ${official.slice(0, 40)}`);
  });

  // ---- Payment check ----
  await step('Payment tab opens with demo label', async () => {
    await click('#nav-home');
    await click('#btn-open-payment');
    await sleep(300);
    check('Payment tab opens with demo label', (await text()).includes('simulated UPI app') && (await exists('#upi-form')));
  });
  await step('picking a call analyses it automatically', async () => {
    check('picking a call analyses it automatically', (await text()).includes('Call looks risky'));
  });
  await step('Pay is disabled for an invalid UPI ID', async () => {
    await type('#input-payee-vpa', 'not-a-upi-id');
    await sleep(100);
    const disabled = await js('document.querySelector("#btn-submit-upi-pay").disabled');
    await type('#input-payee-vpa', 'rbi.gov.verify91@okhdfcbank');
    check('Pay is disabled for an invalid UPI ID', disabled);
  });
  await step('risky call + unusual payment → pause sheet', async () => {
    await click('#btn-submit-upi-pay');
    await sleep(300);
    check('risky call + unusual payment → pause sheet', await exists('#tier2-pause-modal'));
  });
  await step('"Don\'t pay" closes the pause', async () => {
    await click('#btn-pause-cancel');
    await sleep(200);
    check('"Don\'t pay" closes the pause', !(await exists('#tier2-pause-modal')) && (await text()).includes('Payment cancelled'));
  });
  await step('"I know this person" closes the pause', async () => {
    await click('#btn-submit-upi-pay');
    await sleep(300);
    await click('#btn-pause-known');
    await sleep(200);
    check('"I know this person" closes the pause', !(await exists('#tier2-pause-modal')) && (await text()).includes('someone you know'));
  });
  await step('Report → report pack page', async () => {
    await type('#demo-scenario', 'customs_parcel_fedex');
    await sleep(300);
    await type('#input-payee-vpa', 'other.payee@okicici');
    await click('#btn-submit-upi-pay');
    await sleep(300);
    if (!(await exists('#tier2-pause-modal'))) throw new Error('pause did not open');
    await click('#btn-pause-report');
    await sleep(500);
    check('Report → report pack page', await exists('#tier3-report-pack-screen'));
  });
  await step('report links are user actions only', async () => {
    const tel = await attr('#btn-call-1930', 'href');
    const ncrp = await attr('#btn-open-ncrp', 'href');
    const sms = await attr('#btn-notify-family-contact', 'href');
    check('report links are user actions only', tel === 'tel:1930' && ncrp === 'https://cybercrime.gov.in/' && sms.startsWith('sms:?body='));
  });
  await step('Save or share downloads the report', async () => {
    await click('#btn-save-report');
    await sleep(1500);
    const files = readdirSync(downloads).filter(f => f.endsWith('.json'));
    check('Save or share downloads the report', files.length === 1 && (await text()).includes('Saved as'), files.join(','));
  });
  await step('Back to payment check', async () => {
    await click('#btn-report-done');
    await sleep(300);
    check('Back to payment check', (await exists('#upi-form')) && (await text()).includes('Payment not made'));
  });
  await step('normal call + normal payment → no warning', async () => {
    await type('#demo-scenario', 'benign_grocery_vendor');
    await sleep(300);
    await click('#btn-submit-upi-pay');
    await sleep(300);
    check('normal call + normal payment → no warning', !(await exists('#tier2-pause-modal')) && (await text()).includes('No warning needed'));
  });
  await step('Tier 1 warning can be dismissed', async () => {
    // A risky call but a familiar-looking payment → advisory only. (The scenario's own
    // payee is on the demo reported list, which would push even ₹100 to a pause.)
    await type('#demo-scenario', 'kbc_lottery_winner');
    await sleep(300);
    await type('#input-payee-vpa', 'local.shop@ybl');
    await type('#input-payment-amount', '100');
    await click('#btn-submit-upi-pay');
    await sleep(300);
    const shown = await exists('#tier1-nudge-banner');
    if (await exists('#tier2-pause-modal')) await click('#btn-pause-cancel');
    if (shown) { await click('#dismiss-nudge-btn'); await sleep(200); }
    check('Tier 1 warning can be dismissed', shown && !(await exists('#tier1-nudge-banner')));
  });
  await step('continue-to-pay appears only after the 60 s pause', async () => {
    await type('#demo-scenario', 'digital_arrest_cbi');
    await sleep(300);
    await type('#input-payee-vpa', 'third.payee@ybl');
    await click('#btn-submit-upi-pay');
    await sleep(300);
    const sheet = await exists('#tier2-pause-modal');
    const earlyHidden = !(await exists('#btn-pause-proceed-anyway'));
    const appeared = await waitFor('!!document.querySelector("#btn-pause-proceed-anyway")', 65000);
    if (appeared) { await click('#btn-pause-proceed-anyway'); await sleep(200); }
    check('continue-to-pay appears only after the 60 s pause', sheet && earlyHidden && appeared && (await text()).includes('You chose to continue'),
      `sheet=${sheet} earlyHidden=${earlyHidden} appeared=${appeared} outcome=${(await js('document.querySelector("#demo-outcome")?.innerText || ""')).slice(0, 80)}`);
  });

  // ---- Settings ----
  await step('Settings tab opens', async () => {
    await click('#nav-settings');
    await sleep(300);
    check('Settings tab opens', (await exists('#llm-card')) && (await text()).includes('Stays on this phone'));
  });
  await step('Clear saved place searches', async () => {
    const before = await js('Object.keys(localStorage).filter(k => k.startsWith("satark.osm")).length');
    await click('#btn-clear-cache');
    await sleep(200);
    const after = await js('Object.keys(localStorage).filter(k => k.startsWith("satark.osm")).length');
    check('Clear saved place searches', after === 0 && (await text()).includes('cleared'), `${before} → ${after} entries`);
  });
  await step('native-only buttons are hidden on the web', async () => {
    check('native-only buttons are hidden on the web', !(await exists('#btn-llm-download')) && !(await exists('#btn-open-app-settings')));
  });

  await step('trusted contact can be saved', async () => {
    await type('#trusted-name', 'Priya');
    await type('#trusted-number', '+91 98123 45678');
    await click('#btn-trusted-save');
    await sleep(500);
    check('trusted contact can be saved', (await exists('#trusted-contact-current')) && (await text()).includes('+919812345678'));
  });
  await step('settings are encrypted in local storage', async () => {
    const stored = await js('Object.keys(localStorage).filter(k => k.startsWith("satark.secure.")).map(k => localStorage.getItem(k)).join("|")');
    check('settings are encrypted in local storage', stored.length > 0 && !stored.includes('9812345678') && !stored.includes('Priya'));
  });
  await step('pause offers to tell the trusted contact', async () => {
    await click('#nav-home');
    await click('#btn-open-payment');
    await sleep(300);
    await type('#demo-scenario', 'distressed_relative');
    await sleep(500);
    await type('#input-payee-vpa', 'surgeon.fund@ybl');
    await click('#btn-submit-upi-pay');
    await sleep(500);
    const href = await attr('#btn-pause-trusted-contact', 'href');
    if (await exists('#tier2-pause-modal')) await click('#btn-pause-cancel');
    check('pause offers to tell the trusted contact', Boolean(href) && href.startsWith('sms:+919812345678?body=') && !/\d{4}/.test(decodeURIComponent(href.split('body=')[1] || '')), href);
  });
  await step('trusted contact can be removed', async () => {
    await click('#nav-settings');
    await sleep(300);
    await click('#btn-trusted-remove');
    await sleep(400);
    check('trusted contact can be removed', (await exists('#trusted-number')) && !(await exists('#trusted-contact-current')));
  });

  // ---- Navigation ----
  await step('every tab button works', async () => {
    let ok = true;
    for (const id of ['home', 'calls', 'protect', 'nearby', 'settings', 'home']) {
      await click(`#nav-${id}`);
      await sleep(150);
      ok = ok && (await exists(`#nav-${id}.active`));
    }
    check('every tab button works', ok);
  });

  check('no uncaught page errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
} finally {
  ws.close();
  browser.kill();
}
const failed = results.filter(r => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
