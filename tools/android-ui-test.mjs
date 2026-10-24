// End-to-end UI test of the installed debug APK on a device/emulator.
// Presses every button: app buttons through the WebView (DevTools protocol),
// and checks that external actions open the right Android app. The floating
// bubble is covered by OverlayBubbleTest (UiAutomator instrumentation test).
//
// Prerequisites: debug APK installed; permissions granted; test WAVs pushed to
//   /sdcard/Android/data/in.satark.shield/files/{loc_0,en_0}.wav
// Usage: node tools/android-ui-test.mjs [--with-llm-download]
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const ADB = process.env.ADB || join(process.env.LOCALAPPDATA || '', 'Android/Sdk/platform-tools/adb.exe');
const PKG = 'in.satark.shield';
const SHOTS = join(tmpdir(), 'satark-android-ui');
mkdirSync(SHOTS, { recursive: true });
const withLlm = process.argv.includes('--with-llm-download');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const adb = (...args) => execFileSync(ADB, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim();
const shell = cmd => adb('shell', cmd);

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: Boolean(ok) });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};
const step = async (name, fn) => { try { await fn(); } catch (e) { check(name, false, e.message.split('\n')[0]); } };
const screenshot = name => writeFileSync(join(SHOTS, `${name}.png`), execFileSync(ADB, ['exec-out', 'screencap', '-p'], { maxBuffer: 64 * 1024 * 1024 }));
const resumed = () => {
  const out = shell('dumpsys activity activities');
  const line = out.split('\n').find(l => /topResumedActivity|mResumedActivity/.test(l)) || '';
  return line.trim();
};
const goBackToApp = async () => {
  shell(`am start -n ${PKG}/.MainActivity`);
  await sleep(2500);
  // Reconnect if Android restarted the app process meanwhile.
  try { await js('1'); } catch { ws?.close(); await connectWebView(); }
};

// ---- uiautomator (real taps on the bubble / system UI) ----
const dumpUi = () => {
  // uiautomator can briefly fail while the screen changes; retry a few times.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const out = shell('uiautomator dump /sdcard/satark-ui.xml');
      if (!/ERROR/.test(out)) return shell('cat /sdcard/satark-ui.xml');
    } catch { /* retry */ }
    execFileSync(process.platform === 'win32' ? 'powershell' : 'sleep', process.platform === 'win32' ? ['-NoProfile', '-Command', 'Start-Sleep -Milliseconds 700'] : ['0.7']);
  }
  return '';
};
const findNode = (xml, matcher) => {
  for (const m of xml.matchAll(/<node [^>]*>/g)) {
    const node = m[0];
    const text = (node.match(/ text="([^"]*)"/) || [])[1] || '';
    const desc = (node.match(/ content-desc="([^"]*)"/) || [])[1] || '';
    if (matcher(text, desc)) {
      const b = node.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
      return { text, desc, x: (Number(b[1]) + Number(b[3])) >> 1, y: (Number(b[2]) + Number(b[4])) >> 1 };
    }
  }
  return null;
};
const tapNode = async (label, matcher) => {
  const node = findNode(dumpUi(), matcher);
  if (!node) throw new Error(`not on screen: ${label}`);
  shell(`input tap ${node.x} ${node.y}`);
  await sleep(1200);
  return node;
};
const onScreen = matcher => Boolean(findNode(dumpUi(), matcher));

// ---- WebView (app buttons) ----
let ws;
let nextId = 0;
const pending = new Map();
const connectWebView = async () => {
  // The WebView's debug socket appears a few seconds after a cold start.
  let targets = null;
  for (let attempt = 0; attempt < 20 && !targets; attempt += 1) {
    try {
      const pid = shell(`pidof ${PKG}`);
      try { adb('forward', '--remove', 'tcp:9555'); } catch { /* not forwarded yet */ }
      adb('forward', 'tcp:9555', `localabstract:webview_devtools_remote_${pid}`);
      const list = await fetch('http://127.0.0.1:9555/json').then(r => r.json());
      if (list.some(t => t.type === 'page')) targets = list;
    } catch { /* retry */ }
    if (!targets) await sleep(1500);
  }
  if (!targets) throw new Error('could not connect to the app WebView');
  ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r));
  ws.addEventListener('message', e => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  });
};
const js = expression => new Promise((resolve, reject) => {
  const id = ++nextId;
  const timer = setTimeout(() => { pending.delete(id); reject(new Error('WebView did not answer')); }, 30000);
  pending.set(id, m => (clearTimeout(timer), m.result?.exceptionDetails ? reject(new Error(m.result.exceptionDetails.exception?.description || 'js error')) : resolve(m.result?.result?.value)));
  ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }));
});
const click = sel => js(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) throw new Error('missing ${sel}'); if (el.disabled) throw new Error('disabled ${sel}'); el.click(); return true; })()`);
const exists = sel => js(`!!document.querySelector(${JSON.stringify(sel)})`);
const text = () => js('document.body.innerText');
const waitFor = async (expr, ms = 30000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await js(expr).catch(() => false)) return true; await sleep(400); }
  return false;
};
const typeInto = (sel, value) => js(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); return true; })()`);
const listeningState = () => js('Capacitor.Plugins.SatarkNative.getListeningState()');

const bubble = (t, d) => d === 'Satark floating controls';

try {
  shell('input keyevent KEYCODE_WAKEUP');
  shell(`am force-stop ${PKG}`);
  shell(`am start -n ${PKG}/.MainActivity`);
  await sleep(9000);
  await connectWebView();

  // ---------------- Home ----------------
  await step('opens directly on the Home dashboard', async () => {
    const ready = await waitFor('!!document.querySelector("#btn-listen") && !!document.querySelector("#nav-home.active")', 20000);
    check('opens directly on the Home dashboard', ready);
    screenshot('01-home');
  });
  await step('Start listening (app button)', async () => {
    await click('#btn-listen');
    const ok = await waitFor('Capacitor.Plugins.SatarkNative.getListeningState().then(s => s.listening && /speak now|Hearing/.test(s.status))', 20000);
    check('Start listening (app button)', ok, (await listeningState()).status);
  });
  await step('live transcript shows what was said', async () => {
    await js("Capacitor.Plugins.SatarkNative.debugFeedWav({ name: 'loc_0.wav' })");
    const ok = await waitFor('document.querySelectorAll("#transcript-lines li").length >= 2 && !!document.querySelector("#btn-live-alert")', 60000);
    screenshot('02-home-live');
    check('live transcript shows what was said', ok, (await js('[...document.querySelectorAll("#transcript-lines li")].map(l => l.innerText).join(" / ")')).slice(0, 120));
  });
  await step('"View details" opens the warning page', async () => {
    await click('#btn-live-alert');
    await sleep(800);
    check('"View details" opens the warning page', (await exists('#alert-header')) && !(await exists('.bottom-nav')));
  });
  await step('AI note section explains the model is optional', async () => {
    const ok = await waitFor('(document.querySelector("#alert-ai-note")?.innerText || "").match(/not installed|Skipped while live listening/)', 20000);
    check('AI note section explains the model is optional', ok, (await js('document.querySelector("#alert-ai-note")?.innerText || ""')).split('\n')[1]);
  });
  await step('place from the call is searched automatically', async () => {
    const ok = await waitFor('!!document.querySelector("#place-list") || !!document.querySelector("#nearby-message.danger")', 60000);
    screenshot('03-alert');
    check('place from the call is searched automatically', ok && (await exists('#alert-detected-place')), await js('document.querySelector("#nearby-query").value'));
  });
  await step('"Find phone number" opens the browser', async () => {
    if (!(await exists('#place-list a.find-phone'))) throw new Error('no results to open');
    await click('#place-list a.find-phone');
    await sleep(4000);
    const top = resumed();
    screenshot('04-find-phone');
    check('"Find phone number" opens the browser', /chrome|browser|apps\.maps/i.test(top), top.slice(-70));
    await goBackToApp();
  });
  await step('"Call 1930" opens the dialer (no call is placed)', async () => {
    await click('#btn-alert-call-1930');
    await sleep(3000);
    const top = resumed();
    check('"Call 1930" opens the dialer (no call is placed)', /dialer|contacts/i.test(top), top.slice(-70));
    await goBackToApp();
  });
  await step('Back button returns to Home', async () => {
    await click('#btn-alert-back');
    await sleep(500);
    check('Back button returns to Home', (await exists('#btn-listen')) && (await exists('.bottom-nav')));
  });
  await step('Stop listening (app button)', async () => {
    await click('#btn-listen');
    const ok = await waitFor('Capacitor.Plugins.SatarkNative.getListeningState().then(s => !s.listening)', 10000);
    check('Stop listening (app button)', ok && (await text()).includes('Tap to start listening'));
  });

  // The floating bubble lives in an overlay window that `uiautomator dump` cannot
  // see; it is tested with real taps by the instrumentation test
  // android/app/src/androidTest/java/in/satark/shield/OverlayBubbleTest.kt.

  // ---------------- Nearby ----------------
  await step('Nearby: place from the latest call, no GPS button', async () => {
    await click('#nav-nearby');
    await sleep(800);
    const query = await js('document.querySelector("#nearby-query").value');
    check('Nearby: place from the latest call, no GPS button', /patiala/i.test(query) && !(await exists('#btn-use-location')), query);
  });
  await step('Nearby: search a place', async () => {
    await click('#nav-nearby');
    await typeInto('#nearby-query', 'Patiala');
    await click('#btn-nearby-search');
    const ok = await waitFor('!!document.querySelector("#place-list") || !!document.querySelector("#nearby-message.danger")', 60000);
    screenshot('08-nearby');
    check('Nearby: search a place', ok && (await exists('#place-list')) && (await exists('.leaflet-container')));
  });
  await step('Nearby: every category', async () => {
    const outcomes = [];
    for (const id of ['shop', 'pharmacy', 'police', 'cybercrime', 'bank', 'hospital']) {
      await click(`#cat-${id}`);
      await sleep(300);
      await waitFor('!!document.querySelector("#place-list") || !!document.querySelector("#nearby-message")', 60000);
      outcomes.push(`${id}:${await js('document.querySelectorAll("#place-list .place").length')}`);
    }
    check('Nearby: every category', true, outcomes.join(' '));
  });
  // ---------------- Payment check ----------------
  await step('Payment: pause → report → native share sheet', async () => {
    await click('#nav-payment');
    await sleep(500);
    await click('#btn-submit-upi-pay');
    await sleep(800);
    if (!(await exists('#tier2-pause-modal'))) throw new Error('pause did not open');
    screenshot('09-pause');
    await click('#btn-pause-report');
    await sleep(800);
    await click('#btn-save-report');
    await sleep(3000);
    const top = resumed();
    screenshot('10-share-sheet');
    check('Payment: pause → report → native share sheet', /intentresolver|ChooserActivity|ResolverActivity/i.test(top), top.slice(-70));
    shell('input keyevent KEYCODE_BACK');
    await sleep(1500);
  });
  await step('Payment: "Message a family member" opens Messages', async () => {
    await goBackToApp();
    await click('#btn-notify-family-contact');
    await sleep(3000);
    const top = resumed();
    check('Payment: "Message a family member" opens Messages', /messaging|mms|sms/i.test(top), top.slice(-70));
    await goBackToApp();
  });
  await step('Payment: "Open cybercrime.gov.in" opens the browser', async () => {
    await click('#btn-open-ncrp');
    await sleep(4000);
    const top = resumed();
    check('Payment: "Open cybercrime.gov.in" opens the browser', /chrome|browser/i.test(top), top.slice(-70));
    await goBackToApp();
  });
  await step('Payment: back to the form', async () => {
    await click('#btn-report-done');
    await sleep(500);
    check('Payment: back to the form', await exists('#upi-form'));
  });

  // ---------------- Settings ----------------
  await step('Settings: speech model shows Ready', async () => {
    await click('#nav-settings');
    await sleep(800);
    screenshot('11-settings');
    check('Settings: speech model shows Ready', (await js('document.querySelector("#speech-status").innerText')) === 'Ready');
  });
  await step('Settings: AI model Download then Cancel', async () => {
    await click('#btn-llm-download');
    const started = await waitFor('document.querySelector("#llm-status").innerText.includes("Downloading")', 15000);
    await sleep(3000);
    await click('#btn-llm-cancel');
    const stopped = await waitFor('!!document.querySelector("#btn-llm-download")', 20000);
    check('Settings: AI model Download then Cancel', started && stopped, await js('document.querySelector("#llm-status").innerText'));
  });
  if (withLlm) {
    await step('Settings: AI model resumes, installs, then Remove', async () => {
      await click('#btn-llm-download');
      const ready = await waitFor('document.querySelector("#llm-status").innerText.includes("Installed")', 600000);
      await click('#btn-llm-remove');
      const removed = await waitFor('!!document.querySelector("#btn-llm-download")', 20000);
      check('Settings: AI model resumes, installs, then Remove', ready && removed);
    });
  }
  await step('Settings: "Clear saved place searches"', async () => {
    await click('#btn-clear-cache');
    await sleep(300);
    check('Settings: "Clear saved place searches"', (await js('Object.keys(localStorage).filter(k => k.startsWith("satark.osm")).length')) === 0);
  });
  await step('Settings: "Change permissions" opens Android settings', async () => {
    await click('#btn-open-app-settings');
    await sleep(3000);
    const top = resumed();
    check('Settings: "Change permissions" opens Android settings', /settings/i.test(top), top.slice(-70));
    await goBackToApp();
  });
} finally {
  ws?.close();
}
const failed = results.filter(r => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed. Screenshots: ${SHOTS}`);
process.exit(failed ? 1 : 0);
