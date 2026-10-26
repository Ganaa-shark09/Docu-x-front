import {
  ContractReview,
  ContractOutput,
  ContractProvenance,
  ContractKey,
} from './models/contract.model';
import { run, definition, version, uuid, doc } from './workflow-test.fixtures';
export const contractRun = { ...run, documents: [doc] };
export const contractDefinition = { ...definition, workflow_type: 'contract_review' };
export const contractVersion = {
  ...version,
  steps: [
    ...version.steps,
    {
      uuid,
      key: 'metadata',
      name: 'Extract metadata',
      step_type: 'processing' as const,
      configuration: { adapter: 'contract_review', options: { confidence_threshold: '0.85' } },
    },
  ],
};
export const proof = {
  document_uuid: doc,
  page: 2,
  start: 10,
  end: 40,
  preview: 'Acme service agreement',
};
export const contractFact: ContractProvenance = {
  field_uuid: uuid,
  raw_value: 'Acme service agreement',
  normalized_value: 'Acme service agreement',
  corrected_value: null,
  confidence: '0.8',
  confidence_basis: 'literal_label',
  review_status: 'unreviewed',
  reviewed_by: null,
  evidence: [proof],
  original_evidence: [proof],
};
export const contract: ContractReview = {
  uuid,
  workflow_uuid: uuid,
  document_uuid: doc,
  extraction_uuid: uuid,
  revision: 1,
  normalized: {
    contract_title: 'Acme service agreement',
    contract_type: 'service_agreement',
    effective_date: '2026-10-01',
    expiration_date: '2027-10-01',
    governing_law: 'England and Wales',
    currency: 'INR',
    contract_value: '12345678901234567890.1200',
    auto_renewal: true,
    renewal_mechanism: 'Automatic',
    renewal_term: '12 months',
    notice_deadline: '2027-09-01',
    termination_for_cause: 'Material breach',
    termination_notice_period: '30 days',
    parties: [
      {
        legal_name: 'Acme',
        role: 'vendor',
        address: null,
        jurisdiction: null,
        registration_identifier: null,
        signatory: null,
      },
      {
        legal_name: 'Beta',
        role: 'customer',
        address: null,
        jurisdiction: null,
        registration_identifier: null,
        signatory: null,
      },
      {
        legal_name: 'Gamma',
        role: 'supplier',
        address: null,
        jurisdiction: null,
        registration_identifier: null,
        signatory: null,
      },
    ],
    obligations: [
      {
        party: 'Acme',
        action: 'Provide services',
        timing: 'Monthly',
        timing_type: 'recurring',
        due_date: null,
        condition: null,
        frequency: 'Monthly',
      },
    ],
    key_clauses: [
      {
        category: 'termination',
        text: 'Either party may terminate on material breach.',
        section_heading: 'Section 9',
      },
    ],
  },
  classification: { document_type: 'contract', document_confidence: 90, uncertain: false },
  validation: [],
  coverage: { complete: true, method: 'source_text', text_bytes: 1000 },
  effective_confidence: '0.8',
  finalized_at: null,
  field_provenance: Object.fromEntries(
    [
      'contract_title',
      'effective_date',
      'parties',
      'obligations',
      'key_clauses',
      'governing_law',
      'contract_value',
    ].map((key) => [key, { ...contractFact }]),
  ) as Partial<Record<ContractKey, ContractProvenance>>,
  final_output: null,
};
export const contractOutput: ContractOutput = {
  uuid,
  revision: 1,
  schema_version: 1,
  digest: 'digest',
  created_at: '2026-10-08T00:00:00Z',
  data: {
    schema_version: 1,
    contract: { ...contract.normalized, contract_title: 'Reviewed contract' },
    source: { document_uuid: doc, workflow_uuid: uuid, extraction_uuid: uuid, revision: 1 },
    field_provenance: contract.field_provenance,
    coverage: contract.coverage,
    review_status: 'reviewed',
    approval_status: 'approved',
    approval_uuid: uuid,
    finalized_at: '2026-10-08T00:00:00Z',
    risks: [],
    missing_information: [],
    validation: [],
  },
};
