import { test } from 'node:test';
import assert from 'node:assert/strict';
import vectors from '../shared/scam-rule-vectors.json' with { type: 'json' };
import { LocalScamSession } from '../src/engine/localAnalyzer.js';

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
