// Build the agent's task script + grounding context from a professional-authored
// care plan. This turns the structured plan into plain instructions the voice
// agent follows AND a reference block it can answer questions from (schedule
// times, instructions, illnesses). It does NOT add clinical judgment —
// escalation stays with the deterministic rules engine.

import type { CarePlan, CheckinBlock, CoachBlock, ConfirmBlock } from '@/core/types';

export function buildPlanScript(plan: CarePlan): string {
  const lines: string[] = [];

  // --- Patient context the agent may reference when answering questions ---
  lines.push(`# About ${plan.patient.name}`);
  if (plan.patient.illnesses?.trim()) {
    lines.push(`Known conditions (from the professional): ${plan.patient.illnesses.trim()}`);
  }
  if (plan.patient.generalInstructions?.trim()) {
    lines.push(`General notes from the professional: ${plan.patient.generalInstructions.trim()}`);
  }

  // --- Full schedule reference (so the agent can answer "what time is X?") ---
  lines.push('');
  lines.push('# TODAY\'S SCHEDULE (you MAY answer questions about these times and details)');
  plan.tasks.forEach((task) => {
    const label =
      task.type === 'confirm'
        ? `Reminder: ${(task as ConfirmBlock).text}`
        : task.type === 'coach'
          ? 'Instructional task'
          : 'Check-in';
    lines.push(`- ${task.time} — ${label}`);
  });

  // --- Step-by-step script the agent runs WHEN EACH TASK'S TIME ARRIVES ---
  lines.push('');
  lines.push('# TASKS — run each ONLY when its time arrives (not before)');
  plan.tasks.forEach((task, i) => {
    const n = i + 1;
    switch (task.type) {
      case 'confirm': {
        const t = task as ConfirmBlock;
        lines.push(
          `${n}. [${t.time}] REMINDER — When it is ${t.time}, tell them it is time to: "${t.text}". Then ask whether they did it. Record yes or no.`,
        );
        const extra = t as ConfirmBlock & {
          instructions?: string;
          precautions?: string;
        };
        if (extra.instructions)
          lines.push(`   Instructions (read as written): ${extra.instructions}`);
        if (extra.precautions)
          lines.push(`   Precautions (read as written): ${extra.precautions}`);
        break;
      }
      case 'coach': {
        const t = task as CoachBlock;
        const steps = t.steps.map((s, j) => `   ${j + 1}) ${s}`).join('\n');
        lines.push(
          `${n}. [${t.time}] INSTRUCTIONAL — When it is ${t.time}, guide these steps ONE AT A TIME, waiting for the person to say they are ready before the next step:\n${steps}` +
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
          `${n}. [${t.time}] CHECK-IN — When it is ${t.time}, ask these fixed questions and record each answer. Read back any number and any important answer, then confirm:\n${qs}`,
        );
        break;
      }
    }
  });

  // --- Post-task check-in (how do you feel / pain / warning signs) ---
  lines.push('');
  lines.push('# AFTER EACH TASK — short check-in (one question at a time)');
  lines.push(
    'After the patient finishes a reminder or instructional task, gently ask how they feel, whether they have any pain, and whether they notice any of the warning signs. Ask ONE question at a time. ' +
      'If they report nothing concerning, say "Okay, let\'s wait for your next task," tell them the next task and time, and go back to standby. ' +
      'If they report pain or a warning sign, say you will note it for their professional (and offer to alert a contact). Do not judge how serious it is.',
  );

  // --- Descriptive warning signs (free text the professional wrote) ---
  if (plan.descriptiveWarnings?.trim()) {
    lines.push('');
    lines.push('# WARNING SIGNS TO WATCH FOR (from the professional)');
    lines.push(plan.descriptiveWarnings.trim());
    lines.push(
      'During the check-in, gently ask if the patient notices any of these. If the patient reports one, say you will note it for their professional and offer to alert a contact. Do NOT judge how serious it is.',
    );
  }

  // --- Q&A grounding (AGENTS.md section 11) ---
  lines.push('');
  lines.push('# ANSWERING QUESTIONS');
  lines.push(
    'You MAY answer the patient\'s questions using ONLY the schedule, instructions, notes, and conditions above. ' +
      'For example, if asked "what time is my medicine?", answer with the time from the schedule. ' +
      'If the answer is NOT in the information above, say you will ask their professional and that you have noted the question. Do NOT guess or give medical advice.',
  );
  lines.push(
    'NEXT TASK: If the patient asks what their next task is (or "what do I do next"), look at the CURRENT DATE & TIME provided and the schedule above. ' +
      'Tell them the next upcoming task and its time. ' +
      'If that task\'s scheduled time has NOT arrived yet, clearly say it is not time for that yet, and tell them what time it will be. ' +
      'For example: "Your next task is your evening medicine at 9 PM. It\'s not time for that yet — I\'ll remind you when it is." ' +
      'Only begin a task when its time has arrived or the professional/system says it is due.',
  );
  lines.push(
    'When finished with the tasks, give a short summary and say a reminder will follow. Do not judge any answer; just record it.',
  );
  return lines.join('\n');
}
