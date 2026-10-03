'use client';

// In-call voice session for the AlalAI patient client.
//
// Adapted from the official agent-quickstart-nextjs ConversationComponent.
// The RTC join, mic publish, AgoraVoiceAI init, and StrictMode guards are kept
// IDENTICAL to the quickstart. What is REMOVED (deliberately, per AGENTS.md
// Voice-First subtraction-test rules): the transcript rail, pipeline metrics,
// microphone selector, and the agent visualizer. The patient screen only shows
// session STATE and one big button to end. Voice carries everything.

import { useState, useEffect, useCallback, useRef } from 'react';
import AgoraRTC, {
  useRTCClient,
  useLocalMicrophoneTrack,
  useRemoteUsers,
  useClientEvent,
  useJoin,
  usePublish,
  RemoteUser,
  UID,
} from 'agora-rtc-react';
import {
  AgoraVoiceAI,
  AgoraVoiceAIEvents,
  AgentState,
  TranscriptHelperMode,
  TurnStatus,
  ChatMessageType,
  ChatMessagePriority,
  type TranscriptHelperItem,
  type UserTranscription,
  type AgentTranscription,
} from 'agora-agent-client-toolkit';
import type { RTMClient } from 'agora-rtm';
import { DEFAULT_AGENT_UID } from '@/lib/agora';
import type { AgoraTokenData } from '@/types/conversation';

type AgoraRtcWithParameters = typeof AgoraRTC & {
  setParameter?: (key: string, value: unknown) => void;
};

interface VoiceSessionProps {
  agoraData: AgoraTokenData;
  rtmClient: RTMClient;
  onEnd: () => void;
  schedule?: { time: string; label: string; type: string; blockKey?: string }[];
  patientId?: string;
}

// Patient-facing status, derived from agent + connection state.
type DisplayState = 'connecting' | 'listening' | 'speaking' | 'thinking';

export default function VoiceSession({
  agoraData,
  rtmClient,
  onEnd,
  schedule = [],
  patientId,
}: VoiceSessionProps) {
  const client = useRTCClient();
  const remoteUsers = useRemoteUsers();
  const agentUID = String(DEFAULT_AGENT_UID);
  const [, setJoinedUID] = useState<UID>(0);
  const [isAgentConnected, setIsAgentConnected] = useState(false);
  const [connectionState, setConnectionState] = useState<string>('CONNECTING');
  const [agentState, setAgentState] = useState<AgentState | null>(null);
  // Live device clock for the patient view (updates every second).
  const [clock, setClock] = useState<string>('');
  // True while a scheduled reminder is actively being delivered.
  const [reminding, setReminding] = useState(false);
  // Text of the current on-screen reminder banner (null = hidden).
  const [reminderBanner, setReminderBanner] = useState<string | null>(null);
  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setClock(
        d.toLocaleTimeString([], {
          hour: 'numeric',
          minute: '2-digit',
          second: '2-digit',
        }),
      );
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // Track which patient turns we've already scored (de-dupe) and the agent's
  // most recent question text, so each answer is attributed to the right field.
  const submittedTurns = useRef<Set<string | number>>(new Set());
  const sessionId = agoraData.sessionId;
  // Reference to the live AgoraVoiceAI instance (for proactive sendText reminders).
  const aiRef = useRef<InstanceType<typeof AgoraVoiceAI> | null>(null);
  // Per-task reminder state: attempts made, minute of last reminder, finished.
  const reminderState = useRef<
    Record<string, { attempts: number; lastMin: number; finished: boolean }>
  >({});

  // StrictMode guard (from quickstart): delay useJoin's ready flag past the
  // fake-unmount cycle so the channel is joined exactly once.
  const [isReady, setIsReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const id = setTimeout(() => {
      if (!cancelled) setIsReady(true);
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(id);
      setIsReady(false);
    };
  }, []);

  const { isConnected: joinSuccess } = useJoin(
    {
      appid: process.env.NEXT_PUBLIC_AGORA_APP_ID!,
      channel: agoraData.channel,
      token: agoraData.token,
      uid: parseInt(agoraData.uid, 10),
    },
    isReady,
  );

  // Create mic track only after the StrictMode fake-unmount cycle (quickstart note).
  const { localMicrophoneTrack } = useLocalMicrophoneTrack(isReady);

  // ENABLE_AUDIO_PTS must be set before publishing audio (quickstart note).
  useEffect(() => {
    if (!client) return;
    try {
      (AgoraRTC as AgoraRtcWithParameters).setParameter?.(
        'ENABLE_AUDIO_PTS',
        true,
      );
    } catch (error) {
      console.warn('Could not set ENABLE_AUDIO_PTS:', error);
    }
  }, [client]);

  useEffect(() => {
    if (joinSuccess && client) {
      const uid = client.uid;
      if (uid !== null && uid !== undefined) setJoinedUID(uid);
    }
  }, [joinSuccess, client]);

  // Initialize AgoraVoiceAI once joined. We only consume AGENT_STATE_CHANGED to
  // drive the on-screen status; transcript/metrics are intentionally not shown.
  useEffect(() => {
    if (!isReady || !joinSuccess) return;
    let cancelled = false;

    (async () => {
      try {
        const ai = await AgoraVoiceAI.init({
          rtcEngine: client,
          rtmEngine: rtmClient,
          renderMode: TranscriptHelperMode.TEXT,
          enableLog: false,
        });

        if (cancelled) {
          try {
            if (AgoraVoiceAI.getInstance() === ai) {
              ai.unsubscribe();
              ai.destroy();
            }
          } catch {}
          return;
        }

        ai.on(AgoraVoiceAIEvents.AGENT_STATE_CHANGED, (_, event) =>
          setAgentState(event.state),
        );
        aiRef.current = ai;

        // Capture completed turns and send patient answers to the server-side
        // scoring loop. TRANSCRIPT_UPDATED delivers the FULL history each time.
        // For each completed PATIENT turn we haven't submitted yet, find the
        // most recent completed AGENT turn before it (the question being
        // answered) and POST both to /api/record-turn. The server matches the
        // question to a plan field, extracts + validates, runs the rules, logs.
        ai.on(AgoraVoiceAIEvents.TRANSCRIPT_UPDATED, (transcript) => {
          if (!sessionId) return;
          const items = transcript as TranscriptHelperItem<
            Partial<UserTranscription | AgentTranscription>
          >[];

          const isComplete = (s: unknown) => s !== TurnStatus.IN_PROGRESS;
          // uid '0' is the toolkit's sentinel for local (patient) speech.
          const isPatient = (uid: string | number) =>
            String(uid) === '0' || String(uid) === agoraData.uid;
          const isAgent = (uid: string | number) =>
            String(uid) === agentUID;

          items.forEach((item, idx) => {
            const turnId = item.turn_id ?? idx;
            if (!isComplete(item.status)) return;
            if (!isPatient(item.uid)) return;
            if (submittedTurns.current.has(turnId)) return;
            const utterance =
              typeof item.text === 'string' ? item.text.trim() : '';
            if (!utterance) return;

            // Find the most recent completed agent turn before this one.
            let agentQuestion = '';
            for (let j = idx - 1; j >= 0; j--) {
              const prev = items[j];
              if (isAgent(prev.uid) && isComplete(prev.status)) {
                agentQuestion =
                  typeof prev.text === 'string' ? prev.text : '';
                break;
              }
            }

            submittedTurns.current.add(turnId);
            // Fire-and-forget; the server decides and logs. Non-fatal on error.
            void fetch('/api/record-turn', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                session_id: sessionId,
                utterance,
                agent_question: agentQuestion,
              }),
            }).catch((e) => console.error('record-turn failed:', e));
          });
        });
        ai.subscribeMessage(agoraData.channel);
      } catch (error) {
        if (!cancelled) console.error('[AgoraVoiceAI] init failed:', error);
      }
    })();

    return () => {
      cancelled = true;
      try {
        const ai = AgoraVoiceAI.getInstance();
        if (ai) {
          ai.unsubscribe();
          ai.destroy();
        }
      } catch {}
      aiRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, joinSuccess]);

  // Publish the local mic (usePublish waits for the RTC connection).
  usePublish([localMicrophoneTrack]);

  useClientEvent(client, 'user-joined', (user) => {
    if (user.uid.toString() === agentUID) setIsAgentConnected(true);
  });
  useClientEvent(client, 'user-left', (user) => {
    if (user.uid.toString() === agentUID) setIsAgentConnected(false);
  });
  useEffect(() => {
    const present = remoteUsers.some((u) => u.uid.toString() === agentUID);
    setIsAgentConnected(present);
  }, [remoteUsers, agentUID]);

  useClientEvent(client, 'connection-state-change', (curState) => {
    setConnectionState(curState);
  });

  // Log a reminder outcome (late / no_response) for the professional's logs.
  const markOutcome = useCallback(
    (blockKey: string, kind: 'late' | 'no_response') => {
      if (!patientId) return;
      void fetch('/api/patient-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patient_id: patientId,
          block_key: blockKey,
          session_id: agoraData.sessionId,
          kind,
        }),
      }).catch(() => {});
    },
    [patientId, agoraData.sessionId],
  );

  // --- Reminder state machine --------------------------------------------
  // While the session is open: at a task's scheduled minute, remind the patient.
  // If they don't confirm it done, re-remind every 5 minutes, up to 3 times
  // total. After 3 unanswered reminders -> log "didn't respond" (no_response)
  // and stop. If they confirm AFTER the scheduled time + grace -> mark "late".
  // Completion is detected by polling today's completed block_keys.
  // Only runs while the page is open (browsers can't wake a closed page).
  const RETRY_GAP_MIN = 5;
  const MAX_ATTEMPTS = 3;
  const LATE_GRACE_MIN = 2;

  useEffect(() => {
    if (schedule.length === 0) return;

    const toMin = (hhmm: string) => {
      const [h, m] = hhmm.split(':').map(Number);
      return (h || 0) * 60 + (m || 0);
    };

    // Baseline minute when the session started — only remind for tasks whose
    // time is at/after this, so opening a call doesn't replay past tasks.
    const startNow = new Date();
    const sessionStartMin = startNow.getHours() * 60 + startNow.getMinutes();

    // Speak a reminder with the browser's built-in TTS (deterministic, exact,
    // no dependency on the LLM or RTM).
    const speak = (text: string) => {
      try {
        const synth = window.speechSynthesis;
        if (!synth) return;
        synth.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.rate = 0.95;
        synth.speak(u);
      } catch {
        /* speech not available — the on-screen banner still shows */
      }
    };

    const tick = async () => {
      const now = new Date();
      const nowMin = now.getHours() * 60 + now.getMinutes();

      // Poll which tasks are already confirmed done today.
      let completed: string[] = [];
      if (patientId) {
        try {
          const r = await fetch(`/api/patient-status?patient=${patientId}`);
          const b = await r.json();
          completed = Array.isArray(b.completed) ? b.completed : [];
        } catch {
          /* ignore poll errors */
        }
      }

      let anyReminding = false;
      let activeBanner: string | null = null;

      for (const item of schedule) {
        const key = item.blockKey ?? item.time;
        const st = reminderState.current[key] ?? {
          attempts: 0,
          lastMin: -Infinity,
          finished: false,
        };
        reminderState.current[key] = st;

        if (completed.includes(key)) {
          if (!st.finished) {
            st.finished = true;
            if (st.attempts > 0 && nowMin > toMin(item.time) + LATE_GRACE_MIN) {
              markOutcome(key, 'late');
            }
          }
          continue;
        }
        if (st.finished) continue;

        const taskMin = toMin(item.time);
        if (nowMin < taskMin) continue; // not time yet
        if (taskMin < sessionStartMin) {
          // Time passed before this session started — don't nag.
          st.finished = true;
          continue;
        }

        const sinceLast = nowMin - st.lastMin;
        const firstTime = st.attempts === 0;
        if (firstTime || sinceLast >= RETRY_GAP_MIN) {
          if (st.attempts >= MAX_ATTEMPTS) {
            st.finished = true;
            markOutcome(key, 'no_response');
            continue;
          }

          st.attempts += 1;
          st.lastMin = nowMin;
          anyReminding = true;
          activeBanner = `It's time for ${item.label}`;

          // 1) DETERMINISTIC delivery — on-screen banner + spoken reminder.
          const spoken =
            st.attempts === 1
              ? `It's time for ${item.label}. ${item.type === 'checkin' ? "Let's do your check-in." : 'Please do it now, then tell me when you are done.'}`
              : `Reminder ${st.attempts}: it's still time for ${item.label}. Please tell me when you've done it.`;
          speak(spoken);

          // 2) BEST-EFFORT — also nudge the AI so it continues the conversation.
          const ai = aiRef.current;
          if (ai) {
            ai
              .sendText(agentUID, {
                messageType: ChatMessageType.TEXT,
                text: `IT IS TIME FOR: ${item.label} (scheduled ${item.time}). Reminder ${st.attempts} of ${MAX_ATTEMPTS}. Remind the patient warmly, run the task, and ask them to confirm when done.`,
                priority: ChatMessagePriority.INTERRUPTED,
                responseInterruptable: true,
              })
              .catch(() => {
                /* non-fatal; the spoken/banner reminder already happened */
              });
          }
        } else {
          anyReminding = true;
          activeBanner = `It's time for ${item.label}`;
        }
      }

      setReminding(anyReminding);
      setReminderBanner(activeBanner);
    };

    void tick(); // run immediately
    const id = setInterval(() => void tick(), 1000); // seconds-accurate
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schedule, agentUID, patientId]);

  const handleEnd = useCallback(() => {
    onEnd();
  }, [onEnd]);

  // Derive the single patient-facing status.
  const display: DisplayState = (() => {
    if (!isAgentConnected || connectionState !== 'CONNECTED') {
      return 'connecting';
    }
    switch (agentState) {
      case 'speaking':
        return 'speaking';
      case 'thinking':
        return 'thinking';
      case 'listening':
      case 'idle':
      case 'silent':
      default:
        return 'listening';
    }
  })();

  const statusText: Record<DisplayState, string> = {
    connecting: 'Connecting…',
    listening: "I'm listening",
    thinking: 'One moment…',
    speaking: "I'm speaking",
  };

  const statusHint: Record<DisplayState, string> = {
    connecting: 'Please wait',
    listening: 'Please speak now',
    thinking: 'Thinking',
    speaking: 'Please listen',
  };

  // High-level session status for the top chip.
  const statusLabel = reminding
    ? 'Reminding'
    : display === 'connecting'
      ? 'Connecting'
      : display === 'speaking'
        ? 'Talking'
        : display === 'thinking'
          ? 'Thinking'
          : agentState === 'listening'
            ? 'Listening'
            : 'Standby';

  const statusColor = reminding
    ? 'bg-amber-500/20 text-amber-200 ring-amber-400/40'
    : statusLabel === 'Talking'
      ? 'bg-sky-500/20 text-sky-200 ring-sky-400/40'
      : statusLabel === 'Listening'
        ? 'bg-emerald-500/20 text-emerald-200 ring-emerald-400/40'
        : 'bg-slate-500/20 text-slate-200 ring-slate-400/40';

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-8 px-6 py-10 text-center">
      {/* Top bar: live clock + session status */}
      <div className="fixed inset-x-0 top-0 flex items-center justify-between px-5 py-4">
        <span className="text-2xl font-bold tabular-nums text-foreground">
          {clock}
        </span>
        <span
          className={`rounded-full px-4 py-1.5 text-sm font-semibold ring-2 ${statusColor}`}
          aria-live="polite"
        >
          {statusLabel}
        </span>
      </div>

      {/* Big reminder banner — shows exactly when a task is due. */}
      {reminderBanner && (
        <div className="mt-16 w-full max-w-md rounded-[20px] border-4 border-amber-400 bg-amber-500/15 px-6 py-5 text-center shadow-[0_0_60px_rgba(245,158,11,0.4)]">
          <p className="text-sm font-semibold uppercase tracking-wide text-amber-300">
            Reminder
          </p>
          <p className="mt-1 text-3xl font-extrabold text-amber-100">
            {reminderBanner}
          </p>
        </div>
      )}

      {/* Pulsing status orb — large, high-contrast, no text input required. */}
      <div
        className={[
          "mt-10 flex h-60 w-60 items-center justify-center rounded-full animate-orb",
          reminding
            ? "bg-amber-500/20 ring-8 ring-amber-400 shadow-[0_0_80px_rgba(245,158,11,0.5)]"
            : display === "speaking"
            ? "bg-[color:var(--speaking)]/20 ring-8 ring-[color:var(--speaking)] shadow-[0_0_80px_rgba(56,189,248,0.5)]"
            : display === "listening"
              ? "bg-[color:var(--success)]/20 ring-8 ring-[color:var(--success)] shadow-[0_0_80px_rgba(16,185,129,0.45)]"
              : "bg-[color:var(--primary)]/15 ring-8 ring-[color:var(--primary)] shadow-[0_0_80px_rgba(9,195,235,0.4)]",
        ].join(" ")}
        role="status"
        aria-live="polite"
        aria-label={reminding ? 'Reminder' : statusText[display]}
      >
        <span className="px-4 text-2xl font-bold text-foreground">
          {reminding ? 'Time for your task' : statusText[display]}
        </span>
      </div>

      <p className="text-xl text-muted-foreground">{statusHint[display]}</p>

      {/* The only control the patient needs: end the call. */}
      <button
        type="button"
        onClick={handleEnd}
        className="mt-2 rounded-full bg-[color:var(--destructive)] px-12 py-6 text-2xl font-bold text-white shadow-[0_8px_30px_rgba(244,63,94,0.4)] transition active:scale-95 focus:outline-none focus-visible:ring-4 focus-visible:ring-rose-300/60"
        aria-label="End the call"
      >
        End call
      </button>

      {/* Hidden remote audio sinks so the agent's voice plays. */}
      {remoteUsers.map((user) => (
        <div key={user.uid} className="hidden">
          <RemoteUser user={user} />
        </div>
      ))}
    </div>
  );
}
