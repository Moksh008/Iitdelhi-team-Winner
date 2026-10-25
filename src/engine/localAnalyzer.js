/**
 * Satark on-device scam rules.
 *
 * Deterministic and fully local: transcripts never leave the device. The same
 * lexicon (shared/scam-lexicon.json) and algorithm are implemented in
 * android/app/src/main/java/in/satark/shield/SatarkRules.kt; both are checked
 * against shared/scam-rule-vectors.json so they cannot drift apart.
 *
 * Matching: lower-case, NFC-normalise, replace every non letter/mark/number
 * character with a space, then look for each term as a run of whole words.
 * A trailing "*" on a term's last word matches any word with that prefix.
 */
import lexicon from '../../shared/scam-lexicon.json' with { type: 'json' };

const NON_WORD = /[^\p{L}\p{M}\p{N}]+/gu;

export function normalizeWords(text) {
  return (text || '').toLowerCase().normalize('NFC').replace(NON_WORD, ' ').trim().split(' ').filter(Boolean);
}

function compileTerm(term) {
  const words = normalizeWords(term.replace(/\*$/, ''));
  return { term, words, prefix: term.endsWith('*') };
}

const CLUSTERS = Object.fromEntries(
  Object.entries(lexicon.clusters).map(([name, cluster]) => [name, { ...cluster, compiled: cluster.terms.map(compileTerm) }])
);

function matchesAt(words, index, compiled) {
  const { words: termWords, prefix } = compiled;
  if (termWords.length === 0 || index + termWords.length > words.length) return false;
  for (let k = 0; k < termWords.length; k += 1) {
    const isLast = k === termWords.length - 1;
    const word = words[index + k];
    if (isLast && prefix ? !word.startsWith(termWords[k]) : word !== termWords[k]) return false;
  }
  return true;
}

/** Returns { CLUSTER: [matched terms...] } for one piece of text. */
export function matchClusters(text) {
  const words = normalizeWords(text);
  const found = {};
  for (const [name, cluster] of Object.entries(CLUSTERS)) {
    for (const compiled of cluster.compiled) {
      for (let i = 0; i < words.length; i += 1) {
        if (matchesAt(words, i, compiled)) {
          (found[name] ||= []).push(compiled.term);
          break;
        }
      }
    }
  }
  return found;
}

/** Scores a set of cluster names using the shared combination rules. */
export function scoreClusters(clusterNames) {
  const present = new Set(clusterNames);
  let best = { score: 0, category: null, rule: null };
  for (const rule of lexicon.rules) {
    const allOk = rule.all.every(name => present.has(name));
    const anyOk = !rule.any || rule.any.some(name => present.has(name));
    if (allOk && anyOk && rule.score > best.score) {
      best = { score: rule.score, category: rule.id, rule };
    }
  }
  if (!best.rule) {
    for (const name of present) {
      const solo = CLUSTERS[name]?.solo ?? 0;
      if (solo > best.score) best = { score: solo, category: solo >= lexicon.nudge_threshold ? 'advisory' : null, rule: null };
    }
  }
  return best;
}

function round3(value) {
  return Math.round(value * 1000) / 1000;
}

/**
 * Tracks one call/session. Cues expire after lexicon.session_window_seconds so
 * an old remark does not combine with something said much later.
 */
export class LocalScamSession {
  constructor(now = () => Date.now()) {
    this.now = now;
    this.reset();
  }

  reset() {
    this.cues = new Map(); // cluster -> { terms:Set, lastSeen:number }
    this.peakScore = 0;
  }

  ingest(text) {
    const at = this.now();
    const matched = matchClusters(text);
    for (const [name, terms] of Object.entries(matched)) {
      const entry = this.cues.get(name) || { terms: new Set(), lastSeen: at };
      terms.forEach(term => entry.terms.add(term));
      entry.lastSeen = at;
      this.cues.set(name, entry);
    }
    const windowMs = lexicon.session_window_seconds * 1000;
    for (const [name, entry] of this.cues) {
      if (at - entry.lastSeen > windowMs) this.cues.delete(name);
    }
    const chunk = scoreClusters(Object.keys(matched));
    const session = scoreClusters([...this.cues.keys()]);
    this.peakScore = Math.max(this.peakScore, session.score);
    return buildResult(session, chunk, this.cues);
  }

  get conversationScore() {
    return scoreClusters([...this.cues.keys()]).score;
  }
}

function buildResult(session, chunk, cues) {
  const tier = session.score >= lexicon.nudge_threshold ? 1 : 0;
  const category = session.category || null;
  const info = category ? lexicon.categories[category] : null;
  const indicators = [...cues.entries()].map(([name, entry]) => ({
    cluster: name,
    label: CLUSTERS[name].label,
    terms: [...entry.terms].slice(0, 4),
  }));
  return {
    // Conversation signal only. A conversation alone can raise at most a Tier 1
    // advisory; Tier 2 needs an independent payment signal (see decisionEngine).
    action_tier: tier,
    risk_level: tier ? (session.score >= 0.85 ? 'high' : 'caution') : (indicators.length ? 'low' : 'insufficient_evidence'),
    conversation_score: round3(session.score),
    chunk_score: round3(chunk.score),
    category,
    title: info?.title || null,
    advice: info?.advice || null,
    indicators,
    evidence_indicators: indicators.map(item => item.label),
    // Used only to decide whether the optional on-device LLM may be asked for a second opinion.
    ambiguous: tier === 0 && indicators.length > 0,
  };
}

/** One-shot analysis of a standalone text (e.g. a pasted message). */
export function analyzeText(text) {
  return new LocalScamSession().ingest(text);
}

/** The words around the last place a term was said, e.g. "…please share the otp you just…". */
function contextOf(words, compiled, span = 5) {
  for (let i = words.length - 1; i >= 0; i -= 1) {
    if (!matchesAt(words, i, compiled)) continue;
    const start = Math.max(0, i - span);
    const end = Math.min(words.length, i + compiled.words.length + span);
    return `${start > 0 ? '…' : ''}${words.slice(start, end).join(' ')}${end < words.length ? '…' : ''}`;
  }
  return '';
}

/**
 * Critical cues: clusters strong enough to raise an alert on their own
 * (e.g. OTP/PIN, "safe account", AnyDesk). Returns [{ cluster, label, terms, context }].
 */
export function findCriticalCues(text) {
  const words = normalizeWords(text);
  return Object.entries(matchClusters(text))
    .filter(([name]) => (CLUSTERS[name]?.solo ?? 0) >= lexicon.nudge_threshold)
    .map(([name, terms]) => {
      const compiled = CLUSTERS[name].compiled.find(item => item.term === terms[0]);
      return { cluster: name, label: CLUSTERS[name].label, terms: terms.slice(0, 4), context: contextOf(words, compiled) };
    });
}

/**
 * The statement that most likely triggered a warning: the sentence (or line)
 * with the strongest scam signs. Returns '' when no sentence has any.
 */
export function findTriggerStatement(text) {
  let best = { score: 0, sentence: '' };
  for (const raw of (text || '').split(/[\n.!?।]+/)) {
    const sentence = raw.trim();
    if (!sentence) continue;
    const clusters = Object.keys(matchClusters(sentence));
    const score = scoreClusters(clusters).score + clusters.length * 0.01;
    if (score > best.score) best = { score, sentence };
  }
  return best.sentence.length > 200 ? `${best.sentence.slice(0, 197)}…` : best.sentence;
}

export const NUDGE_THRESHOLD = lexicon.nudge_threshold;
export const CATEGORY_INFO = lexicon.categories;
