// Lucene query sanitizer for the kag_search full-text index (plan §4.2, §8).
//
// Raw user text must NEVER reach db.index.fulltext.queryNodes unescaped. A stray
// `"` or `~` is a Lucene parse error that takes out the entire route — and since the
// text is user-controlled, it is an injection surface into the query language, not
// merely a correctness bug. Cypher parameterization does not help here: the string
// IS the Lucene query, so escaping has to happen before it becomes a parameter.

/**
 * Lucene query-syntax special characters. `&&` and `||` are handled as characters
 * (`&` and `|`) rather than as pairs — escaping each character individually is
 * equivalent and avoids ordering bugs when they appear unpaired.
 */
const LUCENE_SPECIAL = /[+\-&|!(){}[\]^"~*?:\\/]/g;

/** Escape every Lucene special character in a single term. */
export function escapeLuceneTerm(term: string): string {
  return term.replace(LUCENE_SPECIAL, ch => `\\${ch}`);
}

/**
 * Words carrying no routing signal. Dropping them keeps the OR-query from matching
 * every node in the graph via filler — "show me the revenue" should seed on
 * "revenue", not on "show".
 */
const STOPWORDS = new Set([
  'show', 'me', 'my', 'the', 'a', 'an', 'and', 'or', 'of', 'for', 'to', 'in', 'on',
  'by', 'with', 'what', 'whats', 'which', 'how', 'is', 'are', 'was', 'were', 'do',
  'does', 'did', 'give', 'get', 'display', 'view', 'see', 'want', 'need', 'please',
  'can', 'you', 'i', 'we', 'us', 'this', 'that', 'these', 'those', 'it', 'its',
  'from', 'over', 'across', 'per', 'all', 'any', 'top', 'last', 'now',
]);

/** Terms shorter than this carry no signal and blow up fuzzy matching. */
const MIN_TERM_LENGTH = 2;

export interface LuceneQueryOptions {
  /** Edit distance for fuzzy matching. 0 disables fuzziness. Default 1. */
  fuzziness?: number;
  /** Cap on terms to keep the query bounded regardless of input length. */
  maxTerms?: number;
}

/**
 * Build a safe Lucene OR-query from free user text.
 *
 * Returns an empty string when nothing usable survives — callers MUST treat that as
 * "no seeds" and fall back, rather than sending an empty query to Lucene.
 *
 *   buildLuceneQuery('Show me churn by territory!')
 *     → 'churn~1 OR territory~1'
 *
 * Fuzziness is applied only to terms of 4+ characters: `~1` on a 3-letter word
 * matches almost anything, which produces confident-looking noise.
 */
export function buildLuceneQuery(raw: string, opts: LuceneQueryOptions = {}): string {
  const fuzziness = opts.fuzziness ?? 1;
  const maxTerms = opts.maxTerms ?? 12;

  const terms = (raw ?? '')
    .toLowerCase()
    // Split on anything that is not a letter, digit or underscore. Underscores are
    // kept so a user pasting `take_rate_pct` still matches the column node.
    .split(/[^a-z0-9_]+/)
    .filter(t => t.length >= MIN_TERM_LENGTH && !STOPWORDS.has(t))
    .slice(0, maxTerms);

  if (terms.length === 0) return '';

  const deduped = [...new Set(terms)];

  return deduped
    .map(t => {
      const escaped = escapeLuceneTerm(t);
      // Fuzzy only helps on words long enough for an edit to be meaningful, and
      // Lucene rejects `~n` on a term ending in an escaped character.
      return fuzziness > 0 && t.length >= 4 ? `${escaped}~${fuzziness}` : escaped;
    })
    .join(' OR ');
}
