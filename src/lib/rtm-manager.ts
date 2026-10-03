'use client';

// Module-level RTM singleton manager.
//
// The Agora RTM SDK warns ("Ins id is N / mutual kick") when more than one RTM
// client exists in the same JS context. In dev (HMR / StrictMode / restarts)
// and across sessions we can accidentally create several. This manager keeps a
// single live RTM client on the module scope, logging out and discarding any
// previous one before creating a new one, so there is only ever one.

import type { RTMClient } from 'agora-rtm';

// Store the live client + a global guard that survives HMR via globalThis.
interface RtmHolder {
  client: RTMClient | null;
  uid: string | null;
  creating: Promise<RTMClient> | null;
}

const g = globalThis as unknown as { __alalaiRtm?: RtmHolder };
if (!g.__alalaiRtm) g.__alalaiRtm = { client: null, uid: null, creating: null };
const holder = g.__alalaiRtm;

/** Fully release the current RTM client if any. */
export async function releaseRtm(): Promise<void> {
  if (holder.client) {
    try {
      await holder.client.logout();
    } catch {
      /* ignore */
    }
    holder.client = null;
    holder.uid = null;
  }
}

/**
 * Get a single RTM client logged in for this uid/channel. Reuses the existing
 * client when the uid is unchanged (only re-subscribing to the channel) so a
 * new AgoraRTM.RTM is NOT constructed on every start. Only when the uid differs
 * do we tear down and build a new one — guaranteeing one live client at a time.
 */
export async function acquireRtm(params: {
  appId: string;
  uid: string;
  token: string;
  channel: string;
}): Promise<RTMClient> {
  if (holder.creating) {
    try {
      await holder.creating;
    } catch {
      /* fall through */
    }
  }

  // Reuse the existing client if it's for the same uid (just renew + (re)subscribe).
  if (holder.client && holder.uid === params.uid) {
    try {
      await holder.client.renewToken(params.token);
    } catch {
      /* some SDK versions renew lazily; ignore */
    }
    try {
      await holder.client.subscribe(params.channel);
    } catch {
      /* already subscribed or transient — fine */
    }
    return holder.client;
  }

  holder.creating = (async () => {
    // Different uid (or none): tear down any existing client first so only one
    // is ever logged in.
    await releaseRtm();

    const { default: AgoraRTM } = await import('agora-rtm');
    // logLevel 'error' only; the SDK's "Ins id is N / mutual kick" line is an
    // internal caution emitted once per RTM construction. Our singleton guarantees
    // only ONE client is logged in at a time, so there is no real mutual-kick.
    const client: RTMClient = new AgoraRTM.RTM(params.appId, params.uid, {
      logLevel: 'error',
    });
    await client.login({ token: params.token });
    await client.subscribe(params.channel);
    holder.client = client;
    holder.uid = params.uid;
    return client;
  })();

  try {
    return await holder.creating;
  } finally {
    holder.creating = null;
  }
}
