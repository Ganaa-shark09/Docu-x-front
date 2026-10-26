import { Json, Principal } from './workflow.model';
export const RFP_ROLES = [
  'rfp_main',
  'rfp_appendix',
  'rfp_terms',
  'rfp_questionnaire',
  'rfp_pricing_template',
  'rfp_addendum',
] as const;
export const RFP_COMPLIANCE = [
  'compliant',
  'partially_compliant',
  'non_compliant',
  'requires_clarification',
  'not_applicable',
  'unanswered',
  'review_required',
] as const;
export type RFPRole = (typeof RFP_ROLES)[number];
export type RFPCompliance = (typeof RFP_COMPLIANCE)[number];
export interface RFPSourceEvidence {
  document_uuid: string;
  governance_revision: number;
  page: number | null;
  start: number;
  end: number;
  preview: string;
  method: string;
  boundary: string;
  bounding_box: Json;
}
export interface RFPClaimEvidence {
  document_uuid: string;
  chunk_uuid: string;
  quote: string;
  source_digest: string;
  governance_revision: number;
  page?: number | null;
}
export type RFPEvidence = RFPSourceEvidence | RFPClaimEvidence;
export interface RFPDeadline {
  kind: string;
  raw: string;
  date: string | null;
  datetime: string | null;
  timezone: string | null;
  review_required: boolean;
  evidence: RFPSourceEvidence;
}
export interface RFPMetadata {
  classified: boolean;
  classification_method: string;
  metadata: Record<
    string,
    { value: string; evidence: RFPSourceEvidence; review_required: boolean }[]
  >;
  deadlines: RFPDeadline[];
  sections: { heading: string; evidence: RFPSourceEvidence }[];
  submission_requirements: {
    text: string;
    mandatory: boolean;
    attachment: boolean;
    evidence: RFPSourceEvidence;
    review_required: boolean;
  }[];
  review_required: boolean;
  coverage: string;
}
export interface RFPSource {
  uuid: string;
  document_uuid: string;
  role: RFPRole;
  source_digest: string;
  governance_revision: number;
}
export interface RFPProject {
  uuid: string;
  title: string;
  department: number | null;
  status: string;
  revision: number;
  extraction_reviewed: boolean;
  run_uuid: string | null;
}
export interface RFPDetail extends RFPProject {
  sources: RFPSource[];
  metadata: Record<string, RFPMetadata>;
  knowledge_document_uuids: string[];
  finalization: RFPFinalization;
}
export interface RFPFinalization {
  require_all_responses?: boolean;
  require_owners?: boolean;
  require_external_disclosure?: boolean;
}
export interface RFPCreate {
  title: string;
  department: number | null;
  sources: { document_uuid: string; role: RFPRole }[];
  knowledge_document_uuids: string[];
  finalization: RFPFinalization;
}
export interface RFPResponse {
  uuid: string;
  number: number;
  text: string | null;
  grounding: 'grounded' | 'partially_grounded' | 'insufficient_evidence' | 'evidence_invalid';
  evidence: RFPClaimEvidence[];
  origin?: 'generated' | 'human';
  reason?: string;
  actor?: number | null;
  created_at?: string;
  externally_shareable?: boolean;
  review_required?: boolean;
}
export interface RFPRequirement {
  uuid: string;
  key: string;
  section: string;
  kind: 'question' | 'requirement';
  category: string;
  text: string;
  mandatory: boolean;
  response_required: boolean;
  evidence: RFPSourceEvidence;
  structure: {
    source_number?: string | null;
    table_cells?: string[];
    limits?: { value: number; unit: string; evidence: RFPSourceEvidence }[];
  };
  assignment: Principal | Record<string, never>;
  compliance: RFPCompliance;
  revision: number;
  response: RFPResponse | null;
}
export interface RFPResponseInput {
  revision: number;
  text: string;
  evidence: RFPClaimEvidence[];
  compliance: RFPCompliance;
  reason: string;
  externally_shareable: boolean;
  assignment?: Principal;
  category?: string;
}
export interface RFPAttachment {
  uuid: string;
  text: string;
  mandatory: boolean;
  evidence: RFPSourceEvidence;
  document_uuid: string | null;
  reviewed: boolean;
  revision: number;
  assignment: Principal | Record<string, never>;
}
export interface RFPCorrectionInput {
  revision: number;
  source_uuid: string;
  kind: 'classification' | 'deadline' | 'requirement' | 'legal_analysis';
  key: string;
  value: Json;
  evidence: RFPSourceEvidence;
  reason: string;
}
export interface RFPCorrection extends Omit<RFPCorrectionInput, 'revision'> {
  uuid: string;
  number: number;
  actor: number | null;
  created_at: string;
}
export interface RFPOutput {
  uuid: string;
  number: number;
  project_revision: number;
  created_at: string;
}
export interface RFPExport {
  output_uuid: string;
  version: number;
  external: boolean;
  schema_version: number;
  title: string;
  metadata?: Record<string, Json>;
  responses: {
    item_uuid: string;
    key: string;
    section: string;
    requirement: string;
    compliance: RFPCompliance;
    response_uuid: string | null;
    response_version: number | null;
    text: string;
    evidence?: RFPClaimEvidence[];
    externally_shareable: boolean;
  }[];
  sections: { heading: string; response_versions: string[] }[];
  deadlines: {
    document_uuid: string;
    kind: string;
    raw: string;
    date: string | null;
    datetime: string | null;
    timezone: string | null;
    correction_uuid?: string | null;
  }[];
  correction_versions?: string[];
  approval_run_uuid: string;
  approval_uuid: string;
  attachments: string[];
}
export function rfpLabel(value: string): string {
  return value.replace(/^rfp_/, '').replaceAll('_', ' ');
}
