export type ProofValue =
  string | number | boolean | null | ProofValue[] | { [key: string]: ProofValue };
export type Validity = 'valid' | 'stale' | 'expired' | 'invalid' | 'insufficient';
export interface Evidence {
  uuid: string;
  source: {
    uuid: string;
    kind: string;
    reference: string;
    identity: string;
    pin: { documents: { document_uuid: string; governance_revision: number }[] };
  };
  locator_type: string;
  locator: Record<string, unknown>;
  precision: string;
  method: string;
  disclosure: string;
  validity: Validity;
  code: string;
  captured_at: string;
  review_state: string;
  review_revision: number;
  valid_from: string | null;
  valid_until: string | null;
  review_due_at: string | null;
}
export interface Citation extends Evidence {
  documents: { uuid: string; title: string }[];
  excerpt: string | null;
}
export interface ClaimSummary {
  uuid: string;
  key: string;
  domain: string;
  value: ProofValue;
  revision: number;
  coverage: string;
}
export interface ClaimNode {
  uuid: string;
  claim_uuid: string;
  domain: string;
  key: string;
  revision: number;
  value: ProofValue;
  review_state: string;
  reason: string | null;
  created_at: string;
  evidence: { evidence_uuid: string; role: string }[];
  previous_uuid: string | null;
  derivation: { operation: string; parameters: Record<string, unknown>; inputs: string[] } | null;
}
export interface ProofGraph {
  claim_uuid: string;
  current_revision: number;
  coverage: string;
  claims: ClaimNode[];
  evidence: Evidence[];
  purpose: 'traceability';
}
export interface OutputField {
  kind: string;
  source_uuid: string;
  path: (string | number)[];
}
export interface ProofContext {
  output_fields?: OutputField[];
  claims: ClaimSummary[];
  evidence: Evidence[];
  next: boolean;
  previous: boolean;
}
export interface ValidationHistory {
  number: number;
  status: string;
  code: string;
  actor: number | null;
  created_at: string;
}
export interface HistoryPage {
  results: ValidationHistory[];
  next: string | null;
  previous: string | null;
  count: number;
}
