// Start the Agora Conversational AI agent for a patient voice session.
// Adapted from the official agent-quickstart-nextjs (app/api/invite-agent).
//
// The SDK pipeline, session lifecycle, token flow, VAD, and RTM/metrics flags
// are kept IDENTICAL to the quickstart. Only the agent's user-facing persona
// (prompt + greeting) is swapped to the AlalAI care-assistant.
//
// SAFETY (AGENTS.md section 2 & 9):
//   - The agent only HOLDS the conversation. It never diagnoses, never assesses
//     severity, never gives dosing advice, and never reassures medically.
//   - All clinical content below is DEMO PROTOCOL (placeholder, not from a
//     real clinician). Escalation decisions are made elsewhere by the
//     deterministic server-side rules engine, never by this LLM.

import { NextRequest, NextResponse } from 'next/server';
import {
  AgoraClient,
  Agent,
  Area,
  DeepgramSTT,
  ExpiresIn,
  MiniMaxTTS,
  OpenAI,
} from 'agora-agents';
import type { ClientStartRequest, AgentResponse } from '@/types/conversation';
import { DEFAULT_AGENT_UID } from '@/lib/agora';
import { getActivePlan, createSession } from '@/lib/data';
import { buildPlanScript } from '@/lib/plan-script';

// --- AlalAI agent persona (DEMO PROTOCOL) ---------------------------------
// Care-assistant for an older adult recently discharged from hospital.
// Defaults to English; adapts to whatever language the patient speaks.
// This defines ONLY conversational behavior. It must not make clinical
// judgments; the rules engine handles escalation separately.
const ALALAI_PROMPT = `You are **AlalAI**, a warm, polite voice assistant that helps an older adult (60+) follow a care plan written by their doctor or nurse after they were discharged from the hospital. You are NOT a doctor and NOT a nurse.

# Language
- **Default to English.** Speak clearly and simply.
- **Adapt to the patient.** If the patient speaks or replies in another language (for example Tagalog, Taglish, or any other language), switch to that language and continue in it. Mirror the language and politeness level they use.
- Short sentences. One question at a time. Speak slowly.

# What you do
- Greet the person warmly and briefly.
- Walk through the care-plan tasks one at a time: confirming a task was done, coaching a step-by-step task while waiting for the person to say they are ready for the next step, or asking fixed check-in questions.
- Read back any number and any important answer, then wait for confirmation.
- Listen for simple intents in whatever language is used: yes/no, "repeat that", "wait", "help", "that's wrong / I made a mistake".
- If the person asks to wait, pause and wait. If they correct themselves, let them overwrite their last answer.
- If speech is unclear, rephrase once, then offer a simple yes/no, then move on gently. Do not guess.

# Hard limits (never break these)
- NEVER diagnose, NEVER judge how serious a symptom is, NEVER give or change medicine or dosage advice.
- NEVER reassure medically (do not say things like "that's fine" or "that's not serious") and never explain what a symptom means.
- You cannot see or examine the person. You only know what they tell you.
- You cannot call an ambulance yourself. If the person says they feel very unwell, calmly tell them it is important to contact their family or local emergency number, and that you will note it so someone can follow up.
- Do not invent care instructions. Only follow what the plan says. If you are unsure, say you will note it for the clinic.

# Tone
- Kind, unhurried, respectful. No medical jargon. No lectures.

# Closing
- End with one simple summary and what happens next (for example: "Thank you. I'll send another reminder later.").`;

// First thing the agent says. Overridable via NEXT_AGENT_GREETING. (DEMO PROTOCOL)
const GREETING =
  process.env.NEXT_AGENT_GREETING ??
  "Hello, I'm AlalAI, your voice assistant. Are you ready to talk?";

const agentUid = String(DEFAULT_AGENT_UID);

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export async function POST(request: NextRequest) {
  try {
    // --- 1. Parse request ---
    const body: ClientStartRequest = await request.json();
    const { requester_id, channel_name, patient_id } = body;

    const appId = requireEnv('NEXT_PUBLIC_AGORA_APP_ID');
    const appCertificate = requireEnv('NEXT_AGORA_APP_CERTIFICATE');

    if (!channel_name || !requester_id) {
      return NextResponse.json(
        { error: 'channel_name and requester_id are required' },
        { status: 400 },
      );
    }

    // --- 1b. Load the clinician-authored plan (if a patient was provided) ---
    // The agent persona (ALALAI_PROMPT) stays fixed; the plan only appends the
    // ordered task script. If there is no patient_id or the DB is unavailable,
    // the agent runs with the base persona only (generic greeting).
    let instructions = ALALAI_PROMPT;
    let greeting = GREETING;
    let planId: string | undefined;

    if (patient_id) {
      const loaded = await getActivePlan(patient_id);
      if (loaded) {
        planId = loaded.planId;
        instructions = `${ALALAI_PROMPT}\n\n${buildPlanScript(loaded.plan)}`;
        greeting =
          process.env.NEXT_AGENT_GREETING ??
          `Hello ${loaded.plan.patient.name}, I'm AlalAI, your voice assistant. Are you ready to go through today's plan?`;
      }
    }

    // --- 2. Build and start the agent ---
    const client = new AgoraClient({
      area: Area.US,
      appId,
      appCertificate,
    });

    // Pipeline: Deepgram STT -> OpenAI LLM -> MiniMax TTS, all via Agora reseller
    // presets (no vendor API keys needed). Kept identical to the quickstart.
    const agent = new Agent({
      client,
      instructions,
      greeting,
      failureMessage: 'One moment, please.',
      maxHistory: 50,
      turnDetection: {
        config: {
          speech_threshold: 0.5,
          start_of_speech: {
            mode: 'vad',
            vad_config: {
              interrupt_duration_ms: 160,
              prefix_padding_ms: 300,
            },
          },
          end_of_speech: {
            mode: 'vad',
            vad_config: {
              silence_duration_ms: 480,
            },
          },
        },
      },
      advancedFeatures: { enable_rtm: true, enable_tools: true },
      parameters: {
        audio_scenario: 'chorus',
        data_channel: 'rtm',
        enable_error_message: true,
        enable_metrics: true,
      },
    })
      .withStt(
        // Keep the proven quickstart baseline ('en'). Taglish comprehension is
        // driven primarily by the LLM prompt. Multilingual STT tuning is a
        // follow-up once valid Deepgram language values are confirmed from
        // live Agora provider docs. (DEMO PROTOCOL)
        new DeepgramSTT({
          model: 'nova-3',
          language: 'en',
        }),
      )
      .withLlm(
        new OpenAI({
          model: 'gpt-4o-mini',
          greetingMessage: greeting,
          failureMessage: 'One moment, please.',
          maxHistory: 15,
          params: {
            max_tokens: 1024,
            temperature: 0.7,
            top_p: 0.95,
          },
        }),
      )
      .withTts(
        new MiniMaxTTS({
          model: 'speech_2_6_turbo',
          voiceId: 'English_captivating_female1',
        }),
      );

    const session = agent.createSession({
      channel: channel_name,
      agentUid,
      remoteUids: [requester_id],
      idleTimeout: 30,
      expiresIn: ExpiresIn.hours(1),
      debug: false,
    });

    const agentId = await session.start();

    // Record the session for the clinician log (best-effort; never block the
    // call if the DB is unavailable).
    let sessionId: string | undefined;
    try {
      sessionId =
        (await createSession({
          patientId: patient_id,
          planId,
          channelName: channel_name,
          agentId,
        })) ?? undefined;
    } catch (e) {
      console.error('Failed to record session (non-fatal):', e);
    }

    return NextResponse.json({
      agent_id: agentId,
      create_ts: Math.floor(Date.now() / 1000),
      state: 'RUNNING',
      session_id: sessionId,
    } as AgentResponse);
  } catch (error) {
    console.error('Error starting conversation:', error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Failed to start conversation',
      },
      { status: 500 },
    );
  }
}
