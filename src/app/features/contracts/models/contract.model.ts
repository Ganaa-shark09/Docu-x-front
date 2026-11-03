/** Contract API types. Restricted fields are intentionally not present on register rows. */
export interface ContractRegisterRow {
  uuid: string;
  workflow_uuid: string;
  document_uuid: string;
  document_title: string;
  status: string;
  revision: number;
  contract_type: string | null;
  effective_date: string | null;
  expiration_date: string | null;
  notice_deadline: string | null;
  blocking_issues: number;
  source_coverage_complete: boolean | null;
  review_output_finalized_at: string | null;
  created_at: string;
}

export interface ContractPage {
  count: number;
  next: string | null;
  previous: string | null;
  results: ContractRegisterRow[];
}

export interface ContractSummary {
  total: number;
  needs_attention: number;
  by_status: Record<string, number>;
}

/** Detail endpoint is permission-filtered separately from the bounded register projection. */
export interface ContractReviewDetail {
  uuid: string;
  revision: number;
  normalized?: Record<string, unknown> | null;
  validation?: unknown;
  coverage?: Record<string, unknown> | null;
  finalized_at?: string | null;
  created_at?: string;
  document_uuid?: string;
  workflow_uuid?: string;
  status?: string;
  final_output?: unknown;
}

export interface ContractEvidence {
  source?: string;
  source_text?: string;
  snippet?: string;
  quote?: string;
  text?: string;
  page?: number | string;
  page_number?: number | string;
  field_key?: string;
  [key: string]: unknown;
}

export interface ContractMilestone {
  source_field: string;
  date: string;
  evidence?: ContractEvidence[] | string[] | null;
  [key: string]: unknown;
}

export interface ContractMilestoneSnapshot {
  milestones: ContractMilestone[];
  review_output_finalized: boolean;
  [key: string]: unknown;
}

export type ObligationStatus = 'open' | 'in_progress' | 'completed';
export interface ContractObligationEvent {
  sequence: number;
  from_status: string;
  to_status: string;
  reason: string;
  actor_id: number | null;
  created_at: string;
}

export interface ContractObligation {
  uuid: string;
  owner_id: number;
  source_revision: number;
  source_index: number;
  source_digest: string;
  source_snapshot: Record<string, unknown>;
  governance_revision: number;
  status: ObligationStatus;
  revision: number;
  stale: boolean;
  events: ContractObligationEvent[];
  created_at: string;
  updated_at: string;
}

export interface AssignContractObligationPayload {
  source_index: number;
  owner_id: number;
  expected_review_revision: number;
}

export interface TransitionContractObligationPayload {
  status: 'in_progress' | 'completed';
  reason: string;
  expected_revision: number;
}
