import { Item } from '@/store/types';
import { SYNONYM_GROUPS } from './searchSynonyms';

// Levenshtein edit distance
function editDistance(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = [];
  for (let i = 0; i <= m; i++) {
    dp[i] = [];
    for (let j = 0; j <= n; j++) {
      dp[i][j] = i === 0 ? j : j === 0 ? i : 0;
    }
  }
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

const words = (text: string) =>
  text.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/).filter(Boolean);

// Light plural folding so "couches" ↔ "couch" and "bikes" ↔ "bike".
function stem(w: string): string {
  if (w.length > 4 && /(ches|shes|sses|xes|zes)$/.test(w)) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
}

const stemPhrase = (text: string) => words(text).map(stem).join(' ');

// stemmed term → stemmed versions of the other terms in its group
const SYNONYM_INDEX: Map<string, string[]> = (() => {
  const index = new Map<string, string[]>();
  for (const group of SYNONYM_GROUPS) {
    const stemmed = group.map(stemPhrase);
    for (const term of stemmed) {
      index.set(term, stemmed.filter(t => t !== term));
    }
  }
  return index;
})();

const synonymsFor = (term: string) => SYNONYM_INDEX.get(stemPhrase(term)) ?? [];

// Whole-word/phrase match against a corpus prepared by stemmedCorpus().
const hasPhrase = (corpus: string, phrase: string) => corpus.includes(` ${phrase} `);

// Added when the title alone matches, so title hits outrank description-only hits.
const TITLE_BONUS = 200;

export function fuzzyScore(query: string, item: Item): number {
  const q = query.toLowerCase().trim();
  if (!q) return 1;

  const full = scoreText(q, `${item.title} ${item.description} ${item.restrictions ?? ''}`);
  if (full === 0) return 0;
  return scoreText(q, item.title) > 0 ? full + TITLE_BONUS : full;
}

function scoreText(q: string, text: string): number {
  const raw = text.toLowerCase();

  // Exact phrase match wins immediately
  if (raw.includes(q)) return 100;

  const corpus = ` ${words(raw).map(stem).join(' ')} `;

  // Whole query is a known term (including phrases like "love seat") → any synonym counts
  if (synonymsFor(q).some(s => hasPhrase(corpus, s))) return 90;

  const qTokens = words(q).filter(t => t.length > 1);
  const cTokens = words(raw);

  let totalScore = 0;
  let matchedTokens = 0;

  for (const qt of qTokens) {
    let best = 0;
    for (const ct of cTokens) {
      // ct.length >= 4 keeps short listing words ("a", "of") from matching inside the query word
      if (ct.includes(qt) || (ct.length >= 4 && qt.includes(ct))) {
        best = Math.max(best, 10);
      } else if (qt.length >= 6 && editDistance(qt, ct) <= 1) {
        // Allow 1 typo only for words 6+ chars (e.g. "opener" → "openers")
        best = Math.max(best, 4);
      } else if (qt.length >= 9 && editDistance(qt, ct) <= 2) {
        // Allow 2 typos only for long words (e.g. "bookshelf" → "bookshelve")
        best = Math.max(best, 4);
      }
    }
    // Synonyms match whole words only — no typo tolerance — to avoid drift
    if (best < 8 && synonymsFor(qt).some(s => hasPhrase(corpus, s))) {
      best = 8;
    }
    if (best > 0) matchedTokens++;
    totalScore += best;
  }

  // For multi-word queries every token must match — no partial hits
  if (qTokens.length > 1 && matchedTokens < qTokens.length) return 0;

  return totalScore;
}
