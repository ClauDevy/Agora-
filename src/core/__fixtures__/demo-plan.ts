// DEMO PROTOCOL fixture — NOT clinical advice. Every threshold, warning sign,
// and timing here is placeholder data for tests and demos only (AGENTS.md
// section 2 rule 8, section 13). Uses fictional people and fake data.
//
// Mirrors the illustrative plan in AGENTS.md section 8.

import type { CarePlan } from "../types";

export const demoPlan: CarePlan = {
  patient: {
    name: "Lolo Ben", // DEMO PROTOCOL — fictional
    language: "tl-en",
    contacts: ["Ana (daughter)", "Barangay Health Worker"],
  },
  tasks: [
    {
      id: "t1",
      type: "confirm",
      time: "08:00",
      text: "gamot sa umaga", // DEMO PROTOCOL
    },
    {
      id: "t2",
      type: "coach",
      time: "09:00",
      steps: [
        "hugas ng kamay",
        "tanggalin ang lumang benda",
        "linisin",
        "ilagay ang bagong gasa",
      ], // DEMO PROTOCOL
      needs_helper: true,
    },
    {
      id: "t3",
      type: "checkin",
      time: "09:20",
      questions: [
        { key: "odor", ask: "May amoy po ba ang sugat?", type: "yes_no" },
        { key: "fever", ask: "May lagnat po ba kayo?", type: "yes_no" },
        { key: "pain", ask: "Gaano po kasakit, mula 0 hanggang 10?", type: "number" },
      ],
    },
  ],
  // DEMO PROTOCOL rules (section 8 illustrative set):
  //   odor == yes                 -> level 2
  //   fever == yes AND odor == yes -> level 3
  //   pain >= 8                   -> level 3
  rules: [
    { conditions: [{ key: "odor", op: "==", value: "yes" }], then: 2 },
    {
      conditions: [
        { key: "fever", op: "==", value: "yes" },
        { key: "odor", op: "==", value: "yes" },
      ],
      then: 3,
    },
    { conditions: [{ key: "pain", op: ">=", value: 8 }], then: 3 },
  ],
  no_response: { retries: 2, gap_minutes: 5, then: 2 }, // DEMO PROTOCOL
};
