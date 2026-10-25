import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkDomain, extractLinks, hostOf, isShortener } from '../src/engine/linkRules.js';
import { findTriggerStatement } from '../src/engine/localAnalyzer.js';

// Same cases as android/app/src/test/.../DnsShieldTest.kt, so the web and phone rules agree.
const BLOCKED = ['sbi-kyc-update.com', 'hdfc-reward-points.in', 'www.paytmcashback.xyz', 'yono-sbi-verify.co.in', 'satark-scam-test.in',
  'm.satark-scam-test.in', 'hdfc-bank.com', 'icicbank.com', 'flipkarrt.com', 'amaz0n.in', 'paytrn.co', 'amazon-diwali-offer.xyz',
  'flipkart-bigbillion-sale.in', 'myntra-free-gift.top', 'amaz0n-offer.in', '5bi-kyc.top'];
const SAFE = ['onlinesbi.sbi', 'retail.onlinesbi.sbi', 'hdfcbank.com', 'netbanking.hdfcbank.com', 'paytm.com', 'www.incometax.gov.in',
  'google.com', 'wikipedia.org', 'sbi.co.in', 'hdfccareers.com', 'kyc.example.com', 'lesbiannews.com', 'example.com', 'amazon.co.uk',
  'flipkartwholesale.com', 'www.amazon.in', 'm.media-amazon.com', 'kodak.com', 'hdfclife.com', 'icicidirect.com', 'sbicard.com',
  'paytmmall.com', 'bit.ly', 'github.com', 'flipkart.com'];

for (const domain of BLOCKED) test(`blocks ${domain}`, () => assert.equal(checkDomain(domain).blocked, true, JSON.stringify(checkDomain(domain))));
for (const domain of SAFE) test(`allows ${domain}`, () => assert.equal(checkDomain(domain).blocked, false, JSON.stringify(checkDomain(domain))));

test('reasons', () => {
  assert.equal(checkDomain('hdfc-bank.com').reason, 'typosquat');
  assert.equal(checkDomain('sbi-kyc-update.com').reason, 'lookalike');
  assert.equal(checkDomain('www.bad.top', d => d === 'www.bad.top').reason, 'threat_feed');
  assert.equal(checkDomain('hdfcbank.com', () => true).blocked, false); // official sites always win
});

test('shorteners', () => {
  assert.equal(isShortener('bit.ly'), true);
  assert.equal(isShortener('example.com'), false);
});

test('finds links in a message, with or without https', () => {
  const links = extractLinks('Dear customer your SBI a/c is blocked. Update KYC at https://sbi-kyc-update.com/login or sbi-kyc.in/x. Mail help@gmail.com, Mr.Sharma.');
  assert.deepEqual(links.map(link => link.host), ['sbi-kyc-update.com', 'sbi-kyc.in']);
  assert.deepEqual(extractLinks('meet me at 5.30 pm, e.g. tomorrow'), []);
  assert.equal(hostOf('bit.ly/abc'), 'bit.ly');
  assert.equal(hostOf('not a link'), null);
});

test('finds the statement that triggered a warning', () => {
  const text = 'Hello sir, I am calling from your bank. Your account will be blocked today. Please share the OTP you just received.';
  assert.match(findTriggerStatement(text), /share the OTP/);
  assert.equal(findTriggerStatement('see you at dinner'), '');
});
