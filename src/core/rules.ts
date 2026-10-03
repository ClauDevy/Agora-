// AlalAI deterministic rules engine.
//
// SAFETY (AGENTS.md section 2 & 10):
//   - This is the ONLY place escalation levels are decided.
//   - Pure functions: no network, no clock, no randomness, no LLM calls.
//   - `unclear`/invalid answers NEVER match a clinical rule (rule 5).
//   - Fail toward alerting: ambiguity escalates rather than staying silent (rule 11).
//
// Input:  plan rules + already-validated answers.
// Output: a Decision (highest level + the reasons that produced it).

import type {
  Answers,
  AnswerValue,
  Condition,
  Decision,
  Level,
  NoResponseConfig,
  Reason,
  Rule,
  Unclear,
  YesNoValue,
} from "./types";
import { UNCLEAR } from "./types";

/** Highest of two levels. */
function maxLevel(a: Level, b: Level): Level {
  return (a >= b ? a : b) as Level;
}

function isUnclear(v: AnswerValue | undefined): v is Unclear {
  return v === UNCLEAR;
}

function isNumber(v: AnswerValue | undefined): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function isYesNo(v: AnswerValue | undefined): v is YesNoValue {
  return v === "yes" || v === "no";
}

/**
 * Evaluate a single condition against the answers.
 *
 * Returns false (does NOT match) whenever the answer is missing, `unclear`, or
 * the wrong shape for the operator. This is the hard guarantee that invalid or
 * unclear extractor output can never trip a clinical rule.
 */
export function evaluateCondition(cond: Condition, answers: Answers): boolean {
  const actual = answers[cond.key];

  // Missing or unclear answers never match. Never guess (AGENTS.md rule 6).
  if (actual === undefined || isUnclear(actual)) return false;

  switch (cond.op) {
    case "==":
      // Equality is defined for both yes_no and number.
      if (isYesNo(cond.value)) {
        return isYesNo(actual) && actual === cond.value;
      }
      return isNumber(actual) && isNumber(cond.value) && actual === cond.value;

    case ">=":
    case "<=":
    case ">":
    case "<": {
      // Ordering only makes sense for numbers. A yes_no answer or a non-numeric
      // threshold means the condition cannot be satisfied -> no match.
      if (!isNumber(actual) || !isNumber(cond.value)) return false;
      switch (cond.op) {
        case ">=":
          return actual >= cond.value;
        case "<=":
          return actual <= cond.value;
        case ">":
          return actual > cond.value;
        case "<":
          return actual < cond.value;
      }
    }
  }

  // Unknown operator: fail closed (no match). Validation should prevent this.
  return false;
}

/** A rule matches when ALL its conditions hold (logical AND). */
export function ruleMatches(rule: Rule, answers: Answers): boolean {
  // An empty condition list would match everything; treat as non-matching to
  // avoid an accidental always-on escalation. Plan validation also rejects it.
  if (rule.conditions.length === 0) return false;
  return rule.conditions.every((c) => evaluateCondition(c, answers));
}

function describeCondition(c: Condition): string {
  return `${c.key} ${c.op} ${String(c.value)}`;
}

function describeRule(rule: Rule): string {
  return rule.conditions.map(describeCondition).join(" AND ");
}

/**
 * Evaluate all clinical rules against the validated answers.
 *
 * The resulting Decision.level is the HIGHEST level among matching rules.
 * Every matching rule contributes a Reason for logging/the demo. If nothing
 * matches, the result is Level 1 (note) with no reasons.
 */
export function evaluateRules(rules: Rule[], answers: Answers): Decision {
  const reasons: Reason[] = [];
  let level: Level = 1;

  for (const rule of rules) {
    if (ruleMatches(rule, answers)) {
      level = maxLevel(level, rule.then);
      reasons.push({
        level: rule.then,
        rule,
        source: "rule",
        detail: `Rule matched: ${describeRule(rule)} -> level ${rule.then}`,
      });
    }
  }

  return { level, reasons };
}

/**
 * Decision for the no-response rule (AGENTS.md section 8).
 *
 * Call this only once reminders have actually been exhausted (the scheduler
 * owns the retry/gap timing; the engine stays clockless). `attemptsMade` is the
 * number of reminders already sent.
 */
export function evaluateNoResponse(
  config: NoResponseConfig,
  attemptsMade: number
): Decision {
  if (attemptsMade >= config.retries) {
    return {
      level: config.then,
      reasons: [
        {
          level: config.then,
          source: "no_response",
          detail: `No response after ${attemptsMade} reminder(s) -> level ${config.then}`,
        },
      ],
    };
  }
  // Retries remain: no escalation yet.
  return { level: 1, reasons: [] };
}

/**
 * Decision for the uncertainty rule (AGENTS.md section 2 rule 6, section 8).
 *
 * When the same answer has been misheard twice (two strikes), or the patient
 * sounds confused, escalate to contact (Level 2) rather than guessing.
 */
export function evaluateUncertainty(
  strikes: number,
  options: { strikeThreshold?: number; level?: Level } = {}
): Decision {
  const threshold = options.strikeThreshold ?? 2;
  const level = options.level ?? 2;
  if (strikes >= threshold) {
    return {
      level,
      reasons: [
        {
          level,
          source: "uncertainty",
          detail: `Uncertainty rule: ${strikes} unclear attempt(s) -> level ${level}`,
        },
      ],
    };
  }
  return { level: 1, reasons: [] };
}

/** Merge several decisions into one, taking the highest level and all reasons. */
export function mergeDecisions(...decisions: Decision[]): Decision {
  let level: Level = 1;
  const reasons: Reason[] = [];
  for (const d of decisions) {
    level = maxLevel(level, d.level);
    reasons.push(...d.reasons);
  }
  return { level, reasons };
}
