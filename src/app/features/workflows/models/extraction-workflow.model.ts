export type ExtractionRunStatus =
  | 'pending'
  | 'running'
  | 'success'
  | 'failed'
  | 'completed'
  | 'review_required'
  | 'approved'
  | 'rejected'
  | string;

export interface WorkflowDocumentRef {
  uuid?: string;
  title?: string;
  original_filename?: string;
  filename?: string;
  document_type?: string;
  sensitivity_label?: string;
}

export interface WorkflowTemplateRef {
  uuid?: string;
  name?: string;
  template_type?: string;
  description?: string;
}

export interface ExtractionResultField {
  uuid: string;
  field_name: string;
  label?: string;
  value?: unknown;
  extracted_value?: unknown;
  corrected_value?: unknown;
  confidence?: number | string | null;
  confidence_score?: number | string | null;
  source_text?: string;
  reviewer_comment?: string;
  is_corrected?: boolean;
  status?: string;
  created_at?: string;
  updated_at?: string;
}

export interface ExtractionRun {
  uuid: string;

  document?: WorkflowDocumentRef | number | null;
  document_uuid?: string;
  document_title?: string;
  original_filename?: string;

  template?: WorkflowTemplateRef | number | null;
  template_uuid?: string;
  template_name?: string;
  template_type?: string;

  requested_by?: number | null;
  requested_by_email?: string;
  requested_by_name?: string;

  status: ExtractionRunStatus;
  overall_confidence?: number | string | null;
  confidence?: number | string | null;

  raw_output?: Record<string, unknown> | null;
  extracted_data?: Record<string, unknown> | null;
  result_fields?: ExtractionResultField[];
  fields?: ExtractionResultField[];

  error_message?: string;
  created_at: string;
  updated_at?: string;
  started_at?: string | null;
  completed_at?: string | null;
}

export interface ExtractionRunListResponse {
  count?: number;
  next?: string | null;
  previous?: string | null;
  results?: ExtractionRun[];
  data?: ExtractionRun[];
  items?: ExtractionRun[];
  extraction_runs?: ExtractionRun[];
}

export interface ExtractionRunFilters {
  search?: string;
  status?: string;
}

export interface FieldCorrectionPayload {
  corrected_value: unknown;
  reviewer_comment?: string;
}

export interface SubmitForApprovalPayload {
  assigned_to?: number | null;
}
