export type AiChatScope = 'internal' | 'external';

export interface AiChatRequest {
  message: string;
  conversation_uuid?: string;
  department?: string | null;
  document_type?: string | null;
  sensitivity_label?: string | null;
  top_k?: number;
}

export interface ExternalAiChatRequest {
  message: string;
  conversation_uuid?: string;
  use_web: boolean;
  top_k?: number;
  document_uuids?: string[];
}

export interface AiSource {
  source_type?:
    | 'internal_document'
    | 'external_document'
    | 'processing_document'
    | 'failed_document'
    | 'web'
    | 'system_warning'
    | string;

  title?: string;
  snippet?: string;
  url?: string;

  document_uuid?: string;
  document_title?: string;
  content_preview?: string;

  document?: string;
  page?: number;
  score?: number;
  chunk_uuid?: string;
  text?: string;
  preview?: string;

  status?: string;
  processing_error?: string;
  warning?: string;
  message?: string;
}

export interface AiUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

export interface ExternalContext {
  intent?: 'calculator' | 'document_question' | 'hybrid' | 'web_question' | 'general_web' | 'general' | string;
  external_chunk_count?: number;
  web_result_count?: number;
  processing_documents?: AiSource[];
  failed_documents?: AiSource[];
  search_warnings?: string[];
}

export type AiFirewallPolicyAction =
  | 'allow'
  | 'allowed'
  | 'redact'
  | 'redacted'
  | 'block'
  | 'blocked'
  | 'approval_required'
  | 'local_only'
  | string;

export interface AiFirewallPolicyRecord {
  document_uuid?: string;
  document_title?: string;
  title?: string;
  action?: AiFirewallPolicyAction;
  policy_action?: AiFirewallPolicyAction;
  reason?: string;
  sensitivity_label?: string;
}

export interface AiFirewallMetadata {
  policy_action?: AiFirewallPolicyAction;
  action?: AiFirewallPolicyAction;
  policy_actions?: AiFirewallPolicyRecord[];

  forced_local?: boolean;
  local_only?: boolean;
  requires_approval?: boolean;
  safe_to_answer?: boolean;

  allowed_count?: number;
  redacted_count?: number;
  blocked_count?: number;

  sensitivity_label?: string;
  blocked_reason?: string;
  reason?: string;

  redacted_fields?: AiFirewallPolicyRecord[];
}

export interface AiChatResponse {
  conversation_uuid: string;
  message_uuid?: string;
  answer: string;
  sources?: AiSource[];
  model_provider?: string;
  model_name?: string;
  usage?: AiUsage;
  firewall?: AiFirewallMetadata | null;
  external_context?: ExternalContext;
  attachments?: LocalChatAttachment[];
}

export interface AiConversation {
  uuid: string;
  title: string;
  scope?: AiChatScope;
  created_at?: string;
  updated_at?: string;
}

export interface AiConversationMessage {
  uuid?: string;
  role: 'user' | 'assistant' | 'system' | string;
  content: string;
  created_at: string;
  retrieved_sources?: AiSource[];
  sources?: AiSource[];
  metadata?: {
    firewall_enforcement?: AiFirewallMetadata | null;
    external_context?: ExternalContext;
  };
  model_provider?: string;
  model_name?: string;
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

export interface AiConversationDetail extends AiConversation {
  messages?: AiConversationMessage[];
}

export interface LocalChatAttachment {
  uuid?: string;
  local_id?: string;
  title: string;
  original_filename?: string;
  filename?: string;
  file_size?: number;
  status?: string;
  is_ai_ready?: boolean;
  processing_error?: string;
}

export interface LocalChatMessage {
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
  sources?: AiSource[];
  firewall?: AiFirewallMetadata | null;
  model_provider?: string;
  model_name?: string;
  usage?: AiUsage;
  external_context?: ExternalContext;
  attachments?: LocalChatAttachment[];
}

export interface ExternalDocument {
  uuid: string;
  conversation_uuid?: string;
  scope?: 'external';
  title: string;
  original_filename?: string;
  filename?: string;
  document_type?: string;
  sensitivity_label?: string;
  status?: 'uploaded' | 'processing' | 'ready' | 'failed' | string;
  is_ai_ready?: boolean;
  is_ocr_completed?: boolean;
  is_indexed?: boolean;
  processing_error?: string;
  created_at?: string;
  updated_at?: string;
  file_size?: number;
  mime_type?: string;
}

export interface ExternalDocumentBulkUploadResponse {
  conversation_uuid: string;
  uploaded_count: number;
  documents: ExternalDocument[];
}
