import { Json, Principal, RunStatus } from './workflow.model';
export type DecimalString = string;
export interface FinanceScope {
  start: string;
  end: string;
  period: 'custom' | 'monthly' | 'quarterly' | 'annual';
  fiscal_year?: string;
  period_closed?: boolean;
  objectives?: string[];
  transaction_types?: string[];
  vendors?: string[];
  accounts?: string[];
  cost_centers?: string[];
  business_units?: string[];
}
export type FinanceMethod =
  'random' | 'systematic' | 'high_value' | 'value_threshold' | 'risk_based' | 'stratified';
export interface FinanceSampling {
  method: FinanceMethod;
  size: number;
  seed?: string;
  thresholds?: Record<string, DecimalString>;
}
export interface FinancePolicy {
  tests?: string[];
  materiality?: Record<string, DecimalString>;
  tolerance?: Record<string, DecimalString>;
  cutoff_days?: number;
  posting_days?: number;
  duplicate_days?: number;
  frequency_limit?: number;
  blocking_severities?: string[];
  required_support_types?: string[];
  severities?: Record<string, string>;
  sampling?: FinanceSampling;
}
export interface FinanceAudit {
  uuid: string;
  title: string;
  department: number | null;
  revision: number;
  population_revision: number;
  status: RunStatus;
  run_uuid: string | null;
}
export interface FinanceDetail extends FinanceAudit {
  scope: FinanceScope;
  policy: FinancePolicy;
}
export interface FinanceCreate {
  title: string;
  department?: number | null;
  scope: FinanceScope;
  policy?: FinancePolicy;
}
export interface FinanceVersion {
  uuid: string;
  number: number | null;
  created_at: string;
}
export interface FinanceDataset extends FinanceVersion {
  document_uuid: string;
  checksum: string;
  mapping: Record<string, string>;
  kind: 'csv' | 'json';
  row_count: number;
  totals: Json;
}
export interface FinanceRecord {
  transaction_id: string;
  transaction_date: string;
  transaction_type: string;
  currency: string;
  gross_amount?: DecimalString | null;
  lines?: Record<string, Json>[];
  [key: string]: Json | undefined;
}
export interface FinanceTransaction {
  uuid: string;
  dataset_uuid: string;
  row: number;
  data: FinanceRecord;
  provenance: Json;
  correction_uuid: string | null;
}
export interface FinanceCorrection extends FinanceVersion {
  original: FinanceRecord;
  corrected: FinanceRecord;
  actor: number;
  reason: string;
}
export interface FinanceEvidence {
  uuid: string;
  document_uuid: string;
  role: string;
  data: Json;
  checksum: string;
  governance_revision: number;
}
export interface FinanceSample extends FinanceVersion {
  population_revision: number;
  population_digest: string;
  method: FinanceMethod;
  parameters: FinanceSampling;
  selected: { transaction_uuid: string; reason: string; currency: string; signals: Json }[];
}
export interface FinanceTestRun extends FinanceVersion {
  population_revision: number;
  population_digest: string;
  counts: Record<string, number>;
  definitions: Json;
  previous_uuid: string | null;
  sample_uuid: string | null;
}
export interface FinanceResult {
  uuid: string;
  transaction_uuid: string;
  code: string;
  status: string;
  evidence: Json;
  finding_uuid: string | null;
}
export interface FinanceFinding {
  uuid: string;
  category: string;
  severity: string;
  status: string;
  review_state: string;
  data: Json;
  evidence: Json;
}
export interface FinanceResponse extends FinanceVersion {
  actor: number;
  data: Json;
}
export type FinanceDecisionState =
  'under_review' | 'remediation_in_progress' | 'resolved' | 'accepted_risk' | 'closed';
export interface FinanceDecision extends FinanceVersion {
  actor: number;
  decision: FinanceDecisionState;
  reason: string;
}
export interface FinanceOutput extends FinanceVersion {
  data: Json;
}
export interface FinanceLibrary {
  version: number;
  protected: boolean;
  tests: { code: string; name: string }[];
  sampling_methods: FinanceMethod[];
}
export interface FinanceImport {
  revision: number;
  document_uuid: string;
  kind: 'csv' | 'json';
  mapping: Record<string, string>;
  control_totals?: Record<string, Record<string, DecimalString>>;
  idempotency_key: string;
}
export interface FinanceSupport {
  revision: number;
  document_uuid: string;
  role: 'receipt' | 'purchase_order' | 'support' | 'approval' | 'contract';
  evidence: {
    proof: {
      document_uuid: string;
      governance_revision: number;
      start: number;
      end: number;
      preview: string;
      page?: number | null;
    };
    values: Record<string, string>;
  };
}
export interface FinanceResponseInput {
  revision: number;
  response: string;
  planned_action: string;
  target_date?: string;
  owner?: Principal;
  evidence_documents?: string[];
  request_uuid?: string;
}
// Mirrors finance_schema.FIELDS. The backend validates mapping and all imported values.
export const FINANCE_FIELDS = [
  'transaction_id',
  'transaction_date',
  'transaction_type',
  'currency',
  'gross_amount',
  'net_amount',
  'tax_amount',
  'debit',
  'credit',
  'quantity',
  'unit_price',
  'posting_date',
  'document_date',
  'receipt_date',
  'business_unit',
  'external_reference',
  'account_code',
  'account_name',
  'vendor_name',
  'vendor_identifier',
  'vendor_tax_id',
  'purchase_order_reference',
  'invoice_reference',
  'payment_reference',
  'cost_center',
  'department',
  'project_reference',
  'description',
  'status',
  'manual_entry',
  'lines',
] as const;
export const financeLabel = (value: string) => value.replace(/_/g, ' ');
export function decimalValid(value: string, nonnegative = false): boolean {
  return (
    (nonnegative ? /^\d+(?:\.\d{1,8})?$/ : /^-?\d+(?:\.\d{1,8})?$/).test(value) &&
    value.replace(/^-/, '').split('.')[0].replace(/^0+/, '').length <= 22
  );
}
