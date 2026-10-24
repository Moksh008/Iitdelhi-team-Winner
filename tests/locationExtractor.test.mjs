import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractLocation } from '../src/engine/locationExtractor.js';
import { broaderQueries, contactSearchUrl } from '../src/services/osmPlaces.js';

const cases = [
  ['Your son had an accident near Anar Dana Chowk, Patiala. Send money immediately.', 'Anar Dana Chowk, Patiala'],
  ['your son had an accident near anardana chowk in patiala he is admitted', 'anardana chowk, Patiala'],
  ['beta ka accident punjabi university ke samne hua hai paise bhejo', 'punjabi university'],
  ['चितकारा यूनिवर्सिटी के सामने एक्सीडेंट हुआ है', 'चितकारा यूनिवर्सिटी'],
  ['he is in sector 17 chandigarh right now', 'sector 17 chandigarh'],
  ['aapka beta rajindra hospital mein admit hai paise bhejo', 'rajindra hospital'],
  ['he is in apollo hospital delhi please send money', 'apollo hospital, Delhi'],
  ['main patiala se bol raha hoon aapke bete ka accident hua hai', 'Patiala'],
  ['पटियाला में एक्सीडेंट हुआ है पैसे भेजो', 'Patiala'],
  ['your son is admitted in a government hospital in ludhiana', 'Ludhiana'],
  ['i am calling from the cbi cybercrime cell do not disconnect', null],
  // Whisper often mishears city names; close matches are corrected.
  ['hello your son had an accident near rajandra hospital in pradyala he is admitted', 'rajandra hospital, Patiala'],
  ['your son had an accident near an ardh nirdh chowk in padella', 'ardh nirdh chowk, Patiala'],
  ['beta ka accident jalandar mein hua', 'Jalandhar'],
  ['we are going to dinner in paradise', null],
  ['i will meet you at the market tomorrow', null],
  ['hi mom i will be home by seven', null],
  ['he is admitted in the hospital send money', null],
];
for (const [input, expected] of cases) {
  test(`extract: ${input.slice(0, 40)}`, () => {
    const result = extractLocation(input);
    assert.equal(result ? result.text : null, expected);
  });
}

test('broader queries drop the most specific part first', () => {
  assert.deepEqual(broaderQueries('Anardana Chowk, Patiala, Punjab'), ['Patiala, Punjab', 'Punjab']);
  assert.deepEqual(broaderQueries('anardana chowk patiala'), ['patiala']);
});

test('contact search URL is encoded and includes the locality', () => {
  assert.equal(
    contactSearchUrl('City Hospital & Trauma Centre', 'Patiala'),
    'https://www.google.com/maps/search/?api=1&query=City%20Hospital%20%26%20Trauma%20Centre%2C%20Patiala'
  );
});
