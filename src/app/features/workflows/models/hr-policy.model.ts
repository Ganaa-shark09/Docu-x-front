import { Principal } from './workflow.model';
export type HRCategoryKind = 'policy' | 'employee' | 'location';
export interface HRCategory {
  uuid: string;
  kind: HRCategoryKind;
  code: string;
  name: string;
  is_active: boolean;
  scope: 'system' | 'company';
}
export interface HRDraft {
  document_uuid?: string | null;
  effective_from?: string | null;
  effective_until?: string | null;
  employee_categories?: string[];
  locations?: string[];
  priority?: number;
  supersedes?: string | null;
}
export interface HRPolicy {
  uuid: string;
  title: string;
  code: string;
  category_uuid: string;
  department: number | null;
  revision: number;
  draft: HRDraft;
  review_run_uuid: string | null;
}
export interface HRPolicyCreate {
  title: string;
  code: string;
  category_uuid: string;
  department: number | null;
  draft: HRDraft;
}
export interface HREvidence {
  document_uuid: string;
  governance_revision: number;
  page: number | null;
  start: number;
  end: number;
  preview: string;
  method: string;
  boundary: string;
  bounding_box: unknown | null;
  chunk_uuid?: string;
  policy_uuid?: string;
  policy_version_uuid?: string;
  policy_title?: string;
  version?: number;
  effective_from?: string;
  effective_until?: string | null;
  section?: string | null;
  excerpt?: string;
  policy_status?: string;
}
export interface HRSection {
  uuid: string;
  heading: string;
  position: number;
  evidence: HREvidence;
}
export interface HRVersion {
  uuid: string;
  policy_uuid: string;
  title: string;
  number: number;
  category: string;
  department: number | null;
  document_uuid: string;
  effective_from: string;
  effective_until: string | null;
  scope: { employee_categories: string[]; locations: string[] };
  priority: number;
  supersedes: string | null;
  status: 'published' | 'retired';
  effective_status: 'effective' | 'superseded' | 'expired' | 'scheduled' | 'retired';
  revision: number;
  coverage: { complete: boolean; method: string; text_bytes: number; ocr_sufficient: boolean };
  sections?: HRSection[];
}
export type HRPrecedenceDimension = 'priority' | 'department' | 'employee_category' | 'location';
export interface HRPrecedence {
  revision: number;
  precedence: HRPrecedenceDimension[];
}
export interface HRContext {
  as_of?: string;
  category?: string;
  employee_category?: string;
  location?: string;
  department?: number;
  version_uuids?: string[];
}
export interface HRResolution {
  status: 'resolved' | 'review_required' | 'abstained';
  reason: string | null;
  as_of: string;
  mode: 'current' | 'historical';
  versions: HRVersion[];
}
export interface HRAnswerPolicy {
  status: 'answered' | 'abstained' | 'review_required';
  reason: string | null;
  as_of: string;
  mode: 'current' | 'historical';
  grounding: 'verified_source_quotations' | 'none';
  policy_versions: string[];
  warnings: string[];
  evidence: HREvidence[];
}
export interface HRComparisonSide {
  heading: string;
  digest: string;
  evidence: HREvidence;
}
export interface HRComparison {
  left_version_uuid: string;
  right_version_uuid: string;
  changes: {
    position: number;
    kind: 'added' | 'removed' | 'wording_changed';
    before: HRComparisonSide | null;
    after: HRComparisonSide | null;
  }[];
  effective_dates: { before: [string, string | null]; after: [string, string | null] };
  interpretation: string;
}
export interface HRSubmit {
  revision: number;
  reviewer: Principal;
  approver: Principal;
  idempotency_key: string;
}
export const hrLabel = (value: string): string =>
  value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
