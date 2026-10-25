import { test } from 'node:test';
import assert from 'node:assert/strict';
import vectors from '../shared/scam-rule-vectors.json' with { type: 'json' };
import { LocalScamSession, findCriticalCues } from '../src/engine/localAnalyzer.js';

for (const vector of vectors.cases) {
  test(vector.name, () => {
    const session = new LocalScamSession();
    let result;
    for (const utterance of vector.session) result = session.ingest(utterance);
    assert.deepEqual(result.indicators.map(item => item.cluster).sort(), [...vector.clusters].sort());
    assert.equal(result.category, vector.category);
    assert.equal(result.action_tier, vector.tier);
    assert.equal(result.conversation_score, vector.score);
  });
}

test('cues expire after the session window', () => {
  let now = 0;
  const session = new LocalScamSession(() => now);
  session.ingest('this is the crime branch inspector');
  now += 11 * 60 * 1000;
  const result = session.ingest('paise bhej do');
  assert.equal(result.action_tier, 0);
});

test('critical cues show the words around where they were heard', () => {
  const cues = findCriticalCues('Hello sir, I am calling from your bank. Please share the OTP you just received to stop the block.');
  const otp = cues.find(cue => /otp/i.test(cue.terms.join(' ')));
  assert.ok(otp, JSON.stringify(cues));
  assert.match(otp.context, /share the otp you/);
  assert.ok(otp.context.startsWith('…') && otp.context.endsWith('…'));
  assert.deepEqual(findCriticalCues('see you at dinner tonight'), []);
});
