import { describe, it, expect } from "vitest";
import {
  evaluateRules,
  evaluateCondition,
  ruleMatches,
  evaluateNoResponse,
  evaluateUncertainty,
  mergeDecisions,
} from "./rules";
import { UNCLEAR } from "./types";
import type { Answers, Rule } from "./types";
import { demoPlan } from "./__fixtures__/demo-plan";

const rules = demoPlan.rules;

describe("evaluateRules — each demo rule fires at the right level", () => {
  it("odor == yes fires Level 2", () => {
    const answers: Answers = { odor: "yes", fever: "no", pain: 2 };
    const d = evaluateRules(rules, answers);
    expect(d.level).toBe(2);
    expect(d.reasons.some((r) => r.source === "rule")).toBe(true);
  });

  it("fever == yes AND odor == yes fires Level 3", () => {
    const answers: Answers = { odor: "yes", fever: "yes", pain: 1 };
    const d = evaluateRules(rules, answers);
    expect(d.level).toBe(3);
  });

  it("pain >= 8 fires Level 3", () => {
    const answers: Answers = { odor: "no", fever: "no", pain: 9 };
    const d = evaluateRules(rules, answers);
    expect(d.level).toBe(3);
  });

  it("takes the HIGHEST matching level when several match", () => {
    // odor==yes (L2) and pain>=8 (L3) both match -> expect 3
    const answers: Answers = { odor: "yes", fever: "no", pain: 10 };
    const d = evaluateRules(rules, answers);
    expect(d.level).toBe(3);
    expect(d.reasons.length).toBe(2);
  });
});

describe("evaluateRules — rules do NOT fire when they shouldn't", () => {
  it("all-clear answers stay at Level 1 with no reasons", () => {
    const answers: Answers = { odor: "no", fever: "no", pain: 1 };
    const d = evaluateRules(rules, answers);
    expect(d.level).toBe(1);
    expect(d.reasons).toHaveLength(0);
  });

  it("fever alone (without odor) does NOT fire the Level 3 combo", () => {
    const answers: Answers = { odor: "no", fever: "yes", pain: 0 };
    const d = evaluateRules(rules, answers);
    // Neither odor==yes nor the combo nor pain>=8 match.
    expect(d.level).toBe(1);
  });
});

describe("boundary values for pain >= 8", () => {
  it("pain = 7 does NOT fire", () => {
    expect(evaluateRules(rules, { odor: "no", fever: "no", pain: 7 }).level).toBe(1);
  });
  it("pain = 8 fires Level 3", () => {
    expect(evaluateRules(rules, { odor: "no", fever: "no", pain: 8 }).level).toBe(3);
  });
  it("pain = 9 fires Level 3", () => {
    expect(evaluateRules(rules, { odor: "no", fever: "no", pain: 9 }).level).toBe(3);
  });
});

describe("unclear / invalid answers never trigger a clinical rule", () => {
  it("unclear odor does not fire the odor rule", () => {
    const answers: Answers = { odor: UNCLEAR, fever: "no", pain: 0 };
    expect(evaluateRules(rules, answers).level).toBe(1);
  });

  it("unclear pain does not fire pain >= 8", () => {
    const answers: Answers = { odor: "no", fever: "no", pain: UNCLEAR };
    expect(evaluateRules(rules, answers).level).toBe(1);
  });

  it("missing answers do not fire rules", () => {
    expect(evaluateRules(rules, {}).level).toBe(1);
  });

  it("evaluateCondition fails closed on wrong type", () => {
    // yes_no answer compared with an ordering operator cannot match.
    const cond = { key: "odor", op: ">=" as const, value: 1 };
    expect(evaluateCondition(cond, { odor: "yes" })).toBe(false);
  });
});

describe("ruleMatches edge cases", () => {
  it("empty condition list never matches", () => {
    const rule: Rule = { conditions: [], then: 3 };
    expect(ruleMatches(rule, { odor: "yes" })).toBe(false);
  });
});

describe("no-response rule", () => {
  const cfg = demoPlan.no_response; // retries: 2, then: 2

  it("does not escalate before retries are exhausted", () => {
    expect(evaluateNoResponse(cfg, 0).level).toBe(1);
    expect(evaluateNoResponse(cfg, 1).level).toBe(1);
  });

  it("fires Level 2 once retries are exhausted", () => {
    const d = evaluateNoResponse(cfg, 2);
    expect(d.level).toBe(2);
    expect(d.reasons[0].source).toBe("no_response");
  });
});

describe("uncertainty rule — two strikes then escalate", () => {
  it("one strike does not escalate", () => {
    expect(evaluateUncertainty(1).level).toBe(1);
  });
  it("two strikes escalate to Level 2 (never guess)", () => {
    const d = evaluateUncertainty(2);
    expect(d.level).toBe(2);
    expect(d.reasons[0].source).toBe("uncertainty");
  });
});

describe("mergeDecisions", () => {
  it("takes the highest level and keeps all reasons", () => {
    const a = evaluateRules(rules, { odor: "yes", fever: "no", pain: 0 }); // L2
    const b = evaluateNoResponse(demoPlan.no_response, 2); // L2
    const c = evaluateUncertainty(2); // L2
    const merged = mergeDecisions(a, b, c);
    expect(merged.level).toBe(2);
    expect(merged.reasons.length).toBe(a.reasons.length + b.reasons.length + c.reasons.length);
  });
});

describe("correction (mali) overwrites the previous answer before rules run", () => {
  it("corrected answer is the one the engine sees", () => {
    // Patient first says yes to odor, then corrects to no ("hindi pala").
    // The session layer overwrites the field; the engine only ever sees final.
    const beforeCorrection: Answers = { odor: "yes", fever: "no", pain: 0 };
    const afterCorrection: Answers = { ...beforeCorrection, odor: "no" };
    expect(evaluateRules(rules, beforeCorrection).level).toBe(2);
    expect(evaluateRules(rules, afterCorrection).level).toBe(1);
  });
});
