// Server-side scoring route — the deterministic safety loop.
//
// POST /api/record-turn
//   body (either explicit field, or let the server match by the agent's question):
//     { session_id, utterance, question_key?, declared_type?, agent_question? }
//
// Pipeline (ALL server-side; AGENTS.md section 2 & 3):
//   1. Resolve which plan question this answers (explicit key, or match the
//      agent's spoken question text to the plan's check-in questions).
//   2. extractor: utterance -> canonical token or 'unclear' (validated)
//   3. saveAnswer: persist the validated answer for this session
//   4. load all answers for the session + the plan rules
//   5. evaluateRules (deterministic) + uncertainty rule
//   6. saveDecision: persist the level + reasons (audit log)
//   7. return the decision
//
// The browser NEVER decides a level. This route does, with plain code.

import { NextRequest, NextResponse } from 'next/server';
import type { AnswerType } from '@/core/types';
import { UNCLEAR } from '@/core/types';
import { evaluateRules, evaluateUncertainty, mergeDecisions } from '@/core/rules';
import { defaultExtractor } from '@/lib/extractor';
import {
  saveAnswer,
  saveDecision,
  getSessionAnswers,
  getSessionRules,
  getSessionQuestions,
  type SessionQuestion,
} from '@/lib/data';

interface RecordTurnRequest {
  session_id: string;
  utterance: string;
  question_key?: string;
  declared_type?: AnswerType;
  agent_question?: string;
}

// Normalize text for loose matching (lowercase, strip punctuation/extra space).
function norm(s: string): string {
  return (s ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Match the agent's spoken question to a plan question. Uses containment +
// a simple word-overlap score; returns the best match above a threshold.
function matchQuestion(
  agentQuestion: string,
  questions: SessionQuestion[],
): SessionQuestion | null {
  const a = norm(agentQuestion);
  if (!a) return null;

  let best: { q: SessionQuestion; score: number } | null = null;
  for (const q of questions) {
    const b = norm(q.ask);
    if (!b) continue;
    let score = 0;
    if (a.includes(b) || b.includes(a)) {
      score = 1; // strong: one contains the other
    } else {
      const aw = new Set(a.split(' '));
      const bw = b.split(' ').filter((w) => w.length > 2);
      const overlap = bw.filter((w) => aw.has(w)).length;
      score = bw.length ? overlap / bw.length : 0;
    }
    if (!best || score > best.score) best = { q, score };
  }
  // Require a reasonable overlap to avoid mis-attribution.
  return best && best.score >= 0.5 ? best.q : null;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as RecordTurnRequest;
    const { session_id, utterance } = body;

    if (!session_id || !utterance) {
      return NextResponse.json(
        { error: 'session_id and utterance are required' },
        { status: 400 },
      );
    }

    // 1. Resolve the question (explicit key wins; else match agent question text).
    let questionKey = body.question_key;
    let declaredType = body.declared_type;

    if (!questionKey || !declaredType) {
      if (!body.agent_question) {
        // Nothing to attribute this utterance to — ignore quietly (not every
        // patient turn answers a tracked question, e.g. small talk).
        return NextResponse.json({ matched: false, reason: 'no_question' });
      }
      const questions = await getSessionQuestions(session_id);
      const matched = matchQuestion(body.agent_question, questions);
      if (!matched) {
        return NextResponse.json({ matched: false, reason: 'no_match' });
      }
      questionKey = matched.key;
      declaredType = matched.type;
    }

    // 2. Extract + validate (never guesses; invalid -> unclear).
    const value = await defaultExtractor.extract(utterance, {
      key: questionKey,
      type: declaredType,
    });
    const isUnclear = value === UNCLEAR;

    // 3. Persist the validated answer.
    await saveAnswer({
      sessionId: session_id,
      questionKey,
      rawTranscript: utterance,
      value: String(value),
      validationResult: isUnclear ? 'unclear' : 'valid',
    });

    // 4. Load all answers so far + the plan's rules.
    const [answers, rules] = await Promise.all([
      getSessionAnswers(session_id),
      getSessionRules(session_id),
    ]);

    // 5. Deterministic evaluation. Count unclear answers for the uncertainty rule.
    const unclearCount = Object.values(answers).filter(
      (v) => v === UNCLEAR,
    ).length;
    const decision = mergeDecisions(
      evaluateRules(rules, answers),
      evaluateUncertainty(unclearCount),
    );

    // 6. Persist the decision (audit log).
    await saveDecision(session_id, decision);

    // 7. Return it.
    return NextResponse.json({
      matched: true,
      question_key: questionKey,
      value: String(value),
      unclear: isUnclear,
      decision,
    });
  } catch (error) {
    console.error('record-turn error:', error);
    // Fail toward alerting (AGENTS.md rule 11): report an error rather than
    // silently succeeding.
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Failed to record turn',
      },
      { status: 500 },
    );
  }
}
