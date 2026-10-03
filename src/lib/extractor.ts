// Extractor: maps a messy spoken utterance onto a FIXED answer field.
//
// SAFETY (AGENTS.md section 2, rules 4 & 5): this is the ONLY AI-ish job in the
// pipeline, and it is kept behind a narrow interface. It returns a canonical
// token for the declared field type, or `unclear`. Its output is ALWAYS passed
// through validateAnswer before the rules engine sees it — the extractor never
// decides anything clinical and never guesses.
//
// The default implementation here is a DETERMINISTIC heuristic (no LLM, no
// network, no cost) so the pipeline works offline and is unit-testable. A real
// LLM extractor can implement the same `Extractor` interface later without
// changing any caller.

import type { AnswerType, AnswerValue } from '@/core/types';
import { UNCLEAR } from '@/core/types';
import { validateAnswer } from '@/core/validate-answer';

export interface FieldSpec {
  key: string;
  type: AnswerType;
}

export interface Extractor {
  /** Map an utterance to a validated AnswerValue for the given field. */
  extract(utterance: string, field: FieldSpec): Promise<AnswerValue>;
}

// --- Heuristic lexicons (multi-language, extend as needed) -----------------
// English + a few common Tagalog/Taglish affirmations/negations, since the
// agent may converse in those. This is intent mapping, NOT clinical logic.
const YES_WORDS = [
  'yes',
  'yeah',
  'yep',
  'yup',
  'sure',
  'correct',
  'affirmative',
  'oo',
  'opo',
  'oho',
  'tama',
  'okay',
  'ok',
];
const NO_WORDS = [
  'no',
  'nope',
  'nah',
  'negative',
  'hindi',
  'wala',
  'ayaw',
  'di',
];

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s.]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Spoken-number words 0-10 (English). Keeps the demo robust when ASR returns
// words instead of digits.
const NUMBER_WORDS: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

function extractYesNo(text: string): AnswerValue {
  const words = new Set(text.split(' '));
  const hasYes = YES_WORDS.some((w) => words.has(w));
  const hasNo = NO_WORDS.some((w) => words.has(w));
  // Ambiguous (both or neither) -> unclear. Never guess.
  if (hasYes && !hasNo) return 'yes';
  if (hasNo && !hasYes) return 'no';
  return UNCLEAR;
}

function extractNumber(text: string): AnswerValue {
  // Prefer an explicit digit first.
  const digit = text.match(/\b(\d{1,3})(?:\.\d+)?\b/);
  if (digit) {
    const n = Number(digit[1]);
    if (Number.isFinite(n)) return n;
  }
  // Fall back to a single spoken number word.
  for (const word of text.split(' ')) {
    if (word in NUMBER_WORDS) return NUMBER_WORDS[word];
  }
  return UNCLEAR;
}

/**
 * Default deterministic extractor. Parses the utterance heuristically, then
 * runs the result through validateAnswer so the output is guaranteed to be a
 * valid value of the declared type or `unclear`.
 */
export class HeuristicExtractor implements Extractor {
  async extract(utterance: string, field: FieldSpec): Promise<AnswerValue> {
    const text = normalize(utterance ?? '');
    if (!text) return UNCLEAR;

    let raw: AnswerValue;
    switch (field.type) {
      case 'yes_no':
        raw = extractYesNo(text);
        break;
      case 'number':
        raw = extractNumber(text);
        break;
      default:
        raw = UNCLEAR;
    }

    // Final guard: validate against the declared type (defense in depth).
    return validateAnswer(field.type, raw);
  }
}

/** The extractor used by the scoring route. Swap for an LLM impl later. */
export const defaultExtractor: Extractor = new HeuristicExtractor();
