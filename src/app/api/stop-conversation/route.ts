// Stop the Agora Conversational AI agent (idempotent).
// Adapted from the official agent-quickstart-nextjs (app/api/stop-conversation).

import { NextResponse } from 'next/server';
import { AgoraClient, Area } from 'agora-agents';
import type { StopConversationRequest } from '@/types/conversation';
import { endSession } from '@/lib/data';

function isAgentAlreadyStoppingOrStopped(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;

  const maybeErr = error as {
    statusCode?: number;
    body?: { detail?: string; reason?: string };
    message?: string;
  };

  const statusCode = maybeErr.statusCode;
  const reason = maybeErr.body?.reason?.toLowerCase();
  const detail =
    maybeErr.body?.detail?.toLowerCase() ??
    maybeErr.message?.toLowerCase() ??
    '';

  if (statusCode === 404) return true;
  if (
    reason === 'invalidrequest' &&
    detail.includes('already in the process of shutting down')
  ) {
    return true;
  }
  return false;
}

export async function POST(request: Request) {
  try {
    const body: StopConversationRequest = await request.json();
    const { agent_id, session_id } = body;

    if (!agent_id) {
      return NextResponse.json(
        { error: 'agent_id is required' },
        { status: 400 },
      );
    }

    // Close the session row (best-effort; never block stopping the agent).
    if (session_id) {
      try {
        await endSession(session_id, 'completed');
      } catch (e) {
        console.error('Failed to end session (non-fatal):', e);
      }
    }

    const appId = process.env.NEXT_PUBLIC_AGORA_APP_ID;
    const appCertificate = process.env.NEXT_AGORA_APP_CERTIFICATE;
    if (!appId || !appCertificate) {
      throw new Error(
        'Missing Agora configuration. Set NEXT_PUBLIC_AGORA_APP_ID and NEXT_AGORA_APP_CERTIFICATE.',
      );
    }

    const client = new AgoraClient({
      area: Area.US,
      appId,
      appCertificate,
    });

    try {
      await client.stopAgent(agent_id);
    } catch (error) {
      if (isAgentAlreadyStoppingOrStopped(error)) {
        return NextResponse.json({ success: true, state: 'already-stopping' });
      }
      throw error;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error stopping conversation:', error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Failed to stop conversation',
      },
      { status: 500 },
    );
  }
}
