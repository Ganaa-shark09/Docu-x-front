export interface AiChatRequest {
  message: string;
  conversation_uuid?: string ;
  department?: string | null;
  document_type?: string | null;
  sensitivity_label?: string | null;
  top_k?: number;
}

export interface AiChatResponse {
  conversation_uuid: string;
  message_uuid: string;
  answer: string;
  sources: AiSourceCitation[];
  firewall?: AiFirewallMetadata;
  model_provider: string;
  model_name: string;
  usage: AiUsage;
}

export interface AiUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface AiSourceCitation {
  chunk_uuid?: string;
  document_uuid?: string;
  document_title?: string;
  department_uuid?: string | null;
  department_name?: string | null;
  chunk_index?: number;
  score?: number;
  distance?: number;
  content_preview?: string;
  metadata?: Record<string, unknown>;
}

export interface AiFirewallMetadata {
  requested_provider_type?: string;
  effective_provider_type?: string;
  forced_local?: boolean;
  allowed_count?: number;
  blocked_count?: number;
  redacted_count?: number;
  policy_actions?: AiFirewallPolicyAction[];
}

export interface AiFirewallPolicyAction {
  chunk_uuid?: string;
  document_uuid?: string;
  document_title?: string;
  chunk_index?: number;
  action?: string;
  reason?: string;
  sensitivity_label?: string;
  firewall_risk_level?: string | null;
  firewall_decision?: string | null;
}

export interface AiConversation {
  uuid: string;
  title: string;
  status?: string;
  department_name?: string | null;
  created_at: string;
  updated_at: string;
}

export interface AiConversationDetail extends AiConversation {
  messages: AiConversationMessage[];
}

export interface AiConversationMessage {
  uuid: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  retrieved_sources?: AiSourceCitation[];
  model_provider?: string;
  model_name?: string;
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  metadata?: {
    firewall_enforcement?: AiFirewallMetadata;
    [key: string]: unknown;
  };
  created_at: string;
  updated_at: string;
}

export interface LocalChatMessage {
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
  sources?: AiSourceCitation[];
  firewall?: AiFirewallMetadata;
  model_provider?: string;
  model_name?: string;
  usage?: AiUsage;
}
