// AlalAI answer validation — the guard between the LLM extractor and the engine.
//
// SAFETY (AGENTS.md section 2, rules 4 & 5):
//   The extractor's ONLY job is to map messy speech onto a fixed answer field.
//   Its output is untrusted. This module forces every extractor result into
//   either a valid value of the DECLARED type, or `unclear`. It never guesses
//   and never widens the allowed set.

import type { AnswerType, AnswerValue, YesNoValue } from "./types";
import { UNCLEAR } from "./types";

/**
 * Validate a single raw extractor output against the declared field type.
 *
 * Returns a concrete value only when it is unambiguously valid for that type;
 * anything else (null, wrong type, out-of-range, junk string) becomes
 * `unclear`. Fail closed — do not coerce guesses.
 */
export function validateAnswer(
  type: AnswerType,
  raw: unknown
): AnswerValue {
  // An explicit unclear sentinel passes straight through.
  if (raw === UNCLEAR) return UNCLEAR;
  if (raw === null || raw === undefined) return UNCLEAR;

  switch (type) {
    case "yes_no":
      return validateYesNo(raw);
    case "number":
      return validateNumber(raw);
    default:
      // Unknown declared type: never guess.
      return UNCLEAR;
  }
}

function validateYesNo(raw: unknown): YesNoValue | typeof UNCLEAR {
  if (raw === "yes" || raw === "no") return raw;
  if (typeof raw === "boolean") return raw ? "yes" : "no";
  // Everything else (including "Yes", "oo", 1, "maybe") is unclear here.
  // Normalisation of natural speech is the extractor's job; by the time a value
  // reaches this guard it must already be the canonical token.
  return UNCLEAR;
}

function validateNumber(raw: unknown): number | typeof UNCLEAR {
  // Accept only real finite numbers. Reject NaN, Infinity, strings, booleans.
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  return UNCLEAR;
}

/**
 * Validate a batch of extractor outputs keyed by question key, given the
 * declared type for each key. Unknown keys and missing values become `unclear`.
 */
export function validateAnswers(
  fieldTypes: Record<string, AnswerType>,
  rawAnswers: Record<string, unknown>
): Record<string, AnswerValue> {
  const result: Record<string, AnswerValue> = {};
  for (const key of Object.keys(fieldTypes)) {
    result[key] = validateAnswer(fieldTypes[key], rawAnswers[key]);
  }
  return result;
}

/** True when a validated value is unclear (useful for the uncertainty rule). */
export function isUnclearValue(value: AnswerValue): boolean {
  return value === UNCLEAR;
}
