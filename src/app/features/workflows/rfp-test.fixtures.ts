import { Page, Run } from './models/workflow.model';
import {
  RFPDetail,
  RFPRequirement,
  RFPSourceEvidence,
  RFPClaimEvidence,
  RFPOutput,
  RFPExport,
  RFPAttachment,
} from './models/rfp.model';
import { run } from './workflow-test.fixtures';
export const rfpId = '11111111-1111-4111-8111-111111111111',
  rfpDoc = '22222222-2222-4222-8222-222222222222',
  rfpKnowledge = '33333333-3333-4333-8333-333333333333',
  rfpSource = '44444444-4444-4444-8444-444444444444';
export const rfpProof: RFPSourceEvidence = {
  document_uuid: rfpDoc,
  governance_revision: 3,
  page: 2,
  start: 0,
  end: 50,
  preview: 'Describe your security capability in 100 words.',
  method: 'explicit_source',
  boundary: 'exact_text_offsets',
  bounding_box: null,
};
export const rfpClaim: RFPClaimEvidence = {
  document_uuid: rfpKnowledge,
  chunk_uuid: rfpKnowledge,
  quote: 'Company security capability is documented and reviewed.',
  source_digest: 'a'.repeat(64),
  governance_revision: 4,
  page: 1,
};
export const rfpRun: Run = {
  ...run,
  uuid: rfpId,
  status: 'review_required',
  current_step: 'review_proposal',
  documents: [rfpDoc],
  capabilities: { ...run.capabilities, review: true },
};
export const rfpProject: RFPDetail = {
  uuid: rfpId,
  title: 'Secure procurement proposal',
  department: null,
  status: 'review',
  revision: 5,
  extraction_reviewed: false,
  run_uuid: rfpId,
  knowledge_document_uuids: [rfpKnowledge],
  finalization: { require_owners: true },
  sources: [
    {
      uuid: rfpSource,
      document_uuid: rfpDoc,
      role: 'rfp_main',
      source_digest: 'b'.repeat(64),
      governance_revision: 3,
    },
    {
      uuid: rfpKnowledge,
      document_uuid: rfpKnowledge,
      role: 'rfp_terms',
      source_digest: 'c'.repeat(64),
      governance_revision: 2,
    },
  ],
  metadata: {
    [rfpDoc]: {
      classified: true,
      classification_method: 'explicit_source_heading',
      metadata: {
        issuer: [{ value: 'Acme procurement', evidence: rfpProof, review_required: true }],
        reference: [{ value: 'RFP-2026-18', evidence: rfpProof, review_required: true }],
      },
      deadlines: [
        {
          kind: 'response_deadline',
          raw: '12/11/2026',
          date: null,
          datetime: null,
          timezone: null,
          review_required: true,
          evidence: rfpProof,
        },
      ],
      sections: [{ heading: 'Security', evidence: rfpProof }],
      submission_requirements: [
        {
          text: 'Signed security schedule required',
          mandatory: true,
          attachment: true,
          evidence: rfpProof,
          review_required: true,
        },
      ],
      review_required: true,
      coverage: 'structured_candidates',
    },
  },
};
export const rfpItem: RFPRequirement = {
  uuid: rfpId,
  key: 'stable-requirement-identifier',
  section: 'Security',
  kind: 'question',
  category: 'security',
  text: rfpProof.preview,
  mandatory: true,
  response_required: true,
  evidence: rfpProof,
  structure: { source_number: 'Q1', limits: [{ value: 100, unit: 'words', evidence: rfpProof }] },
  assignment: { user: 1 },
  compliance: 'partially_compliant',
  revision: 7,
  response: {
    uuid: rfpId,
    number: 2,
    text: rfpClaim.quote,
    origin: 'generated',
    grounding: 'partially_grounded',
    evidence: [rfpClaim],
    reason: 'Draft',
    actor: 1,
    created_at: '2026-10-11T09:00:00Z',
    externally_shareable: false,
  },
};
export const rfpAttachment: RFPAttachment = {
  uuid: rfpId,
  text: 'Signed security schedule',
  mandatory: true,
  evidence: rfpProof,
  document_uuid: null,
  reviewed: false,
  revision: 2,
  assignment: {},
};
export const rfpOutput: RFPOutput = {
  uuid: rfpId,
  number: 2,
  project_revision: 8,
  created_at: '2026-10-11T09:00:00Z',
};
export const rfpExport: RFPExport = {
  output_uuid: rfpId,
  version: 2,
  external: true,
  schema_version: 1,
  title: 'Approved proposal',
  responses: [
    {
      item_uuid: rfpId,
      key: rfpItem.key,
      section: 'Security',
      requirement: rfpItem.text,
      compliance: 'compliant',
      response_uuid: rfpId,
      response_version: 3,
      text: 'Approved response text',
      externally_shareable: true,
    },
  ],
  sections: [{ heading: 'Security', response_versions: [rfpId] }],
  deadlines: [],
  approval_run_uuid: rfpId,
  approval_uuid: rfpId,
  attachments: [],
};
export const rfpPage = <T>(results: T[], more = false): Page<T> => ({
  count: results.length,
  next: more ? '?page=2' : null,
  previous: null,
  results,
});
export const rfpMembership = {
  uuid: rfpId,
  user: 1,
  username: 'Reviewer',
  user_email: 'reviewer@company.test',
  department: 1,
  department_name: 'Procurement',
  role: 'department_admin',
  is_active: true,
};
