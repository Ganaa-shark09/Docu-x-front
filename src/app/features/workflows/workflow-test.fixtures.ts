import { Artifact, Definition, Finding, Run, Version, StepRun } from './models/workflow.model';
export const uuid = '11111111-1111-4111-8111-111111111111';
export const doc = '22222222-2222-4222-8222-222222222222';
export const doc2 = '33333333-3333-4333-8333-333333333333';
export const definition: Definition = {
  uuid,
  name: 'Contract review',
  code: 'contract-review',
  description: 'Review internal documents',
  workflow_type: 'generic',
  department: null,
  is_active: true,
  latest_version: { uuid, number: 2 },
  capabilities: { administer: true, start: true },
};
export const version: Version = {
  uuid,
  definition: 1,
  number: 2,
  entry_step: 'review',
  allowed_document_types: [],
  configuration: {},
  steps: [
    {
      uuid,
      key: 'review',
      name: 'Review documents',
      step_type: 'human_review',
      configuration: { assignment: { user: 1 } },
    },
  ],
  transitions: [],
};
export const run: Run = {
  uuid,
  definition_uuid: uuid,
  version_uuid: uuid,
  department: null,
  initiated_by: 1,
  status: 'review_required',
  current_step: 'review',
  started_at: '2026-10-01T00:00:00Z',
  completed_at: null,
  error_type: '',
  error_message: '',
  correlation_id: uuid,
  revision: 3,
  documents: [doc, doc2],
  capabilities: {
    view: true,
    cancel: true,
    assign: true,
    review: true,
    approve: false,
    reject: true,
    resolve_exception: false,
    comment: true,
    administer: true,
    request_changes: true,
  },
};
export const step: StepRun = {
  uuid,
  key: 'review',
  step_type: 'human_review',
  status: 'waiting',
  started_at: null,
  completed_at: null,
  attempt: 1,
  error_type: '',
  error_message: '',
  assignment: { user: 1, department: null, role: '' },
  approval_uuid: uuid,
};
export const finding: Finding = {
  uuid,
  step_run: 1,
  category: 'risk',
  severity: 'high',
  status: 'open',
  title: 'Possible risk',
  description: 'Please review',
  data: {},
  confidence: 0.7,
  evidence: [{ document_uuid: doc, page: 2 }],
  review_state: 'unreviewed',
  owner: null,
};
export const artifact: Artifact = {
  uuid,
  step_run: 1,
  kind: 'review_report',
  data: { protected: 'content' },
  evidence: [],
  created_at: '2026-10-01T00:00:00Z',
};
export const page = <T>(results: T[]) => ({
  count: results.length,
  next: null,
  previous: null,
  results,
});
