import { describe, it, expect } from "vitest";
import {
  validateAnswer,
  validateAnswers,
  isUnclearValue,
} from "./validate-answer";
import { UNCLEAR } from "./types";

describe("validateAnswer — yes_no", () => {
  it("accepts canonical 'yes' and 'no'", () => {
    expect(validateAnswer("yes_no", "yes")).toBe("yes");
    expect(validateAnswer("yes_no", "no")).toBe("no");
  });

  it("maps booleans to yes/no", () => {
    expect(validateAnswer("yes_no", true)).toBe("yes");
    expect(validateAnswer("yes_no", false)).toBe("no");
  });

  it("treats anything else as unclear (never guesses)", () => {
    expect(validateAnswer("yes_no", "Yes")).toBe(UNCLEAR);
    expect(validateAnswer("yes_no", "oo")).toBe(UNCLEAR);
    expect(validateAnswer("yes_no", "maybe")).toBe(UNCLEAR);
    expect(validateAnswer("yes_no", 1)).toBe(UNCLEAR);
    expect(validateAnswer("yes_no", null)).toBe(UNCLEAR);
    expect(validateAnswer("yes_no", undefined)).toBe(UNCLEAR);
  });
});

describe("validateAnswer — number", () => {
  it("accepts finite numbers including 0", () => {
    expect(validateAnswer("number", 0)).toBe(0);
    expect(validateAnswer("number", 8)).toBe(8);
    expect(validateAnswer("number", 3.5)).toBe(3.5);
  });

  it("rejects non-finite and non-number inputs as unclear", () => {
    expect(validateAnswer("number", NaN)).toBe(UNCLEAR);
    expect(validateAnswer("number", Infinity)).toBe(UNCLEAR);
    expect(validateAnswer("number", "8")).toBe(UNCLEAR); // strings not coerced
    expect(validateAnswer("number", true)).toBe(UNCLEAR);
    expect(validateAnswer("number", null)).toBe(UNCLEAR);
  });
});

describe("validateAnswer — passthrough + unknown type", () => {
  it("passes an explicit unclear sentinel through", () => {
    expect(validateAnswer("yes_no", UNCLEAR)).toBe(UNCLEAR);
    expect(validateAnswer("number", UNCLEAR)).toBe(UNCLEAR);
  });
});

describe("validateAnswers — batch", () => {
  it("validates each field by its declared type and defaults missing to unclear", () => {
    const types = { odor: "yes_no", fever: "yes_no", pain: "number" } as const;
    const raw = { odor: "yes", fever: "nope", pain: "10" };
    const result = validateAnswers(types, raw);
    expect(result.odor).toBe("yes");
    expect(result.fever).toBe(UNCLEAR); // "nope" is not canonical
    expect(result.pain).toBe(UNCLEAR); // string not coerced
  });

  it("ignores keys not in the field spec", () => {
    const types = { odor: "yes_no" } as const;
    const raw = { odor: "no", injected: "yes" };
    const result = validateAnswers(types, raw);
    expect(result).toEqual({ odor: "no" });
    expect("injected" in result).toBe(false);
  });
});

describe("isUnclearValue", () => {
  it("detects the unclear sentinel", () => {
    expect(isUnclearValue(UNCLEAR)).toBe(true);
    expect(isUnclearValue("yes")).toBe(false);
    expect(isUnclearValue(0)).toBe(false);
  });
});
