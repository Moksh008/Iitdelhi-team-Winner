/**
 * Best-effort extraction of a place mentioned in a call transcript, so nearby
 * help can be searched automatically. The user can always edit or replace it.
 * Runs locally; only the extracted place name is ever sent to the map service.
 */

const PLACE_SUFFIX = '(?:chowk|chauk|hospital|university|college|school|market|bazaar|bazar|mandi|mall|airport|station|' +
  'railway station|bus stand|road|marg|nagar|colony|enclave|vihar|gate|sector \\d+[a-z]?|mod|mode|square|circle|temple|gurudwara|mandir|masjid)';
// Facilities a caller typically names ("rajindra hospital", "apollo hospital").
const FACILITY = '(?:hospital|clinic|nursing home|medical college|university|college|school|mall|bus stand|railway station|airport|police station|thana|gurudwara|mandir|temple|chowk|market|bazaar|mandi)';
const STOP_WORDS = '(?:in|at|near|and|but|so|because|he|she|they|we|you|is|was|has|have|had|send|transfer|pay|call|please|mein|me|hai|tha|se|ke|ki|ka|aur|jaldi|abhi|turant)';
// Words that end a backward scan for "<place> ke paas" (events, people, verbs).
const HINGLISH_BOUNDARY = `(?:${STOP_WORDS.slice(3, -1)}|accident|hadsa|beta|beti|mera|meri|mere|tera|uska|hua|hui|ho|gaya|gayi|wala|wali)`;
// Words that cannot start a facility name.
const NOT_A_NAME = new Set(['the', 'a', 'an', 'my', 'your', 'his', 'her', 'their', 'our', 'this', 'that', 'to', 'in', 'at', 'near', 'from',
  'se', 'ke', 'ki', 'ka', 'mein', 'me', 'is', 'was', 'he', 'she', 'beta', 'beti', 'bete', 'son', 'daughter', 'admitted', 'admit', 'local',
  'nearby', 'some', 'any', 'big', 'government', 'private', 'accident', 'hua', 'hai', 'ko', 'aapka', 'aapki', 'aapke', 'mera', 'meri', 'mere',
  'and', 'aur', 'of', 'for', 'with', 'go', 'come', 'reached', 'bharti', 'gaya', 'gayi', 'wala', 'wali',
  // Hinglish "main" = "I" ("main police station se bol raha hoon").
  'main', 'hoon', 'hun', 'bol', 'raha', 'rahi', 'calling', 'speaking', 'officer']);
const GENERIC = new Set(['the hospital', 'hospital', 'my house', 'home', 'the market', 'market', 'office', 'the office', 'school', 'college',
  'university', 'police station', 'thana', 'bus stand', 'railway station', 'airport', 'chowk', 'mall', 'clinic']);

// Major Indian cities and towns, Roman and Devanagari spellings → canonical name.
const CITIES = {
  delhi: 'Delhi', 'new delhi': 'New Delhi', mumbai: 'Mumbai', bombay: 'Mumbai', kolkata: 'Kolkata', calcutta: 'Kolkata', chennai: 'Chennai',
  madras: 'Chennai', bengaluru: 'Bengaluru', bangalore: 'Bengaluru', hyderabad: 'Hyderabad', pune: 'Pune', ahmedabad: 'Ahmedabad',
  jaipur: 'Jaipur', lucknow: 'Lucknow', kanpur: 'Kanpur', nagpur: 'Nagpur', indore: 'Indore', bhopal: 'Bhopal', patna: 'Patna',
  surat: 'Surat', vadodara: 'Vadodara', baroda: 'Vadodara', rajkot: 'Rajkot', nashik: 'Nashik', agra: 'Agra', varanasi: 'Varanasi',
  banaras: 'Varanasi', meerut: 'Meerut', ghaziabad: 'Ghaziabad', noida: 'Noida', gurgaon: 'Gurugram', gurugram: 'Gurugram',
  faridabad: 'Faridabad', chandigarh: 'Chandigarh', mohali: 'Mohali', panchkula: 'Panchkula', patiala: 'Patiala', ludhiana: 'Ludhiana',
  amritsar: 'Amritsar', jalandhar: 'Jalandhar', bathinda: 'Bathinda', rajpura: 'Rajpura', sangrur: 'Sangrur', ambala: 'Ambala',
  karnal: 'Karnal', panipat: 'Panipat', rohtak: 'Rohtak', hisar: 'Hisar', dehradun: 'Dehradun', shimla: 'Shimla', jammu: 'Jammu',
  srinagar: 'Srinagar', allahabad: 'Prayagraj', prayagraj: 'Prayagraj', gorakhpur: 'Gorakhpur', aligarh: 'Aligarh', bareilly: 'Bareilly',
  ranchi: 'Ranchi', jamshedpur: 'Jamshedpur', dhanbad: 'Dhanbad', bhubaneswar: 'Bhubaneswar', cuttack: 'Cuttack', raipur: 'Raipur',
  guwahati: 'Guwahati', kochi: 'Kochi', cochin: 'Kochi', thiruvananthapuram: 'Thiruvananthapuram', trivandrum: 'Thiruvananthapuram',
  coimbatore: 'Coimbatore', madurai: 'Madurai', mysore: 'Mysuru', mysuru: 'Mysuru', mangalore: 'Mangaluru', visakhapatnam: 'Visakhapatnam',
  vizag: 'Visakhapatnam', vijayawada: 'Vijayawada', jodhpur: 'Jodhpur', udaipur: 'Udaipur', kota: 'Kota', ajmer: 'Ajmer', gwalior: 'Gwalior',
  jabalpur: 'Jabalpur', aurangabad: 'Aurangabad', thane: 'Thane', goa: 'Goa', panaji: 'Panaji',
  'दिल्ली': 'Delhi', 'मुंबई': 'Mumbai', 'कोलकाता': 'Kolkata', 'चेन्नई': 'Chennai', 'बेंगलुरु': 'Bengaluru', 'हैदराबाद': 'Hyderabad',
  'पुणे': 'Pune', 'अहमदाबाद': 'Ahmedabad', 'जयपुर': 'Jaipur', 'लखनऊ': 'Lucknow', 'कानपुर': 'Kanpur', 'नागपुर': 'Nagpur', 'इंदौर': 'Indore',
  'भोपाल': 'Bhopal', 'पटना': 'Patna', 'आगरा': 'Agra', 'वाराणसी': 'Varanasi', 'मेरठ': 'Meerut', 'नोएडा': 'Noida', 'गुड़गांव': 'Gurugram',
  'गुरुग्राम': 'Gurugram', 'चंडीगढ़': 'Chandigarh', 'मोहाली': 'Mohali', 'पटियाला': 'Patiala', 'लुधियाना': 'Ludhiana', 'अमृतसर': 'Amritsar',
  'जालंधर': 'Jalandhar', 'अंबाला': 'Ambala', 'देहरादून': 'Dehradun', 'शिमला': 'Shimla', 'प्रयागराज': 'Prayagraj', 'रांची': 'Ranchi',
  'रायपुर': 'Raipur',
};

function tidy(value) {
  return value.replace(/^(?:the|a|an)\s+/i, '').replace(/[\s,.;:!?]+$/g, '').replace(/\s+/g, ' ').trim();
}

function acceptable(place) {
  const lowered = place.toLowerCase();
  if (GENERIC.has(lowered)) return false;
  if (/^(?:my|your|his|her|their|our|some|this|that)\b/i.test(lowered)) return false;
  return lowered.length >= 4;
}

function editDistance(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i += 1) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const temp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = temp;
    }
  }
  return row[b.length];
}

/**
 * Speech recognition often mishears Indian place names ("Patiala" -> "padella",
 * "pradyala"). Returns the known city a single word most likely means, or null.
 */
export function fuzzyCity(word) {
  const w = (word || '').toLowerCase();
  if (w.length < 5 || !/^[a-z]+$/.test(w)) return null;
  let best = null;
  for (const [spelling, name] of Object.entries(CITIES)) {
    if (!/^[a-z]+$/.test(spelling) || spelling.length < 5 || spelling[0] !== w[0]) continue;
    const distance = editDistance(w, spelling);
    const allowed = Math.max(1, Math.floor(spelling.length * 0.45));
    if (distance <= allowed && (!best || distance < best.distance)) best = { name, raw: w, distance };
  }
  return best;
}

/** Finds a known city anywhere in the text (exact, then fuzzy): { name, raw } or null. */
export function findCity(text) {
  const lowered = ` ${text.toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ')} `;
  let best = null;
  for (const [spelling, name] of Object.entries(CITIES)) {
    const index = lowered.indexOf(` ${spelling} `);
    if (index >= 0 && (!best || spelling.length > best.raw.length)) best = { name, raw: spelling, index };
  }
  if (best) return best;
  // Only words right after "in/at/near/from" or before "se/mein" count as a misheard city.
  const slots = [...lowered.matchAll(/ (?:in|at|near|from) ([a-z]{5,})(?= )/g)].map(m => m[1])
    .concat([...lowered.matchAll(/ ([a-z]{5,}) (?:se|mein|me)(?= )/g)].map(m => m[1]));
  for (const word of slots) {
    const match = fuzzyCity(word);
    if (match && (!best || match.distance < best.distance)) best = match;
  }
  return best;
}

function withCity(place, city) {
  if (!city || place.toLowerCase().includes(city.raw) || place.toLowerCase().includes(city.name.toLowerCase())) return place;
  return `${place}, ${city.name}`;
}

/** Returns { text, confidence } or null. */
export function extractLocation(transcript) {
  if (!transcript) return null;
  const text = transcript.replace(/\s+/g, ' ').trim();
  const city = findCity(text);
  const candidates = [];

  // "near Anar Dana Chowk, Patiala" / "opposite Punjabi University in Patiala"
  const english = new RegExp(
    `\\b(?:near|at|opposite|in front of|behind|outside|next to)\\s+((?:[\\p{L}\\p{N}.'-]+\\s+){0,5}?${PLACE_SUFFIX})\\b` +
    `(?:\\s*,\\s*|\\s+in\\s+)?((?:[\\p{L}]{3,}\\s*){0,2})?`,
    'iu'
  );
  const englishMatch = text.match(english);
  if (englishMatch) {
    const place = tidy(englishMatch[1]);
    const after = tidy(englishMatch[2] || '');
    const cityOk = after && !new RegExp(`^${STOP_WORDS}\\b`, 'i').test(after);
    // Correct a misheard city after the landmark ("in padella" -> Patiala).
    const correctedAfter = cityOk ? (fuzzyCity(after.split(' ')[0])?.name || after) : '';
    candidates.push({ text: cityOk ? `${place}, ${correctedAfter}` : withCity(place, city), confidence: cityOk ? 0.82 : 0.74 });
  }

  // Romanised Hinglish: "anardana chowk ke paas", "punjabi university ke samne"
  const hinglish = new RegExp(
    `((?:[\\p{L}\\p{N}.'-]+\\s+){0,4}?[\\p{L}\\p{N}.'-]+)\\s+(?:ke|ki|ka)\\s+(?:paas|pass|samne|saamne|nazdeek|najdik|bahar|peeche|piche)\\b`,
    'iu'
  );
  const hinglishMatch = text.match(hinglish);
  if (hinglishMatch) {
    const words = tidy(hinglishMatch[1]).split(' ');
    const stop = new RegExp(`^${HINGLISH_BOUNDARY}$`, 'i');
    let start = words.length;
    while (start > 0 && !stop.test(words[start - 1]) && words.length - start < 4) start -= 1;
    const place = words.slice(start).join(' ');
    if (place) {
      candidates.push({ text: withCity(place, city), confidence: new RegExp(`${PLACE_SUFFIX}$`, 'i').test(place) ? 0.8 : 0.66 });
    }
  }

  // A named facility anywhere: "rajindra hospital mein admit hai", "apollo hospital delhi"
  const facilityPattern = new RegExp(`((?:[\\p{L}\\p{N}.'-]+\\s+){1,3})(${FACILITY})\\b`, 'giu');
  for (const match of text.matchAll(facilityPattern)) {
    const words = match[1].trim().split(' ');
    // Keep only the name words directly before the facility word.
    let start = words.length;
    while (start > 0 && !NOT_A_NAME.has(words[start - 1].toLowerCase())) start -= 1;
    const name = words.slice(start).join(' ');
    if (!name) continue;
    candidates.push({ text: withCity(`${name} ${match[2]}`, city), confidence: 0.78 });
    break;
  }

  // Devanagari: "चितकारा यूनिवर्सिटी के सामने"
  const hindi = text.match(/((?:[ऀ-ॿ]+\s+){0,3}[ऀ-ॿ]+)\s+(?:के|की|का)\s+(?:पास|सामने|नजदीक|नज़दीक|बाहर|पीछे)/u);
  if (hindi) candidates.push({ text: tidy(hindi[1]), confidence: 0.72 });

  // "sector 17 chandigarh"
  const sector = text.match(/\bsector\s+\d+[a-z]?(?:\s+[a-z]{3,20})?/i);
  if (sector) candidates.push({ text: withCity(tidy(sector[0]), city), confidence: 0.7 });

  // Only a city was mentioned: still useful for finding nearby help.
  if (city) candidates.push({ text: city.name, confidence: 0.6 });

  const best = candidates.filter(candidate => acceptable(candidate.text)).sort((a, b) => b.confidence - a.confidence)[0];
  return best || null;
}
