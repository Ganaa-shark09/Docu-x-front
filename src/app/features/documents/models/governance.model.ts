export type SecurityClass =
  'public' | 'internal' | 'confidential' | 'highly_confidential' | 'restricted';
export type AccessLevel = 'view' | 'comment' | 'edit' | 'review' | 'approve' | 'admin';
export interface DocumentGovernance {
  owner_user: number | null;
  custodian: number | null;
  department: number | null;
  sensitivity_label: string;
  retention_policy: string | null;
  retention_duration_days: number | null;
  retention_start: string | null;
  retention_expires_at: string | null;
  legal_hold: boolean;
  governance_revision: number;
  retention_status: 'active' | 'expired' | 'legal_hold';
  deletion_eligible: boolean;
}
export type GovernancePatch = Partial<
  Pick<
    DocumentGovernance,
    | 'owner_user'
    | 'custodian'
    | 'department'
    | 'sensitivity_label'
    | 'retention_policy'
    | 'retention_start'
    | 'legal_hold'
  >
> & { expected_revision: number };
export interface SensitivityPolicy {
  uuid: string;
  code: string;
  name: string;
  security_class: SecurityClass;
  minimum_access: AccessLevel;
  allow_ai: boolean;
  allow_export: boolean;
  allow_cloud: boolean;
  is_active: boolean;
}
export interface RetentionPolicy {
  uuid: string;
  name: string;
  duration_days: number;
  is_active: boolean;
}
export interface FieldPolicy {
  uuid: string;
  field_key: string;
  user: number | null;
  role: string;
  can_view: boolean;
  can_use_ai: boolean;
  can_export: boolean;
  masked_view: boolean;
}
export interface Membership {
  uuid: string;
  user: number;
  user_email: string;
  username: string;
  department: number;
  department_name: string;
  role: string;
  is_active: boolean;
}
