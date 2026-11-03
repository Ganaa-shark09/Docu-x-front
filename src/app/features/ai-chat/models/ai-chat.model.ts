import { HRAnswerPolicy, HRContext } from '../../workflows/models/hr-policy.model';
export type AiChatScope = 'internal' | 'external';

export interface AiChatRequest {
  /** UUID of an approved company grant, never a raw provider model ID. */
  model_uuid?: string;
  domain?: 'hr_policy';
  policy_context?: HRContext;
  idempotency_key?: string;
  document_scope?: 'all' | 'selected';
  document_uuids?: string[];
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
  document_scope_mode?: 'selected' | 'conversation';
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

  /*
   * Compatibility aliases returned by some
   * document/web source serializers.
   */
  type?: string;
  file_name?: string;
  web_url?: string;

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
  intent?:
    | 'calculator'
    | 'document_question'
    | 'hybrid'
    | 'web_question'
    | 'general_web'
    | 'general'
    | string;
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

export interface AiFirewallContextItem {
  title?: string;
  document_title?: string;
  filename?: string;
  file_name?: string;
  source_name?: string;

  reason?: string;
  decision_reason?: string;
  message?: string;
  status?: string;
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

  /*
   * Compatibility fields from older/current
   * firewall response serializers.
   */
  allowed?: number;
  redacted?: number;
  blocked?: number;

  checked_at?: string;
  created_at?: string;

  blocked_items?: AiFirewallContextItem[];
  blocked_sources?: AiFirewallContextItem[];
  blocked_documents?: AiFirewallContextItem[];

  allowed_items?: AiFirewallContextItem[];
  allowed_sources?: AiFirewallContextItem[];
  allowed_documents?: AiFirewallContextItem[];

  sensitivity_label?: string;
  blocked_reason?: string;
  reason?: string;

  redacted_fields?: AiFirewallPolicyRecord[];
}

export interface AiChatResponse {
  policy?: HRAnswerPolicy;
  conversation_uuid: string;
  message_uuid?: string;
  answer: string;
  detail?: string;
  sources?: AiSource[];
  model_provider?: string;
  model_name?: string;
  usage?: AiUsage;
  firewall?: AiFirewallMetadata | null;
  external_context?: ExternalContext;
  document_context?: AiDocumentContext;
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

  document_context?: AiDocumentContext;
  firewall?: AiFirewallMetadata | null;
  external_context?: ExternalContext;

  metadata?: {
    domain?: 'hr_policy';
    hr_policy?: HRAnswerPolicy;
    policy_context?: HRContext;
    protected_context_omitted?: boolean;
    document_dependencies?: Record<string, number | null>;
    firewall_enforcement?: AiFirewallMetadata | null;
    external_context?: ExternalContext;
    document_context?: AiDocumentContext;
    internal_document_context?: AiDocumentContext;
    requested_document_uuids?: string[];
    document_scope_mode?: 'selected' | 'conversation' | 'none' | string;
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
  policy?: HRAnswerPolicy;
  document_context?: AiDocumentContext;
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
  updated_at?: string | null;
  file_size?: number;
  mime_type?: string;

  processing_stage?: string | null;
  processing_progress?: number | null;
}

export interface ExternalDocumentBulkUploadResponse {
  conversation_uuid: string;
  uploaded_count: number;
  documents: ExternalDocument[];
}

export interface ExternalDocumentReadinessItem {
  uuid: string;
  title: string;
  original_filename?: string;
  status?: string;
  state: 'processing' | 'ready' | 'failed' | string;
  is_ai_ready: boolean;
  is_ocr_completed?: boolean;
  is_indexed?: boolean;
  processing_error?: string;
  updated_at?: string | null;
}

export interface ExternalDocumentReadinessResponse {
  documents: ExternalDocumentReadinessItem[];
  ready_documents: ExternalDocumentReadinessItem[];
  processing_documents: ExternalDocumentReadinessItem[];
  failed_documents: ExternalDocumentReadinessItem[];
  missing_document_uuids: string[];
  all_ready: boolean;
  has_processing: boolean;
  has_failed: boolean;
}

export interface ExternalAttachmentsProcessingResponse extends ExternalDocumentReadinessResponse {
  status: 'attachments_processing';
  detail: string;
  retry_after_ms: number;
  pending_document_uuids?: string[];
}

export type ExternalAiChatResponse = AiChatResponse | ExternalAttachmentsProcessingResponse;

export interface InternalAiDocument {
  uuid: string;
  title: string;
  description?: string | null;
  original_filename?: string | null;
  file_extension?: string | null;
  document_type?: string | null;
  department_uuid?: string | null;
  department_name?: string | null;
  sensitivity_label?: string | null;
  file_size?: number | null;
  mime_type?: string | null;
  page_count?: number | null;
  status?: string | null;
  is_indexed?: boolean;
  is_ai_ready?: boolean;
  can_download?: boolean;
  preview_url?: string | null;
  download_url?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface InternalAiDocumentLibraryResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: InternalAiDocument[];
}

export interface AiDocumentContext {
  mode: 'all' | 'selected';
  document_uuids: string[];
  document_titles: string[];
  accessible_document_count: number;
  selected_document_count: number;
}
