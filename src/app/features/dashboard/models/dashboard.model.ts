export interface DashboardOverview {
  documents: DocumentDashboardMetrics;
  approvals: ApprovalDashboardMetrics;
  notifications: NotificationDashboardMetrics;
  extractions: ExtractionDashboardMetrics;
  rag_usage: RagUsageDashboardMetrics;
  generated_at: string;
}

export interface DocumentDashboardMetrics {
  total_documents: number;
  ai_ready_documents: number;
  indexed_documents: number;
  failed_documents: number;
  processing_documents: number;
  by_status: Record<string, number>;
  by_type: Record<string, number>;
  by_sensitivity: Record<string, number>;
}

export interface ApprovalDashboardMetrics {
  total_approvals: number;
  pending: number;
  in_review: number;
  changes_requested: number;
  approved: number;
  rejected: number;
  assigned_to_me: number;
  requested_by_me: number;
  by_status: Record<string, number>;
  by_review_type: Record<string, number>;
  by_priority: Record<string, number>;
}

export interface NotificationDashboardMetrics {
  total_notifications: number;
  unread_count: number;
  read_count: number;
  archived_count: number;
  by_type: Record<string, number>;
  by_priority: Record<string, number>;
}

export interface ExtractionDashboardMetrics {
  total_extraction_runs: number;
  pending: number;
  running: number;
  success: number;
  review_required: number;
  submitted_for_approval: number;
  approved: number;
  failed: number;
  average_confidence: number;
  by_status: Record<string, number>;
  by_template: Record<string, number>;
}

export interface RagUsageDashboardMetrics {
  total_conversations: number;
  total_ai_responses: number;
  total_prompt_tokens: number;
  total_completion_tokens: number;
  total_tokens: number;
  by_provider: Record<string, number>;
  by_model: Record<string, number>;
}

export interface RecentActivity {
  type: string;
  title: string;
  message: string;
  resource_uuid: string;
  status: string;
  created_at: string;
  metadata: Record<string, unknown>;
}

export interface RecentActivityResponse {
  results: RecentActivity[];
}
