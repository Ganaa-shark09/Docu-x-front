export type ApprovalStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'changes_requested'
  | 'cancelled';

export type ApprovalAction = 'approve' | 'reject' | 'request_changes';

export interface ApprovalDocument {
  uuid: string;
  title: string;
  original_filename?: string;
  document_type?: string;
  sensitivity_label?: string;
  status?: string;
}

export interface ApprovalComment {
  uuid?: string;
  comment?: string;
  message?: string;
  comment_type?: string;
  action?: string;
  field_path?: string;
  old_value?: string;
  new_value?: string;
  created_at?: string;
  updated_at?: string;
  created_by?: number | null;
  created_by_name?: string;
  user_name?: string;
}

export interface ExtractionFieldReview {
  field_name: string;
  label?: string;
  value?: string | number | boolean | null;
  description?: string | undefined | null;
  confidence?: number | null;
  status?: string;
  reviewer_comment?: string | null;
}

export interface ApprovalRequest {
  uuid: string;

  document?: ApprovalDocument | number | null;
  document_uuid?: string;
  document_title?: string;

  title?: string;
  description?: string;
  status: ApprovalStatus | string;
  priority?: string;
  review_type?: string;

  assigned_to?: number | null;
  assigned_to_email?: string;
  assigned_reviewer_name?: string;

  requested_by?: number | null;
  requested_by_email?: string;
  requester_name?: string;
  created_by_name?: string;

  comments?: ApprovalComment[];

  extraction_fields?: ExtractionFieldReview[];
  extracted_data?: Record<string, unknown> | null;
  submitted_payload?: Record<string, unknown> | null;
  reviewed_payload?: Record<string, unknown> | null;

  review_comment?: string | null;
  correction_comment?: string | null;
  reviewer_notes?: string | null;

  created_at: string;
  updated_at?: string;
  submitted_at?: string | null;
  due_at?: string | null;
  approved_at?: string | null;
  rejected_at?: string | null;
  reviewed_at?: string | null;
}

export interface ApprovalActionPayload {
  comment: string;
  reviewer_notes?: string;
}

export interface ApprovalFilters {
  status?: string;
  search?: string;
}
