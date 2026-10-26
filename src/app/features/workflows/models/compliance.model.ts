import { Json, Principal } from './workflow.model';
export type Outcome =
  | 'satisfied'
  | 'partially_satisfied'
  | 'not_satisfied'
  | 'insufficient_evidence'
  | 'not_applicable'
  | 'review_required';
export type Applicability =
  'applicable' | 'not_applicable' | 'conditionally_applicable' | 'undetermined';
export type Validity =
  'valid' | 'stale' | 'expired' | 'revoked' | 'insufficient' | 'pending_review';
export type SourceKind =
  | 'document'
  | 'hr_policy_version'
  | 'contract_output'
  | 'clause_output'
  | 'finance_output'
  | 'rfp_output'
  | 'workflow_artifact'
  | 'invoice_output';
export interface RequirementInput {
  code: string;
  title: string;
  category: string;
  type: string;
  obligation: 'mandatory' | 'optional' | 'conditional';
  parent: string | null;
  applicability: { dimension?: string; values?: string[] };
  source: Record<string, string>;
}
export interface Requirement extends Omit<RequirementInput, 'parent'> {
  uuid: string;
  parent: string | null;
  framework_version_uuid?: string;
}
export interface FrameworkDraft {
  requirements: RequirementInput[];
  policy: { severity: string; allow_risk_acceptance: boolean; require_na_approval: boolean };
}
export interface Framework {
  uuid: string;
  code: string;
  name: string;
  description: string;
  source: string;
  jurisdiction: string;
  scope: 'system' | 'company';
  revision: number;
  is_active: boolean;
  active_version_uuid: string | null;
  draft: FrameworkDraft;
}
export interface FrameworkVersion {
  uuid: string;
  number: number;
  metadata: Record<string, Json>;
  digest: string;
  state: 'active' | 'superseded' | 'retired';
  requirements: Requirement[];
}
export interface ControlDefinition {
  description: string;
  objective: string;
  owner: Principal;
  type: string;
  frequency: string;
  evidence_expectations: string[];
  tests: string[];
  status: string;
  effective_from?: string;
  effective_until?: string;
}
export interface Control {
  uuid: string;
  code: string;
  name: string;
  department: number | null;
  definition: ControlDefinition;
  revision: number;
  is_active: boolean;
}
export interface Mapping {
  uuid: string;
  requirement_uuid: string;
  framework_version_uuid: string;
  is_active: boolean;
}
export interface Scope {
  start: string;
  end: string;
  document_uuids: string[];
  control_uuids: string[];
  business_units: string[];
  locations: string[];
  systems: string[];
}
export interface FrozenMapping {
  requirement_uuid: string;
  control_uuid: string;
  control_revision: number;
  code: string;
  name: string;
  department: number | null;
  definition: ControlDefinition;
}
export interface Assessment {
  uuid: string;
  title: string;
  department: number | null;
  revision: number;
  framework_version_uuid: string;
  status: string;
  run_uuid: string | null;
}
export interface Row {
  target: string;
  requirement_uuid: string;
  control_uuid: string | null;
  applicability: Applicability;
  outcome: Outcome;
  reviewed_outcome?: Outcome | null;
  historical_reviewed_outcome?: Outcome | null;
  review_uuid?: string | null;
  checks: Record<string, boolean>;
  evidence: string[];
  date_basis: string;
  finding_uuid: string | null;
}
export interface Evidence {
  uuid: string;
  requirement_uuid: string;
  control_uuid: string;
  source_kind: SourceKind;
  source_uuid: string;
  pin: {
    source_uuid: string;
    source_kind: SourceKind;
    digest: string;
    approved: boolean;
    documents: {
      uuid: string;
      governance_revision: number;
      checksum: string;
      file_digest: string;
      text_digest: string;
      complete: boolean;
      legal_hold: boolean;
    }[];
    version?: number;
    revision?: number;
    domain_uuid?: string;
    policy_uuid?: string;
    run_uuid?: string;
  };
  dates: Partial<Record<'issued' | 'effective' | 'expires' | 'review_due', string>>;
  location: Record<string, Json>;
  state: Validity;
  review_uuid: string | null;
  externally_shareable: boolean;
  collected_at: string;
  collected_by: number;
}
export interface Detail extends Assessment {
  assessment_uuid: string;
  evidence_revision: number;
  framework_version: number;
  framework: Record<string, Json>;
  scope: Scope;
  requirements: Requirement[];
  mappings: FrozenMapping[];
  evaluation_uuid: string | null;
  evaluation_current: boolean;
  rows: Row[];
  counts: Partial<Record<Outcome, number>>;
  coverage: {
    requirements: number;
    control_assessments: number;
    reviewed: number;
    satisfied: number;
  };
  evidence: Record<string, Evidence>;
  assistance_only: boolean;
  assurance: string;
}
export type DecisionKind =
  'evidence' | 'applicability' | 'control' | 'evidence_request' | 'remediation' | 'risk_acceptance';
export interface DecisionData {
  owner?: Principal;
  due?: string;
  request_uuid?: string;
  evidence_uuids?: string[];
  expires?: string;
  review_due?: string;
  assessment_revision?: number;
}
export interface Decision {
  uuid: string;
  kind: DecisionKind;
  target: string;
  outcome: string;
  reason: string;
  actor: number;
  created_at: string;
  data: DecisionData;
  evaluation_uuid: string | null;
}
export interface DecisionInput {
  revision: number;
  kind: DecisionKind;
  target: string;
  outcome: string;
  reason: string;
  data: DecisionData;
  idempotency_key: string;
}
export interface EvidenceInput {
  revision: number;
  requirement_uuid: string;
  control_uuid: string;
  source_kind: SourceKind;
  source_uuid: string;
  dates: Evidence['dates'];
  location: Record<string, Json>;
  externally_shareable: boolean;
  idempotency_key: string;
}
export interface CreateAssessment {
  title: string;
  department: number | null;
  framework_version_uuid: string;
  scope: Scope;
  previous_uuid?: string;
  idempotency_key: string;
}
export interface Output {
  uuid: string;
  digest: string;
  created_at: string;
  data: Omit<Detail, 'uuid' | 'title' | 'department'> & {
    schema_version: number;
    output_version: number;
    approval_uuid: string;
    previous_assessment_uuid: string | null;
    framework_digest: string;
    history: Decision[];
    findings: Json[];
    exceptions: Json[];
  };
}
export interface Evaluation {
  uuid: string;
  fingerprint: string;
  evidence_revision: number;
  created_at: string;
  data: {
    rows: Row[];
    counts: Record<string, number>;
    evidence: Record<string, Evidence>;
    date_basis: string;
  };
}
export interface Discovery {
  method: string;
  advisory_only: boolean;
  candidates: {
    document_uuid: string;
    start: number;
    end: number;
    quote: string;
    status: string;
  }[];
}
export const outcomes: Outcome[] = [
  'satisfied',
  'partially_satisfied',
  'not_satisfied',
  'insufficient_evidence',
  'not_applicable',
  'review_required',
];
export const validities: Validity[] = [
  'valid',
  'stale',
  'expired',
  'revoked',
  'insufficient',
  'pending_review',
];
export const sourceKinds: SourceKind[] = [
  'document',
  'hr_policy_version',
  'contract_output',
  'clause_output',
  'finance_output',
  'rfp_output',
  'workflow_artifact',
  'invoice_output',
];
export const tests = [
  'missing_evidence',
  'expired_evidence',
  'missing_approval',
  'overdue_review',
  'unmapped_control',
];
export const label = (v: string | null | undefined) => (v || 'Not provided').replaceAll('_', ' ');
