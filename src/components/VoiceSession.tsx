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
  schedule?: { time: string; label: string; type: string }[];
}

// Patient-facing status, derived from agent + connection state.
type DisplayState = 'connecting' | 'listening' | 'speaking' | 'thinking';

export default function VoiceSession({
  agoraData,
  rtmClient,
  onEnd,
  schedule = [],
}: VoiceSessionProps) {
  const client = useRTCClient();
  const remoteUsers = useRemoteUsers();
  const agentUID = String(DEFAULT_AGENT_UID);
  const [, setJoinedUID] = useState<UID>(0);
  const [isAgentConnected, setIsAgentConnected] = useState(false);
  const [connectionState, setConnectionState] = useState<string>('CONNECTING');
  const [agentState, setAgentState] = useState<AgentState | null>(null);

  // Track which patient turns we've already scored (de-dupe) and the agent's
  // most recent question text, so each answer is attributed to the right field.
  const submittedTurns = useRef<Set<string | number>>(new Set());
  const sessionId = agoraData.sessionId;
  // Reference to the live AgoraVoiceAI instance (for proactive sendText reminders).
  const aiRef = useRef<InstanceType<typeof AgoraVoiceAI> | null>(null);
  // Task times already announced this session (avoid repeat reminders).
  const firedTimes = useRef<Set<string>>(new Set());

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

  // --- Auto-reminder scheduler -------------------------------------------
  // While the session is open, check the DEVICE's local time every 5s. A task
  // is "due" when the current time is at or past its scheduled time (same day).
  // When a task becomes due and hasn't been announced yet this session, tell the
  // agent via sendText so it leaves standby and runs that task. Firing on ">="
  // (not exact-minute equality) means a reminder still happens even if the exact
  // minute tick was missed or the time already passed when the session started.
  // Only works while the page is open (browsers can't wake a closed page).
  useEffect(() => {
    if (!isAgentConnected || schedule.length === 0) return;

    const toMinutes = (hhmm: string) => {
      const [h, m] = hhmm.split(':').map(Number);
      return (h || 0) * 60 + (m || 0);
    };

    const check = () => {
      const now = new Date();
      const nowMin = now.getHours() * 60 + now.getMinutes();

      for (const item of schedule) {
        if (firedTimes.current.has(item.time)) continue;
        const taskMin = toMinutes(item.time);
        // Due when now is at/just past the scheduled time (within a 10-min
        // window so we don't blast reminders for times long past at startup).
        const late = nowMin - taskMin;
        if (late < 0 || late > 10) continue;

        const ai = aiRef.current;
        if (!ai) continue; // agent not ready yet; try again next tick (don't mark fired)

        firedTimes.current.add(item.time);
        ai
          .sendText(agentUID, {
            messageType: ChatMessageType.TEXT,
            text: `IT IS NOW TIME FOR: ${item.label} (scheduled ${item.time}). It is now ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}. Stop standby, remind the patient it is time, run this task now, then do the after-task check-in.`,
            priority: ChatMessagePriority.INTERRUPTED,
            responseInterruptable: true,
          })
          .catch((e) => {
            console.error('auto-reminder sendText failed:', e);
            // Allow a retry on the next tick if sending failed.
            firedTimes.current.delete(item.time);
          });
      }
    };

    check(); // run once immediately on connect
    const id = setInterval(check, 5000);
    return () => clearInterval(id);
  }, [isAgentConnected, schedule, agentUID]);

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

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-10 px-6 py-10 text-center">
      {/* Pulsing status orb — large, high-contrast, no text input required. */}
      <div
        className={[
          "flex h-60 w-60 items-center justify-center rounded-full animate-orb",
          display === "speaking"
            ? "bg-[color:var(--speaking)]/20 ring-8 ring-[color:var(--speaking)] shadow-[0_0_80px_rgba(56,189,248,0.5)]"
            : display === "listening"
              ? "bg-[color:var(--success)]/20 ring-8 ring-[color:var(--success)] shadow-[0_0_80px_rgba(16,185,129,0.45)]"
              : "bg-[color:var(--primary)]/15 ring-8 ring-[color:var(--primary)] shadow-[0_0_80px_rgba(9,195,235,0.4)]",
        ].join(" ")}
        role="status"
        aria-live="polite"
        aria-label={statusText[display]}
      >
        <span className="px-4 text-2xl font-bold text-foreground">
          {statusText[display]}
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
