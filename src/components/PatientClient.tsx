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

export default function PatientClient() {
  const [showConversation, setShowConversation] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agoraData, setAgoraData] = useState<AgoraTokenData | null>(null);
  const [rtmClient, setRtmClient] = useState<RTMClient | null>(null);

  // Preload heavy browser modules so the first tap is snappy (quickstart note).
  useEffect(() => {
    import('agora-rtc-react').catch(() => {});
    import('agora-rtm').catch(() => {});
  }, []);

  const handleStart = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Read the per-patient link token from the URL: /?patient=<id>
      const patientId =
        typeof window !== 'undefined'
          ? new URLSearchParams(window.location.search).get('patient') ??
            undefined
          : undefined;

      // 1. Fetch RTC+RTM token + channel.
      const agoraResponse = await fetch('/api/generate-agora-token');
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
          const { default: AgoraRTM } = await import('agora-rtm');
          const client: RTMClient = new AgoraRTM.RTM(
            process.env.NEXT_PUBLIC_AGORA_APP_ID!,
            responseData.uid,
          );
          await client.login({ token: responseData.token });
          await client.subscribe(responseData.channel);
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
    rtmClient?.logout().catch((err) => console.error('RTM logout error:', err));
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
          Tap the green button to start talking.
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
