'use client';

// AlalAI patient client — the Voice-First entry screen.
//
// Adapted from the official agent-quickstart-nextjs LandingPage. The session
// orchestration (fetch token -> invite agent + RTM login in parallel -> mount
// the call -> stop agent on end) is kept IDENTICAL to the quickstart. Only the
// pre-call UI is replaced with ONE big start button (AGENTS.md Voice-First
// rules: one screen, one huge button, large type, no text inputs, no answer
// buttons — voice does all the work).

import { useState, useRef, Suspense, useEffect } from 'react';
import dynamic from 'next/dynamic';
import type { RTMClient } from 'agora-rtm';
import type {
  AgoraTokenData,
  ClientStartRequest,
  AgentResponse,
} from '@/types/conversation';
import { acquireRtm } from '@/lib/rtm-manager';

// Browser-only call component.
const VoiceSession = dynamic(() => import('./VoiceSession'), { ssr: false });

// Browser-only RTC provider (useRef keeps a single client across StrictMode).
const AgoraProvider = dynamic(
  async () => {
    const { AgoraRTCProvider, default: AgoraRTC } =
      await import('agora-rtc-react');
    return {
      default: function AgoraProviders({
        children,
      }: {
        children: React.ReactNode;
      }) {
        const clientRef = useRef<ReturnType<
          typeof AgoraRTC.createClient
        > | null>(null);
        if (!clientRef.current) {
          clientRef.current = AgoraRTC.createClient({
            mode: 'rtc',
            codec: 'vp8',
          });
        }
        return (
          <AgoraRTCProvider client={clientRef.current}>
            {children}
          </AgoraRTCProvider>
        );
      },
    };
  },
  { ssr: false },
);

export default function PatientClient({
  patientId: patientIdProp,
  patientName,
  schedule = [],
}: {
  patientId?: string;
  patientName?: string;
  schedule?: { time: string; label: string; type: string; blockKey?: string }[];
} = {}) {
  const [showConversation, setShowConversation] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agoraData, setAgoraData] = useState<AgoraTokenData | null>(null);
  const [rtmClient, setRtmClient] = useState<RTMClient | null>(null);
  // Single RTM instance guard — prevents the "Ins id / mutual kick" warning
  // from a second RTM client being created (StrictMode double-mount or restart).
  const rtmRef = useRef<RTMClient | null>(null);
  // Guard against handleStart running twice concurrently (double tap / StrictMode).
  const startingRef = useRef(false);

  // Preload heavy browser modules so the first tap is snappy (quickstart note).
  useEffect(() => {
    import('agora-rtc-react').catch(() => {});
    import('agora-rtm').catch(() => {});
  }, []);

  const handleStart = async () => {
    // Prevent a second concurrent start (double tap or StrictMode) from
    // creating a duplicate RTM client ("Ins id is 2" / mutual kick).
    if (startingRef.current || rtmRef.current) return;
    startingRef.current = true;
    setIsLoading(true);
    setError(null);

    try {
      // Patient id: from the /p/[token] route (prop) or ?patient= fallback.
      const patientId =
        patientIdProp ??
        (typeof window !== 'undefined'
          ? new URLSearchParams(window.location.search).get('patient') ??
            undefined
          : undefined);

      // 1. Fetch RTC+RTM token + channel. Use a STABLE uid per browser so the
      // RTM client can be reused across start/stop (fewer SDK constructions).
      let stableUid = sessionStorage.getItem('alalai_uid');
      if (!stableUid) {
        stableUid = String(Math.floor(Math.random() * 9_999_000) + 1000);
        sessionStorage.setItem('alalai_uid', stableUid);
      }
      const agoraResponse = await fetch(
        `/api/generate-agora-token?uid=${stableUid}`,
      );
      const responseData = await agoraResponse.json();
      if (!agoraResponse.ok) {
        throw new Error(
          `Failed to generate Agora token: ${JSON.stringify(responseData)}`,
        );
      }

      // 2. Invite the agent and set up RTM in parallel (both need only the token).
      const [agentData, rtm] = await Promise.all([
        fetch('/api/invite-agent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requester_id: responseData.uid,
            channel_name: responseData.channel,
            patient_id: patientId,
          } as ClientStartRequest),
        })
          .then(async (res) => {
            if (!res.ok) return null;
            return (await res.json()) as AgentResponse;
          })
          .catch((err) => {
            console.error('Failed to start agent:', err);
            return null;
          }),

        (async () => {
          // Single-instance RTM via the module-level manager (prevents the
          // "Ins id / mutual kick" warning from multiple live clients).
          const client = await acquireRtm({
            appId: process.env.NEXT_PUBLIC_AGORA_APP_ID!,
            uid: responseData.uid,
            token: responseData.token,
            channel: responseData.channel,
          });
          rtmRef.current = client;
          return client;
        })(),
      ]);

      // Store the running agent id + session id so handleEnd can stop/close them.
      setRtmClient(rtm);
      setAgoraData({
        ...responseData,
        agentId: agentData?.agent_id,
        sessionId: agentData?.session_id,
      });
      setShowConversation(true);
    } catch (err) {
      setError('Could not start the call right now. Please try again.');
      console.error('Error starting conversation:', err);
    } finally {
      setIsLoading(false);
      startingRef.current = false;
    }
  };

  const handleEnd = async () => {
    if (agoraData?.agentId) {
      try {
        await fetch('/api/stop-conversation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agent_id: agoraData.agentId,
            session_id: agoraData.sessionId,
          }),
        });
      } catch (error) {
        console.error('Error stopping agent:', error);
      }
    }
    // Keep the RTM client alive (logged in) for reuse on the next start — this
    // avoids constructing a new AgoraRTM.RTM each session. The singleton manager
    // re-subscribes the same client to the new channel. (releaseRtm is only used
    // when the uid changes or on full teardown.)
    rtmRef.current = null;
    setRtmClient(null);
    setAgoraData(null);
    setShowConversation(false);
  };

  if (showConversation && agoraData && rtmClient) {
    return (
      <Suspense
        fallback={
          <div className="flex min-h-dvh items-center justify-center text-xl text-muted-foreground">
            Connecting…
          </div>
        }
      >
        <AgoraProvider>
          <VoiceSession
            agoraData={agoraData}
            rtmClient={rtmClient}
            schedule={schedule}
            patientId={patientIdProp}
            onEnd={handleEnd}
          />
        </AgoraProvider>
      </Suspense>
    );
  }

  // Pre-call screen: Agora-style centered card, but with one huge button, large
  // type, high contrast. No text inputs or answer buttons (Voice-First rules).
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 py-10">
      <div className="animate-fade-up flex w-[min(92vw,30rem)] flex-col items-center rounded-[20px] border border-[color:var(--card-border)] bg-[color:var(--surface)]/80 px-8 py-12 text-center shadow-[0_12px_40px_rgba(0,0,0,0.45)] backdrop-blur">
        <h1 className="text-4xl font-bold tracking-tight text-foreground">
          AlalAI
        </h1>
        <p className="mt-3 text-lg leading-7 text-muted-foreground">
          {patientName
            ? `Hello ${patientName}. Tap the green button to start talking.`
            : 'Tap the green button to start talking.'}
        </p>

        <button
          type="button"
          onClick={handleStart}
          disabled={isLoading}
          className="mt-10 flex h-56 w-56 items-center justify-center rounded-full bg-[color:var(--success)] text-2xl font-bold text-white shadow-[0_0_60px_rgba(16,185,129,0.45)] transition active:scale-95 disabled:opacity-60 focus:outline-none focus-visible:ring-8 focus-visible:ring-emerald-300/60"
          aria-label="Start the call"
        >
          {isLoading ? "Starting…" : "Start"}
        </button>

        <p className="mt-8 text-sm text-muted-foreground">
          Powered by Agora Conversational AI
        </p>

        {error && (
          <p className="mt-4 text-base text-[color:var(--destructive)]" role="alert">
            {error}
          </p>
        )}
      </div>
    </main>
  );
}
