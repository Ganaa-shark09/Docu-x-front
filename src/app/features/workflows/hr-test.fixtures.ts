import { HRPolicy, HRVersion, HRCategory, HREvidence } from './models/hr-policy.model';
export const hrId = '11111111-1111-4111-8111-111111111111';
export const hrDoc = '22222222-2222-4222-8222-222222222222';
export const hrOther = '33333333-3333-4333-8333-333333333333';
export const hrProof: HREvidence = {
  document_uuid: hrDoc,
  governance_revision: 3,
  page: 2,
  start: 10,
  end: 50,
  preview: 'Employees receive twenty days of annual leave.',
  method: 'explicit_source',
  boundary: 'exact_text_offsets',
  bounding_box: null,
};
export const hrCategory: HRCategory = {
  uuid: hrId,
  kind: 'policy',
  code: 'leave',
  name: 'Leave',
  is_active: true,
  scope: 'system',
};
export const hrPolicy: HRPolicy = {
  uuid: hrId,
  title: 'Leave policy',
  code: 'leave-policy',
  category_uuid: hrId,
  department: null,
  revision: 3,
  draft: {
    document_uuid: hrDoc,
    effective_from: '2026-10-01',
    employee_categories: ['permanent'],
    locations: ['india'],
    priority: 0,
  },
  review_run_uuid: null,
};
export const hrVersion: HRVersion = {
  uuid: hrId,
  policy_uuid: hrId,
  title: 'Leave policy',
  number: 2,
  category: 'leave',
  department: 1,
  document_uuid: hrDoc,
  effective_from: '2026-10-01',
  effective_until: null,
  scope: { employee_categories: ['permanent'], locations: ['india'] },
  priority: 0,
  supersedes: null,
  status: 'published',
  effective_status: 'effective',
  revision: 1,
  coverage: { complete: true, method: 'source_text', text_bytes: 120, ocr_sufficient: true },
  sections: [{ uuid: hrId, heading: 'Annual leave', position: 0, evidence: hrProof }],
};
export const hrPage = <T>(results: T[]) => ({
  count: results.length,
  next: null,
  previous: null,
  results,
});
