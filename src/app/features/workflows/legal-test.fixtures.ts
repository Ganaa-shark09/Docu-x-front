import {
  ClauseAnalysis,
  ClauseType,
  Playbook,
  PlaybookVersion,
  ClauseEvidence,
  ClauseRule,
} from './models/legal-clause.model';
import { uuid, doc, doc2, run } from './workflow-test.fixtures';
export const legalRun = { ...run, documents: [doc] };
export const legalProof: ClauseEvidence = {
  document_uuid: doc,
  governance_revision: 3,
  page: 2,
  preview: 'Liability is capped at 100000.50',
  boundary: 'exact_text_offsets',
  bounding_box: null,
  start: 10,
  end: 40,
  method: 'explicit_source',
};
export const legalType: ClauseType = {
  uuid: doc2,
  code: 'liability',
  name: 'Liability cap',
  category: 'commercial',
  description: 'Liability provisions',
  aliases: ['Liability'],
  document_types: ['contract'],
  fact_schema: {
    amount: { type: 'decimal' },
    unlimited: { type: 'boolean' },
    notice: { type: 'text' },
    deadline: { type: 'date' },
    basis: { type: 'enum', values: ['fixed', 'fees'] },
  },
  is_active: true,
  scope: 'system',
};
export const legalRule: ClauseRule = {
  code: 'liability_cap',
  clause_type: doc2,
  requirement: 'required',
  severity: 'high',
  preferred: [{ field: 'amount', operator: 'lte', value: '100000.50' }],
  fallback: [{ field: 'amount', operator: 'lte', value: '200000' }],
  prohibited: [{ field: 'unlimited', operator: 'eq', value: true }],
  requires_approval: true,
};
export const legalBook: Playbook = {
  uuid,
  name: 'Supplier policy',
  description: 'Company policy',
  department_id: null,
  draft: { rules: [legalRule], document_types: ['contract'], effective_from: '2026-10-01' },
  revision: 4,
  is_active: true,
  active_version_uuid: uuid,
};
export const legalVersion: PlaybookVersion = {
  uuid,
  playbook_uuid: uuid,
  number: 2,
  rules: [legalRule],
  taxonomy: {
    [doc2]: {
      code: legalType.code,
      name: legalType.name,
      category: legalType.category,
      aliases: legalType.aliases,
      document_types: legalType.document_types,
      fact_schema: legalType.fact_schema,
    },
  },
  document_types: ['contract'],
  effective_from: '2026-10-01',
  effective_until: null,
  created_at: '2026-10-01T00:00:00Z',
};
export const legalAnalysis: ClauseAnalysis = {
  schema_version: 1,
  analysis_uuid: uuid,
  workflow_uuid: uuid,
  document_uuid: doc,
  revision: 1,
  source_digest: 'actual-source-digest',
  playbook_version_uuid: uuid,
  coverage: { complete: true, method: 'source_text', text_bytes: 1000 },
  context: { currency: 'INR', contract_value: '12345678901234567890.1200' },
  clauses: [
    {
      uuid: doc2,
      clause_type: doc2,
      heading: 'Liability',
      facts: {
        amount: {
          value: '100000.50',
          raw_value: 'Liability is capped at 100000.50',
          evidence: [legalProof],
        },
      },
      evidence: [legalProof],
      confidence: '0.81',
      detection_method: 'taxonomy_structure',
      correction_uuid: null,
      review_state: 'unreviewed',
    },
  ],
  deviations: [
    {
      uuid: doc,
      clause__uuid: doc2,
      rule_code: 'liability_cap',
      comparison: 'deviation',
      severity: 'high',
      observed: { context: {}, facts: { amount: '100000.50' } },
      expected: legalRule,
      evidence: [legalProof],
      requires_approval: true,
    },
  ],
  decisions: [],
};
