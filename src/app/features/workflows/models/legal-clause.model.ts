import { Definition, Version, Principal, Run, Page } from './workflow.model';
export type FactValue = string | boolean | null;
export type FactKind = 'text' | 'decimal' | 'date' | 'boolean' | 'enum';
export interface FactSpec {
  type: FactKind;
  values?: string[];
}
export type FactSchema = Record<string, FactSpec>;
export interface ClauseType {
  uuid: string;
  code: string;
  name: string;
  category: string;
  description: string;
  aliases: string[];
  document_types: string[];
  fact_schema: FactSchema;
  is_active: boolean;
  scope: 'system' | 'company';
}
export type TaxonomyInput = Omit<ClauseType, 'uuid' | 'scope'>;
export interface ClauseEvidence {
  document_uuid: string;
  governance_revision: number;
  page: number | null;
  preview: string;
  boundary: 'exact_text_offsets' | 'approximate_chunk';
  bounding_box: null;
  start?: number;
  end?: number;
  method?: string;
  chunk_uuid?: string;
}
export interface ClauseFact {
  value: FactValue;
  raw_value: string;
  evidence: ClauseEvidence[];
}
export type ClauseFacts = Record<string, ClauseFact>;
export type Requirement = 'required' | 'optional' | 'prohibited';
export type Severity = 'info' | 'low' | 'medium' | 'high' | 'critical';
export type Operator = 'eq' | 'ne' | 'gte' | 'lte' | 'contains';
export interface Predicate {
  field: string;
  operator: Operator;
  value: string | boolean;
}
export interface ClauseRule {
  code: string;
  clause_type: string;
  requirement: Requirement;
  when?: Predicate[];
  preferred?: Predicate[];
  fallback?: Predicate[];
  prohibited?: Predicate[];
  severity?: Severity;
  requires_approval?: boolean;
}
export interface PlaybookDraft {
  rules?: ClauseRule[];
  document_types?: string[];
  effective_from?: string;
  effective_until?: string | null;
}
export interface Playbook {
  uuid: string;
  name: string;
  description: string;
  department_id: number | null;
  draft: PlaybookDraft;
  revision: number;
  is_active: boolean;
  active_version_uuid: string | null;
}
export interface PlaybookVersion {
  uuid: string;
  playbook_uuid: string;
  number: number;
  rules: ClauseRule[];
  taxonomy: Record<string, Omit<ClauseType, 'uuid' | 'scope' | 'description' | 'is_active'>>;
  document_types: string[];
  effective_from: string;
  effective_until: string | null;
  created_at: string;
}
export type Comparison =
  | 'matching'
  | 'preferred'
  | 'acceptable_fallback'
  | 'deviation'
  | 'prohibited'
  | 'ambiguous'
  | 'coverage_insufficient'
  | 'not_detected'
  | 'not_applicable';
export type LegalDecision =
  | 'confirmed'
  | 'dismissed'
  | 'accepted'
  | 'negotiation_required'
  | 'exception_approved'
  | 'needs_more_information';
export interface ClauseInstance {
  uuid: string;
  clause_type: string;
  heading: string;
  facts: ClauseFacts;
  evidence: ClauseEvidence[];
  confidence: string | null;
  detection_method: string;
  correction_uuid: string | null;
  review_state: LegalDecision | 'unreviewed';
}
export interface ClauseDeviation {
  uuid: string;
  clause__uuid: string | null;
  rule_code: string;
  comparison: Comparison;
  severity: Severity;
  observed: { context: Record<string, FactValue>; facts: Record<string, FactValue> };
  expected: ClauseRule;
  evidence: ClauseEvidence[];
  requires_approval: boolean;
}
export interface ClauseDecision {
  target: string;
  target_type: 'clause' | 'deviation';
  decision: LegalDecision;
  actor_id: number | null;
  reason: string;
  created_at: string;
}
export interface ClauseAnalysis {
  schema_version: number;
  analysis_uuid: string;
  workflow_uuid: string;
  document_uuid: string;
  revision: number;
  source_digest: string;
  playbook_version_uuid: string;
  coverage: {
    complete: boolean;
    method?: string;
    text_bytes?: number;
    ocr_sufficient?: boolean;
    section_count?: number;
    chunk_count?: number;
  };
  context: Record<string, FactValue>;
  clauses: ClauseInstance[];
  deviations: ClauseDeviation[];
  decisions: ClauseDecision[];
}
export interface ClauseCorrection {
  uuid: string;
  clause_uuid: string;
  revision: number;
  clause_type: string;
  facts: ClauseFacts;
  evidence: ClauseEvidence[];
  actor_id: number | null;
  reason: string;
  created_at: string;
  original: { clause_type: string; facts: ClauseFacts; evidence: ClauseEvidence[] };
}
export interface LegalOutput {
  uuid: string;
  revision: number;
  data: ClauseAnalysis & { approval_uuid?: string | null };
  digest: string;
  created_at: string;
}
export interface DecisionInput {
  target: string;
  target_type: 'clause' | 'deviation';
  decision: LegalDecision;
  reason: string;
  expected_revision: number;
  idempotency_key: string;
}
export interface CorrectionInput {
  clause: string;
  clause_type: string;
  facts: ClauseFacts;
  evidence: ClauseEvidence[];
  reason: string;
  expected_revision: number;
}
export interface LegalDefinitionInput {
  name: string;
  code: string;
  department: number | null;
  reviewer: Principal;
  approver?: Principal;
  policy: { playbook_version?: string | null; use_ai: boolean };
}
export interface LegalDefinitionResult {
  definition: Definition;
  version: Version;
}
export type LegalPage<T> = Page<T>;
export type LegalRun = Run;
export const CONDITIONS: FactSchema = {
  contract_type: { type: 'text' },
  jurisdiction: { type: 'text' },
  governing_law: { type: 'text' },
  currency: { type: 'text' },
  contract_value: { type: 'decimal' },
  data_processing: { type: 'boolean' },
};
export const DECISIONS: LegalDecision[] = [
  'confirmed',
  'dismissed',
  'accepted',
  'negotiation_required',
  'exception_approved',
  'needs_more_information',
];
export const SEVERITIES: Severity[] = ['info', 'low', 'medium', 'high', 'critical'];
export function factValue(value: FactValue | undefined): string {
  return value == null ? 'Unknown' : typeof value === 'boolean' ? (value ? 'Yes' : 'No') : value;
}
export function comparisonLabel(value: Comparison, complete = true): string {
  return value === 'not_detected' && !complete
    ? 'Coverage insufficient'
    : value === 'not_detected'
      ? 'Required clause not detected — review required'
      : value.replaceAll('_', ' ');
}
export function operators(spec?: FactSpec): Operator[] {
  return spec?.type === 'decimal' || spec?.type === 'date'
    ? ['eq', 'ne', 'gte', 'lte']
    : spec?.type === 'text'
      ? ['eq', 'ne', 'contains']
      : ['eq', 'ne'];
}
export function validScalar(value: FactValue, spec: FactSpec, nullable = false): boolean {
  if (value === null) return nullable;
  if (spec.type === 'boolean') return typeof value === 'boolean';
  if (typeof value !== 'string' || !value || value.length > 2000) return false;
  if (spec.type === 'decimal') return /^-?\d{1,24}(?:\.\d{1,12})?$/.test(value);
  if (spec.type === 'date')
    return (
      /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      !Number.isNaN(Date.parse(value)) &&
      new Date(value).toISOString().slice(0, 10) === value
    );
  if (spec.type === 'enum') return !!spec.values?.includes(value);
  return true;
}
export function validRules(rules: ClauseRule[], taxonomy: ClauseType[]): boolean {
  const codes = new Set<string>();
  if (!rules.length || rules.length > 64) return false;
  return rules.every((r) => {
    const type = taxonomy.find((t) => t.uuid === r.clause_type && t.is_active);
    if (!type || !/^[a-z][a-z0-9_]{0,79}$/.test(r.code) || codes.has(r.code)) return false;
    codes.add(r.code);
    return (
      ['required', 'optional', 'prohibited'].includes(r.requirement) &&
      SEVERITIES.includes(r.severity || 'medium') &&
      (['when', 'preferred', 'fallback', 'prohibited'] as const).every(
        (k) =>
          (r[k] || []).length <= 16 &&
          (r[k] || []).every((p) => {
            const spec = (k === 'when' ? CONDITIONS : type.fact_schema)[p.field];
            return !!spec && operators(spec).includes(p.operator) && validScalar(p.value, spec);
          }),
      ) &&
      (!r.fallback?.length || !!r.preferred?.length) &&
      !(r.preferred?.length && JSON.stringify(r.preferred) === JSON.stringify(r.prohibited)) &&
      !(r.fallback?.length && JSON.stringify(r.fallback) === JSON.stringify(r.prohibited)) &&
      (r.requires_approval === undefined || typeof r.requires_approval === 'boolean')
    );
  });
}
