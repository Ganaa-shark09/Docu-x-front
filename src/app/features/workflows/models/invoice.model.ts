import { Definition, Json, Principal, Version } from './workflow.model';
export interface InvoiceAccountingStatus {
  status: 'not_ready' | 'not_connected' | 'ready_to_post' | 'pending' | 'posted' | 'uncertain' | 'rejected';
  handoff_uuid: string | null;
  external_reference: string;
  failure_code: string;
}
export const INVOICE_FIELDS = [
  'invoice_number',
  'invoice_date',
  'due_date',
  'vendor_name',
  'vendor_identifier',
  'vendor_tax_id',
  'vendor_address',
  'bill_to_name',
  'bill_to_address',
  'purchase_order_number',
  'currency',
  'subtotal',
  'tax_total',
  'discount_total',
  'shipping_total',
  'other_charges',
  'grand_total',
  'amount_due',
  'payment_terms',
  'payment_method',
  'invoice_reference',
  'customer_reference',
  'line_items',
] as const;
export type InvoiceKey = (typeof INVOICE_FIELDS)[number];
export const LINE_COLUMNS = [
  'description',
  'sku',
  'quantity',
  'unit',
  'unit_price',
  'discount',
  'tax_rate',
  'tax_amount',
  'line_subtotal',
  'line_total',
  'purchase_order_line_reference',
] as const;
export type LineKey = (typeof LINE_COLUMNS)[number];
export type InvoiceLine = Record<LineKey, string | null>;
export type InvoiceData = Partial<Record<Exclude<InvoiceKey, 'line_items'>, string | null>> & {
  line_items?: InvoiceLine[] | null;
};
export interface InvoiceEvidence {
  document_uuid: string;
  page?: number | null;
  chunk_uuid?: string;
  start?: number;
  end?: number;
  preview?: string;
  method?: string;
  bounding_box?: Json;
  governance_revision?: number;
}
export interface InvoiceCell {
  raw_value: string | null;
  normalized_value: string | null;
  evidence: InvoiceEvidence[];
  review_status: string;
}
export interface InvoiceProvenance {
  field_uuid: string;
  raw_value: string | null;
  normalized_value: string | InvoiceLine[] | null;
  corrected_value: string | null;
  extracted_confidence: string | null;
  confidence_basis: string | null;
  validation_confidence: null;
  validation_status: 'valid' | 'invalid' | 'unknown';
  review_status: 'reviewed' | 'unreviewed';
  reviewed_by: number | null;
  reviewed_at: string | null;
  document_uuid: string;
  extraction_method: string | null;
  evidence: InvoiceEvidence[];
  cells?: Partial<Record<LineKey, InvoiceCell>>[];
}
export interface InvoiceCorrection {
  uuid: string;
  actor: number | null;
  revision: number;
  previous_value: string;
  corrected_value: string;
  reason: string;
  created_at: string;
}
export interface InvoiceField extends InvoiceProvenance {
  field_key: InvoiceKey;
  corrections: InvoiceCorrection[];
}
export interface InvoiceValidation {
  code: string;
  fields: string[];
  severity: string;
  blocking: boolean;
}
export interface InvoiceDuplicate {
  invoice_uuid: string;
  document_uuid: string;
  match_strength: 'exact' | 'probable';
  signals: string[];
  status: 'candidate';
}
export interface InvoiceVendorMatch {
  status: 'matched' | 'ambiguous' | 'not_matched';
  vendor_uuid: string | null;
  match_type: string | null;
  confidence: null;
  candidates: string[];
}
export interface InvoicePoMatch {
  status: 'matched' | 'not_matched' | 'ambiguous' | 'not_applicable' | 'integration_unavailable';
  reference: string | null;
  checks: string[];
}
export interface InvoiceCanonical {
  schema_version: number;
  invoice: InvoiceData;
  source: {
    document_uuid: string;
    workflow_uuid: string;
    extraction_uuid: string;
    revision: number;
  };
  vendor: Partial<InvoiceVendorMatch>;
  purchase_order_reference: Partial<InvoicePoMatch>;
  validation: InvoiceValidation[];
  field_provenance: Partial<Record<InvoiceKey, InvoiceProvenance>>;
  approval_uuid: string | null;
}
export interface InvoiceOutput {
  uuid: string;
  revision: number;
  schema_version: number;
  digest: string;
  data: InvoiceCanonical;
  created_at: string;
}
export interface InvoiceRecord {
  uuid: string;
  workflow_uuid: string;
  document_uuid: string;
  extraction_uuid: string | null;
  revision: number;
  normalized: InvoiceData;
  classification: { document_type?: string; confidence?: number; uncertain?: boolean };
  validation: InvoiceValidation[];
  matches: { vendor?: InvoiceVendorMatch; purchase_order?: InvoicePoMatch };
  effective_confidence: string | null;
  field_provenance: Partial<Record<InvoiceKey, InvoiceProvenance>>;
  duplicate_candidates: InvoiceDuplicate[];
  final_output: InvoiceOutput | null;
}
export interface InvoicePolicy {
  confidence_threshold?: string;
  tolerance?: string | null;
  decimal_separator?: '.' | ',' | null;
  date_order?: 'DMY' | 'MDY' | null;
  require_approval?: boolean;
  force_review?: boolean;
  require_vendor?: boolean;
  require_po?: boolean;
  review_duplicates?: boolean;
  use_ai?: boolean;
}
export interface InvoiceDefinitionInput {
  name: string;
  code: string;
  reviewer: Principal;
  approver?: Principal;
  department?: number | null;
  policy?: InvoicePolicy;
}
export interface InvoiceDefinitionResult {
  definition: Definition;
  version: Version;
}
export interface InvoiceCorrectionInput {
  corrected_value: string;
  expected_revision: number;
  reason: string;
}
export function invoiceValue(value: string | InvoiceLine[] | null | undefined): string {
  return value == null || value === ''
    ? 'Unknown'
    : typeof value === 'string'
      ? value
      : JSON.stringify(value, null, 2);
}
// Money stays a decimal string: no browser arithmetic, conversion or rounding.
export function invoiceMoney(value: string | null | undefined, currency?: string | null): string {
  if (value == null || value === '') return 'Unknown';
  if (!/^-?\d+(?:\.\d+)?$/.test(value)) return 'Unavailable';
  const [whole, fraction] = value.split('.');
  return (
    (currency ? currency + ' ' : '') +
    whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',') +
    (fraction === undefined ? '' : '.' + fraction)
  );
}
export function invoiceConfidence(value: string | null | undefined): string {
  if (value == null || value === '') return 'Not provided';
  const score = Number(value);
  return Number.isFinite(score) && score >= 0 && score <= 1
    ? (score * 100).toFixed(1).replace(/\.0$/, '') + '%'
    : 'Not provided';
}
