// AlalAI plan validation — reject malformed plans on save and before use.
//
// SAFETY (AGENTS.md section 10 & 14): plan accuracy is the biggest safety
// dependency, so a malformed plan must be rejected rather than run. This
// validator returns a flat list of human-readable errors; an empty list means
// the plan is structurally valid. It does NOT judge clinical correctness — a
// clinician confirms that separately.

import type {
  AnswerType,
  Block,
  CarePlan,
  CheckinBlock,
  CheckinQuestion,
  CoachBlock,
  Condition,
  ConfirmBlock,
  Operator,
  Rule,
} from "./types";

const ANSWER_TYPES: readonly AnswerType[] = ["yes_no", "number"];
const OPERATORS: readonly Operator[] = ["==", ">=", "<=", ">", "<"];
const LEVELS = [1, 2, 3];
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/; // "HH:MM" 24h

export interface PlanValidationResult {
  valid: boolean;
  errors: string[];
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function validateCondition(
  c: unknown,
  path: string,
  questionTypes: Map<string, AnswerType>,
  errors: string[]
): void {
  if (!isObject(c)) {
    errors.push(`${path}: condition must be an object`);
    return;
  }
  const cond = c as Partial<Condition>;

  if (!isNonEmptyString(cond.key)) {
    errors.push(`${path}: condition.key must be a non-empty string`);
  }
  if (!OPERATORS.includes(cond.op as Operator)) {
    errors.push(`${path}: condition.op must be one of ${OPERATORS.join(", ")}`);
  }

  const declaredType =
    isNonEmptyString(cond.key) ? questionTypes.get(cond.key) : undefined;

  // The key must reference a question that exists somewhere in the plan.
  if (isNonEmptyString(cond.key) && declaredType === undefined) {
    errors.push(
      `${path}: condition.key "${cond.key}" does not match any check-in question`
    );
  }

  // Value shape must be consistent with the operator and the question type.
  if (cond.op === "==") {
    if (declaredType === "yes_no") {
      if (cond.value !== "yes" && cond.value !== "no") {
        errors.push(`${path}: yes_no condition value must be "yes" or "no"`);
      }
    } else if (declaredType === "number") {
      if (typeof cond.value !== "number" || !Number.isFinite(cond.value)) {
        errors.push(`${path}: number condition value must be a finite number`);
      }
    }
  } else if (OPERATORS.includes(cond.op as Operator)) {
    // Ordering operators (>=, <=, >, <) only apply to numbers.
    if (declaredType === "yes_no") {
      errors.push(
        `${path}: operator "${cond.op}" cannot be used on yes_no question "${cond.key}"`
      );
    }
    if (typeof cond.value !== "number" || !Number.isFinite(cond.value)) {
      errors.push(`${path}: operator "${cond.op}" requires a finite number value`);
    }
  }
}

function validateRule(
  r: unknown,
  path: string,
  questionTypes: Map<string, AnswerType>,
  errors: string[]
): void {
  if (!isObject(r)) {
    errors.push(`${path}: rule must be an object`);
    return;
  }
  const rule = r as Partial<Rule>;

  if (!Array.isArray(rule.conditions) || rule.conditions.length === 0) {
    errors.push(`${path}: rule must have a non-empty conditions array`);
  } else {
    rule.conditions.forEach((c, i) =>
      validateCondition(c, `${path}.conditions[${i}]`, questionTypes, errors)
    );
  }

  if (!LEVELS.includes(rule.then as number)) {
    errors.push(`${path}: rule.then must be a level (1, 2, or 3)`);
  }
}

function validateQuestion(
  q: unknown,
  path: string,
  seenKeys: Set<string>,
  errors: string[]
): void {
  if (!isObject(q)) {
    errors.push(`${path}: question must be an object`);
    return;
  }
  const question = q as Partial<CheckinQuestion>;

  if (!isNonEmptyString(question.key)) {
    errors.push(`${path}: question.key must be a non-empty string`);
  } else if (seenKeys.has(question.key)) {
    errors.push(`${path}: duplicate question key "${question.key}"`);
  } else {
    seenKeys.add(question.key);
  }

  if (!isNonEmptyString(question.ask)) {
    errors.push(`${path}: question.ask must be a non-empty string`);
  }
  if (!ANSWER_TYPES.includes(question.type as AnswerType)) {
    errors.push(
      `${path}: question.type must be one of ${ANSWER_TYPES.join(", ")}`
    );
  }
}

function validateBlock(
  b: unknown,
  path: string,
  seenIds: Set<string>,
  questionKeys: Set<string>,
  errors: string[]
): void {
  if (!isObject(b)) {
    errors.push(`${path}: block must be an object`);
    return;
  }
  const block = b as Partial<Block>;

  if (!isNonEmptyString(block.id)) {
    errors.push(`${path}: block.id must be a non-empty string`);
  } else if (seenIds.has(block.id)) {
    errors.push(`${path}: duplicate block id "${block.id}"`);
  } else {
    seenIds.add(block.id);
  }

  if (!isNonEmptyString((block as { time?: unknown }).time as string)) {
    errors.push(`${path}: block.time must be a non-empty string`);
  } else if (!TIME_RE.test((block as { time: string }).time)) {
    errors.push(`${path}: block.time must be "HH:MM" 24-hour format`);
  }

  switch (block.type) {
    case "confirm": {
      const cb = block as Partial<ConfirmBlock>;
      if (!isNonEmptyString(cb.text)) {
        errors.push(`${path}: confirm block requires non-empty text`);
      }
      break;
    }
    case "coach": {
      const cb = block as Partial<CoachBlock>;
      if (!Array.isArray(cb.steps) || cb.steps.length === 0) {
        errors.push(`${path}: coach block requires a non-empty steps array`);
      } else if (!cb.steps.every(isNonEmptyString)) {
        errors.push(`${path}: coach block steps must all be non-empty strings`);
      }
      if (cb.needs_helper !== undefined && typeof cb.needs_helper !== "boolean") {
        errors.push(`${path}: coach block needs_helper must be a boolean`);
      }
      break;
    }
    case "checkin": {
      const cb = block as Partial<CheckinBlock>;
      if (!Array.isArray(cb.questions) || cb.questions.length === 0) {
        errors.push(`${path}: checkin block requires a non-empty questions array`);
      } else {
        cb.questions.forEach((q, i) => {
          validateQuestion(q, `${path}.questions[${i}]`, questionKeys, errors);
        });
      }
      break;
    }
    default:
      errors.push(
        `${path}: block.type must be "confirm", "coach", or "checkin"`
      );
  }
}

/**
 * Validate a care plan's structure. Returns { valid, errors }.
 * An empty errors array means the plan is structurally sound and safe to run.
 */
export function validatePlan(plan: unknown): PlanValidationResult {
  const errors: string[] = [];

  if (!isObject(plan)) {
    return { valid: false, errors: ["plan must be an object"] };
  }
  const p = plan as Partial<CarePlan>;

  // Patient
  if (!isObject(p.patient)) {
    errors.push("plan.patient must be an object");
  } else {
    if (!isNonEmptyString(p.patient.name)) {
      errors.push("plan.patient.name must be a non-empty string");
    }
    if (!isNonEmptyString(p.patient.language)) {
      errors.push("plan.patient.language must be a non-empty string");
    }
    if (
      !Array.isArray(p.patient.contacts) ||
      p.patient.contacts.length === 0 ||
      !p.patient.contacts.every(isNonEmptyString)
    ) {
      errors.push("plan.patient.contacts must be a non-empty array of strings");
    }
  }

  // Tasks (collect question keys first so rules can be checked against them)
  const seenIds = new Set<string>();
  const questionKeys = new Set<string>();
  const questionTypes = new Map<string, AnswerType>();

  if (!Array.isArray(p.tasks) || p.tasks.length === 0) {
    errors.push("plan.tasks must be a non-empty array");
  } else {
    // First pass: gather declared question keys + types for rule checking.
    p.tasks.forEach((b) => {
      if (isObject(b) && b.type === "checkin" && Array.isArray(b.questions)) {
        b.questions.forEach((q) => {
          if (isObject(q) && isNonEmptyString(q.key) && typeof q.type === "string") {
            if (ANSWER_TYPES.includes(q.type as AnswerType)) {
              questionTypes.set(q.key, q.type as AnswerType);
            }
          }
        });
      }
    });
    // Second pass: full structural validation.
    p.tasks.forEach((b, i) => {
      validateBlock(b, `plan.tasks[${i}]`, seenIds, questionKeys, errors);
    });
  }

  // Rules
  if (!Array.isArray(p.rules)) {
    errors.push("plan.rules must be an array");
  } else {
    p.rules.forEach((r, i) => {
      validateRule(r, `plan.rules[${i}]`, questionTypes, errors);
    });
  }

  // No-response config
  if (!isObject(p.no_response)) {
    errors.push("plan.no_response must be an object");
  } else {
    const nr = p.no_response;
    if (typeof nr.retries !== "number" || !Number.isInteger(nr.retries) || nr.retries < 0) {
      errors.push("plan.no_response.retries must be a non-negative integer");
    }
    if (typeof nr.gap_minutes !== "number" || !Number.isFinite(nr.gap_minutes) || nr.gap_minutes <= 0) {
      errors.push("plan.no_response.gap_minutes must be a positive number");
    }
    if (!LEVELS.includes(nr.then as number)) {
      errors.push("plan.no_response.then must be a level (1, 2, or 3)");
    }
  }

  return { valid: errors.length === 0, errors };
}
