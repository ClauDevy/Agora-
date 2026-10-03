// Build the agent's task script from a clinician-authored care plan.
//
// This turns the structured plan (confirm/coach/checkin blocks) into plain,
// ordered instructions the conversational agent follows by voice. It does NOT
// add clinical judgment — it only tells the agent what to ask/confirm/coach, in
// order. Escalation stays with the deterministic rules engine.

import type { CarePlan, CheckinBlock, CoachBlock, ConfirmBlock } from '@/core/types';

export function buildPlanScript(plan: CarePlan): string {
  const lines: string[] = [];
  lines.push(`# Care plan for ${plan.patient.name} (follow in order)`);

  plan.tasks.forEach((task, i) => {
    const n = i + 1;
    switch (task.type) {
      case 'confirm': {
        const t = task as ConfirmBlock;
        lines.push(
          `${n}. CONFIRM: Ask whether this was done: "${t.text}". Record yes or no.`,
        );
        break;
      }
      case 'coach': {
        const t = task as CoachBlock;
        const steps = t.steps.map((s, j) => `   ${j + 1}) ${s}`).join('\n');
        lines.push(
          `${n}. COACH: Guide these steps ONE AT A TIME, waiting for the person to say they are ready before the next step:\n${steps}` +
            (t.needs_helper
              ? `\n   First ask if a helper is present before starting.`
              : ''),
        );
        break;
      }
      case 'checkin': {
        const t = task as CheckinBlock;
        const qs = t.questions
          .map(
            (q) =>
              `   - ${q.ask} (answer type: ${q.type === 'yes_no' ? 'yes/no' : 'a number'})`,
          )
          .join('\n');
        lines.push(
          `${n}. CHECK-IN: Ask these fixed questions and record each answer. Read back any number and any important answer, then confirm:\n${qs}`,
        );
        break;
      }
    }
  });

  lines.push(
    `When finished, give a short summary and say a reminder will follow. Do not judge any answer; just record it.`,
  );
  return lines.join('\n');
}
