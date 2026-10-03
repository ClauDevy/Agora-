// AlalAI domain model — the shared vocabulary for plans, answers, and escalation.
//
// SAFETY (AGENTS.md section 2): the rules engine that consumes these types is
// deterministic and server-side only. The LLM never produces a level; it only
// maps speech onto the fixed answer fields declared here, and its output is
// always validated before it reaches the engine.
//
// NOTE: every clinical value that uses these types (thresholds, warning signs,
// timings) is DEMO PROTOCOL unless a clinician supplied it.

// ---------------------------------------------------------------------------
// Answer types (a closed set — AGENTS.md section 8)
// ---------------------------------------------------------------------------

/** The declared type of a question's answer. Extend only with team agreement. */
export type AnswerType = "yes_no" | "number";

/** Sentinel the extractor returns when it cannot confidently map speech. */
export const UNCLEAR = "unclear" as const;
export type Unclear = typeof UNCLEAR;

/** A yes_no answer, once validated. */
export type YesNoValue = "yes" | "no";

/**
 * A validated answer value for a single field: either a concrete value of the
 * declared type, or `unclear`. The engine must treat `unclear` as never
 * matching a clinical rule (AGENTS.md section 2, rule 5).
 */
export type AnswerValue = YesNoValue | number | Unclear;

/** A map of question key -> validated answer value for one task run. */
export type Answers = Record<string, AnswerValue>;

// ---------------------------------------------------------------------------
// Care plan blocks (AGENTS.md section 8 — three reusable block types)
// ---------------------------------------------------------------------------

export type BlockType = "confirm" | "coach" | "checkin";

/** Ask whether a single task was done. Shown as "Reminder" in the UI. */
export interface ConfirmBlock {
  id: string;
  type: "confirm";
  time: string; // "HH:MM", 24h
  text: string; // DEMO PROTOCOL content, e.g. "gamot sa umaga"
  instructions?: string; // read to the patient as written
  precautions?: string; // read to the patient as written
}

/** Walk through steps one at a time. Shown as "Instructional" in the UI. */
export interface CoachBlock {
  id: string;
  type: "coach";
  time: string;
  steps: string[]; // DEMO PROTOCOL content
  needs_helper?: boolean;
  instructions?: string;
  precautions?: string;
}

/** A single question inside a check-in block. */
export interface CheckinQuestion {
  key: string; // stable field name used by rules, e.g. "odor"
  ask: string; // DEMO PROTOCOL spoken prompt
  type: AnswerType;
}

/** Ask a fixed set of questions and record the answers. */
export interface CheckinBlock {
  id: string;
  type: "checkin";
  time: string;
  questions: CheckinQuestion[];
}

export type Block = ConfirmBlock | CoachBlock | CheckinBlock;

// ---------------------------------------------------------------------------
// Rules (AGENTS.md section 8 — structured, never free text)
// ---------------------------------------------------------------------------

/** Escalation levels. 1 = note/log only, 2 = contact, 3 = urgent. */
export type Level = 1 | 2 | 3;

/** Comparison operators allowed in a rule condition. */
export type Operator = "==" | ">=" | "<=" | ">" | "<";

/**
 * A single atomic condition: compare a question's answer to a constant.
 * Built from dropdowns on the clinician side, never free text
 * (AGENTS.md section 2, rule 7).
 */
export interface Condition {
  key: string; // question key, e.g. "pain"
  op: Operator;
  value: YesNoValue | number;
}

/**
 * A rule: if ALL conditions hold (logical AND), assign `then` level.
 * The illustrative plan in AGENTS.md uses AND combinations such as
 * "fever == yes AND odor == yes".
 */
export interface Rule {
  conditions: Condition[];
  then: Level;
}

// ---------------------------------------------------------------------------
// No-response rule (AGENTS.md section 8 — the signature safety net)
// ---------------------------------------------------------------------------

export interface NoResponseConfig {
  retries: number; // how many reminder re-sends before escalating
  gap_minutes: number; // minutes between retries
  then: Level; // level to assign once retries are exhausted
}

// ---------------------------------------------------------------------------
// Plan
// ---------------------------------------------------------------------------

export interface PatientInfo {
  name: string;
  language: string; // e.g. "tl-en"
  contacts: string[];
  illnesses?: string; // professional-entered conditions the agent may reference
  generalInstructions?: string; // professional's free-text notes
}

export interface CarePlan {
  patient: PatientInfo;
  tasks: Block[];
  rules: Rule[];
  no_response: NoResponseConfig;
  descriptiveWarnings?: string; // free-text warning signs the agent watches for
}

// ---------------------------------------------------------------------------
// Engine output
// ---------------------------------------------------------------------------

/** A human-readable reason a level was assigned, for logging and the demo. */
export interface Reason {
  level: Level;
  rule?: Rule; // the clinical rule that matched (absent for no-response/uncertainty)
  source: "rule" | "no_response" | "uncertainty";
  detail: string;
}

/**
 * The engine's decision for one task run. `level` is the highest level any
 * reason reached; `reasons` explains every trigger. If nothing matched, level
 * is 1 (note) with an empty reasons list.
 */
export interface Decision {
  level: Level;
  reasons: Reason[];
}
