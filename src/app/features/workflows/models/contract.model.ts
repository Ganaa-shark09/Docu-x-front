import { Definition, Principal, Version, Json } from './workflow.model';
import { InvoiceEvidence } from './invoice.model';
export interface ContractEvidence extends InvoiceEvidence {
  boundary?: string;
}
export interface ContractRowEvidence {
  evidence?: ContractEvidence[];
}
export interface Parties extends ContractRowEvidence {
  legal_name: string | null;
  role: string | null;
  address: string | null;
  jurisdiction: string | null;
  registration_identifier: string | null;
  signatory: string | null;
}
export interface KeyContacts extends ContractRowEvidence {
  name: string | null;
  role: string | null;
  email: string | null;
}
export interface Obligations extends ContractRowEvidence {
  party: string | null;
  action: string | null;
  timing: string | null;
  timing_type: string | null;
  due_date: string | null;
  condition: string | null;
  frequency: string | null;
}
export interface KeyClauses extends ContractRowEvidence {
  category: string | null;
  text: string | null;
  section_heading: string | null;
}
export interface ScheduleDates extends ContractRowEvidence {
  kind: string | null;
  raw_date: string | null;
  date: string | null;
  description: string | null;
}
export const CONTRACT_FIELDS = [
  'contract_title',
  'contract_type',
  'term_type',
  'initial_term',
  'renewal_term',
  'renewal_mechanism',
  'termination_notice_period',
  'termination_for_convenience',
  'termination_for_cause',
  'cure_period',
  'termination_fees',
  'survival_obligations',
  'governing_law',
  'jurisdiction',
  'venue',
  'dispute_resolution',
  'payment_terms',
  'payment_frequency',
  'pricing',
  'late_fees',
  'credits',
  'renewal_pricing',
  'price_increase',
  'liability_cap',
  'effective_date',
  'execution_date',
  'start_date',
  'expiration_date',
  'renewal_date',
  'notice_deadline',
  'currency',
  'contract_value',
  'minimum_commitment',
  'maximum_commitment',
  'auto_renewal',
  'parties',
  'key_contacts',
  'obligations',
  'key_clauses',
  'schedule_dates',
] as const;
export type ContractKey = (typeof CONTRACT_FIELDS)[number];
export type ContractData = Partial<
  Record<
    | 'contract_title'
    | 'contract_type'
    | 'term_type'
    | 'initial_term'
    | 'renewal_term'
    | 'renewal_mechanism'
    | 'termination_notice_period'
    | 'termination_for_convenience'
    | 'termination_for_cause'
    | 'cure_period'
    | 'termination_fees'
    | 'survival_obligations'
    | 'governing_law'
    | 'jurisdiction'
    | 'venue'
    | 'dispute_resolution'
    | 'payment_terms'
    | 'payment_frequency'
    | 'pricing'
    | 'late_fees'
    | 'credits'
    | 'renewal_pricing'
    | 'price_increase'
    | 'liability_cap'
    | 'effective_date'
    | 'execution_date'
    | 'start_date'
    | 'expiration_date'
    | 'renewal_date'
    | 'notice_deadline'
    | 'currency'
    | 'contract_value'
    | 'minimum_commitment'
    | 'maximum_commitment',
    string | null
  >
> & {
  auto_renewal?: boolean | null;
  parties?: Parties[] | null;
  key_contacts?: KeyContacts[] | null;
  obligations?: Obligations[] | null;
  key_clauses?: KeyClauses[] | null;
  schedule_dates?: ScheduleDates[] | null;
};
export interface ContractProvenance {
  field_uuid: string;
  raw_value: string | null;
  normalized_value: Json;
  corrected_value: string | null;
  confidence: string | null;
  confidence_basis: string | null;
  review_status: 'reviewed' | 'unreviewed';
  reviewed_by: number | null;
  evidence: ContractEvidence[];
  original_evidence: ContractEvidence[];
}
export interface ContractCorrection {
  uuid: string;
  actor: number | null;
  revision: number;
  previous_value: string;
  corrected_value: string;
  reason: string;
  source_metadata: { previous_evidence?: ContractEvidence[]; evidence?: ContractEvidence[] };
  created_at: string;
}
export interface ContractField extends ContractProvenance {
  field_key: ContractKey;
  corrections: ContractCorrection[];
}
export interface ContractValidation {
  code: string;
  fields: string[];
  category: string;
  severity: string;
  blocking: boolean;
}
export interface ContractCoverage {
  complete: boolean;
  method: string;
  text_bytes?: number;
  chunk_count?: number;
}
export interface ContractRiskSnapshot {
  category: string;
  severity: string;
  title: string;
  description: string;
  evidence: ContractEvidence[];
  data: Json;
  status: string;
  review_state: string;
}
export interface ContractCanonical {
  schema_version: number;
  contract: ContractData;
  source: {
    document_uuid: string;
    workflow_uuid: string;
    extraction_uuid: string;
    revision: number;
  };
  field_provenance: Partial<Record<ContractKey, ContractProvenance>>;
  coverage: ContractCoverage;
  review_status: string;
  approval_status: string;
  approval_uuid: string | null;
  finalized_at: string;
  risks: ContractRiskSnapshot[];
  missing_information: ContractValidation[];
  validation: ContractValidation[];
}
export interface ContractOutput {
  uuid: string;
  revision: number;
  schema_version: number;
  digest: string;
  data: ContractCanonical;
  created_at: string;
}
export interface ContractReview {
  uuid: string;
  workflow_uuid: string;
  document_uuid: string;
  extraction_uuid: string | null;
  revision: number;
  normalized: ContractData;
  classification: {
    basis?: string;
    contract_type?: string;
    document_type?: string;
    document_confidence?: number;
    uncertain?: boolean;
  };
  validation: ContractValidation[];
  coverage: ContractCoverage;
  effective_confidence: string | null;
  finalized_at: string | null;
  field_provenance: Partial<Record<ContractKey, ContractProvenance>>;
  final_output: ContractOutput | null;
}
export interface ContractPolicy {
  clause_playbook_version?: string;
  confidence_threshold?: string;
  require_approval?: boolean;
  force_review?: boolean;
  use_ai?: boolean;
  date_order?: 'DMY' | 'MDY' | null;
  decimal_separator?: '.' | ',' | null;
}
export interface ContractDefinitionInput {
  name: string;
  code: string;
  reviewer: Principal;
  approver?: Principal;
  department?: number | null;
  policy?: ContractPolicy;
}
export interface ContractDefinitionResult {
  definition: Definition;
  version: Version;
}
export interface ContractCorrectionInput {
  corrected_value: string;
  expected_revision: number;
  reason: string;
  evidence?: ContractEvidence[];
}
export function contractValue(value: unknown): string {
  return value == null || value === ''
    ? 'Unknown'
    : typeof value === 'boolean'
      ? value
        ? 'Yes'
        : 'No'
      : typeof value === 'string'
        ? value
        : JSON.stringify(value, null, 2);
}

export interface ContractRow {
  evidence?: ContractEvidence[];
  legal_name?: string | null;
  role?: string | null;
  [key: string]: string | null | ContractEvidence[] | undefined;
}
