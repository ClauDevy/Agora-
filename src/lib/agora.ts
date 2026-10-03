// Agora shared constants.
// The agent UID identifies the AI participant in the RTC channel. It must match
// between the invite-agent route (server) and the client that watches for the
// agent joining. Read from NEXT_PUBLIC_AGENT_UID so both sides agree; fall back
// to the quickstart default if unset.

const DEFAULT = 123456;

const parsed = Number.parseInt(
  process.env.NEXT_PUBLIC_AGENT_UID ?? '',
  10,
);

export const DEFAULT_AGENT_UID =
  Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT;
