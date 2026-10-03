// Shared types for the Agora voice session.
// Adapted from the official agent-quickstart-nextjs (types/conversation.ts).

export interface AgoraTokenData {
  token: string;
  uid: string;
  channel: string;
  agentId?: string;
  sessionId?: string;
}

export interface ClientStartRequest {
  requester_id: string;
  channel_name: string;
  patient_id?: string;
}

export interface StopConversationRequest {
  agent_id: string;
  session_id?: string;
}

export interface AgentResponse {
  agent_id: string;
  create_ts: number;
  state: string;
  session_id?: string;
}
