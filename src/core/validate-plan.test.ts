import { describe, it, expect } from "vitest";
import { validatePlan } from "./validate-plan";
import { demoPlan } from "./__fixtures__/demo-plan";
import type { CarePlan } from "./types";

// Deep clone helper so each test can mutate a fresh copy.
function clone(): CarePlan {
  return JSON.parse(JSON.stringify(demoPlan));
}

describe("validatePlan — accepts the demo plan", () => {
  it("the DEMO PROTOCOL plan is structurally valid", () => {
    const result = validatePlan(demoPlan);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});

describe("validatePlan — rejects malformed plans", () => {
  it("rejects a non-object", () => {
    expect(validatePlan(null).valid).toBe(false);
    expect(validatePlan("plan").valid).toBe(false);
  });

  it("rejects empty patient contacts", () => {
    const p = clone();
    p.patient.contacts = [];
    const r = validatePlan(p);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes("contacts"))).toBe(true);
  });

  it("rejects empty tasks", () => {
    const p = clone();
    p.tasks = [];
    expect(validatePlan(p).valid).toBe(false);
  });

  it("rejects duplicate block ids", () => {
    const p = clone();
    p.tasks[1].id = p.tasks[0].id;
    const r = validatePlan(p);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes("duplicate block id"))).toBe(true);
  });

  it("rejects a bad time format", () => {
    const p = clone();
    p.tasks[0].time = "25:00";
    const r = validatePlan(p);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes("HH:MM"))).toBe(true);
  });

  it("rejects a confirm block with no text", () => {
    const p = clone();
    (p.tasks[0] as { text: string }).text = "";
    expect(validatePlan(p).valid).toBe(false);
  });

  it("rejects a coach block with empty steps", () => {
    const p = clone();
    (p.tasks[1] as { steps: string[] }).steps = [];
    expect(validatePlan(p).valid).toBe(false);
  });

  it("rejects a checkin with duplicate question keys", () => {
    const p = clone();
    const checkin = p.tasks[2] as { questions: { key: string }[] };
    checkin.questions[1].key = checkin.questions[0].key;
    const r = validatePlan(p);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes("duplicate question key"))).toBe(true);
  });

  it("rejects a rule referencing an unknown question key", () => {
    const p = clone();
    p.rules[0].conditions[0].key = "ghost";
    const r = validatePlan(p);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes("does not match any check-in question"))).toBe(true);
  });

  it("rejects an ordering operator on a yes_no question", () => {
    const p = clone();
    // odor is yes_no; using >= is invalid.
    p.rules[0].conditions[0] = { key: "odor", op: ">=", value: 1 };
    const r = validatePlan(p);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes("cannot be used on yes_no"))).toBe(true);
  });

  it("rejects an invalid level in a rule", () => {
    const p = clone();
    (p.rules[0] as { then: number }).then = 9;
    expect(validatePlan(p).valid).toBe(false);
  });

  it("rejects negative no_response retries", () => {
    const p = clone();
    p.no_response.retries = -1;
    expect(validatePlan(p).valid).toBe(false);
  });

  it("rejects non-positive gap_minutes", () => {
    const p = clone();
    p.no_response.gap_minutes = 0;
    expect(validatePlan(p).valid).toBe(false);
  });
});
