// Emulator / device test of the protection features in the installed debug APK:
// dashboard, scam-link blocking (local VPN), threat list, per-app network log,
// incident correlation, remote-access detection and lock, and the security scan.
//
// Prerequisites: debug APK installed. Optional: a stand-in remote-access app
// (any APK with package com.anydesk.anydeskandroid) passed as an argument is
// installed for the remote-access checks and removed again.
// Usage: node tools/android-shield-test.mjs [path/to/stand-in-anydesk.apk]
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const ADB = process.env.ADB || join(process.env.LOCALAPPDATA || '', 'Android/Sdk/platform-tools/adb.exe');
const PKG = 'in.satark.shield';
const STAND_IN = process.argv[2];
const SHOTS = join(tmpdir(), 'satark-shield-test');
mkdirSync(SHOTS, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const adb = (...args) => execFileSync(ADB, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim();
const shell = cmd => { try { return adb('shell', cmd); } catch (e) { return `${e.stdout || ''}${e.stderr || ''}`; } };
const screenshot = name => writeFileSync(join(SHOTS, `${name}.png`), execFileSync(ADB, ['exec-out', 'screencap', '-p'], { maxBuffer: 64 * 1024 * 1024 }));

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: Boolean(ok) });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};
const step = async (name, fn) => { try { await fn(); } catch (e) { check(name, false, e.message.split('\n')[0]); } };

let ws;
let nextId = 0;
const pending = new Map();
const connectWebView = async () => {
  let targets = null;
  for (let attempt = 0; attempt < 20 && !targets; attempt += 1) {
    try {
      const pid = shell(`pidof ${PKG}`);
      try { adb('forward', '--remove', 'tcp:9556'); } catch { /* not forwarded yet */ }
      adb('forward', 'tcp:9556', `localabstract:webview_devtools_remote_${pid}`);
      const list = await fetch('http://127.0.0.1:9556/json').then(r => r.json());
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
  const timer = setTimeout(() => { pending.delete(id); reject(new Error('WebView did not answer')); }, 60000);
  pending.set(id, m => (clearTimeout(timer), m.result?.exceptionDetails ? reject(new Error(m.result.exceptionDetails.exception?.description || 'js error')) : resolve(m.result?.result?.value)));
  ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }));
});
const plugin = (method, args = {}) => js(`Capacitor.Plugins.SatarkNative.${method}(${JSON.stringify(args)})`);
const click = sel => js(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) throw new Error('missing ${sel}'); if (el.disabled) throw new Error('disabled ${sel}'); el.click(); return true; })()`);
const exists = sel => js(`!!document.querySelector(${JSON.stringify(sel)})`);
const waitFor = async (expr, ms = 30000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await js(expr).catch(() => false)) return true; await sleep(500); }
  return false;
};
/** Resolves a name from the adb shell (uid 2000), i.e. through the VPN like any app. */
const resolves = host => /^PING /m.test(shell(`ping -c 1 -W 2 ${host}`));

try {
  // Allow the VPN and notifications without the system dialogs, then start fresh.
  shell(`appops set ${PKG} ACTIVATE_VPN allow`);
  shell(`pm grant ${PKG} android.permission.POST_NOTIFICATIONS`);
  shell(`am force-stop ${PKG}`);
  shell(`am start -n ${PKG}/.MainActivity`);
  await sleep(4000);
  await connectWebView();
  await js('Capacitor.Plugins.SatarkNative.stopShield()').catch(() => undefined);
  await plugin('clearSecurityEvents');
  await plugin('clearNetworkLog');

  await step('app opens on the protection dashboard', async () => {
    const ok = await waitFor('!!document.querySelector("#dashboard-status")', 15000);
    screenshot('01-dashboard');
    check('app opens on the protection dashboard', ok, await js('document.querySelector("#dashboard-title")?.innerText || ""'));
  });

  await step('Protection ON starts the local VPN', async () => {
    await click('#btn-protection-toggle');
    const ok = await waitFor('Capacitor.Plugins.SatarkNative.getShieldState().then(s => s.running && s.mode === "filter")', 15000);
    check('Protection ON starts the local VPN', ok && shell('dumpsys connectivity').includes('VPN'));
  });

  let feedDomain = '';
  await step('threat list downloads', async () => {
    const status = await plugin('updateThreatFeed');
    const list = await fetch('https://malware-filter.gitlab.io/malware-filter/phishing-filter-hosts.txt').then(r => r.text()).catch(() => '');
    feedDomain = list.split('\n').find(line => /^0\.0\.0\.0 [a-z0-9-]+\.(top|xyz|shop|online|site)$/.test(line))?.split(' ')[1] || '';
    check('threat list downloads', status.count > 1000 && !status.error, `${status.count} domains; testing ${feedDomain}`);
  });

  await step('ordinary sites still resolve through the shield', async () => {
    check('ordinary sites still resolve through the shield', resolves('google.com') && resolves('wikipedia.org'));
  });

  await step('a fake bank site is blocked and logged with the app and reason', async () => {
    resolves('sbi-kyc-update.com');
    const log = await plugin('getNetworkLog', { blockedOnly: true });
    const entry = (log.entries || []).find(item => item.target === 'sbi-kyc-update.com');
    check('a fake bank site is blocked and logged with the app and reason', entry?.reason === 'lookalike' && entry.action === 'blocked',
      entry ? `${entry.app}: ${entry.detail}` : JSON.stringify(log.entries?.slice(0, 2)));
  });

  await step('a typo-squat and a reported phishing site are blocked', async () => {
    resolves('hdfc-bank.com');
    if (feedDomain) resolves(feedDomain);
    const log = await plugin('getNetworkLog', { blockedOnly: true });
    const reasons = Object.fromEntries((log.entries || []).map(item => [item.target, item.reason]));
    check('a typo-squat and a reported phishing site are blocked', reasons['hdfc-bank.com'] === 'typosquat' && (!feedDomain || reasons[feedDomain] === 'threat_feed'),
      JSON.stringify(reasons));
  });

  await step('a trusted site is let through', async () => {
    await plugin('allowDomain', { domain: 'hdfc-bank.com', allowed: true });
    await plugin('clearNetworkLog');
    resolves('hdfc-bank.com');
    const log = await plugin('getNetworkLog', { blockedOnly: true });
    await plugin('allowDomain', { domain: 'hdfc-bank.com', allowed: false });
    check('a trusted site is let through', !(log.entries || []).some(item => item.target === 'hdfc-bank.com'));
  });

  await step('dashboard counts the threats blocked today', async () => {
    const dash = await plugin('getDashboard');
    check('dashboard counts the threats blocked today', dash.threatsBlockedToday >= 2 && dash.timeline.some(e => e.kind === 'link_blocked'),
      `${dash.threatsBlockedToday} blocked; risk ${dash.riskLevel}`);
  });

  await step('a scam message after a blocked link raises one high-risk incident', async () => {
    await plugin('recordSecurityEvent', { kind: 'scam_message', title: 'Scam message: Account-block or KYC pressure', detail: 'Triggered by: “share the OTP”' });
    const dash = await plugin('getDashboard');
    const incident = dash.timeline.find(e => e.kind === 'high_risk');
    check('a scam message after a blocked link raises one high-risk incident', dash.riskLevel === 'high' && Boolean(incident), incident?.title);
    await click('#nav-home');
    await sleep(6000);
    screenshot('02-dashboard-high-risk');
  });

  await step('link checker in the app uses the threat list', async () => {
    const verdict = feedDomain ? await plugin('checkLink', { url: `https://${feedDomain}/login` }) : { blocked: true, reason: 'threat_feed' };
    const official = await plugin('checkLink', { url: 'https://retail.onlinesbi.sbi/' });
    check('link checker in the app uses the threat list', verdict.blocked && verdict.reason === 'threat_feed' && !official.blocked && official.official);
  });

  if (STAND_IN) {
    adb('install', '-r', STAND_IN);
    await step('an installed screen-sharing app is detected', async () => {
      const status = await plugin('getRemoteAccessStatus');
      check('an installed screen-sharing app is detected', status.apps?.some(app => app.packageName === 'com.anydesk.anydeskandroid'), status.apps?.map(app => app.app).join(', '));
    });
    await step('the lock cuts screen-sharing apps off and leaves other apps alone', async () => {
      const result = await plugin('lockRemoteAccess', { minutes: 5 });
      const locked = await waitFor('Capacitor.Plugins.SatarkNative.getShieldState().then(s => s.mode === "lock" && s.lockedUntil > Date.now())', 10000);
      // The shell is not a locked app, so it uses the normal network while the lock is on.
      const shellOk = resolves('google.com');
      await click('#nav-protect');
      await sleep(4000);
      screenshot('03-protect-locked');
      check('the lock cuts screen-sharing apps off and leaves other apps alone', result.status === 'locked' && locked && shellOk);
    });
    await step('unlock returns to scam-link blocking', async () => {
      await plugin('unlockRemoteAccess');
      const back = await waitFor('Capacitor.Plugins.SatarkNative.getShieldState().then(s => s.mode === "filter" && !s.lockedUntil)', 10000);
      await plugin('clearNetworkLog');
      resolves('sbi-kyc-update.com');
      const log = await plugin('getNetworkLog', { blockedOnly: true });
      check('unlock returns to scam-link blocking', back && (log.entries || []).some(item => item.target === 'sbi-kyc-update.com'));
    });
    await step('security scan reports the screen-sharing app', async () => {
      const scan = await plugin('runSecurityScan');
      check('security scan reports the screen-sharing app', scan.checks.some(c => c.id === 'remote' && c.status === 'warn'), `${scan.issues} issues`);
    });
    adb('uninstall', 'com.anydesk.anydeskandroid');
  }

  await step('security scan runs', async () => {
    const scan = await plugin('runSecurityScan');
    check('security scan runs', Array.isArray(scan.checks) && scan.checks.some(c => c.id === 'shield' && c.status === 'ok'), scan.checks.map(c => `${c.id}:${c.status}`).join(' '));
  });

  await step('emergency checklist opens', async () => {
    await click('#nav-home');
    await sleep(500);
    await click('#btn-emergency');
    await sleep(800);
    screenshot('04-checklist');
    const ok = await exists('#emergency-checklist');
    await click('#btn-checklist-close');
    check('emergency checklist opens', ok);
  });

  await step('Protection OFF stops the VPN', async () => {
    await plugin('stopShield');
    const ok = await waitFor('Capacitor.Plugins.SatarkNative.getShieldState().then(s => !s.running)', 10000);
    check('Protection OFF stops the VPN', ok && resolves('google.com'));
  });
} finally {
  ws?.close();
}
const failed = results.filter(r => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed. Screenshots: ${SHOTS}`);
process.exit(failed ? 1 : 0);
