import {
  InvoiceRecord,
  InvoiceLine,
  InvoiceProvenance,
  InvoiceOutput,
  LINE_COLUMNS,
} from './models/invoice.model';
import { definition, run, step, version, uuid, doc } from './workflow-test.fixtures';
export const invoiceRun = { ...run, documents: [doc] };
export const invoiceDefinition = {
  ...definition,
  name: 'Invoice extraction',
  workflow_type: 'invoice',
};
export const invoiceVersion = {
  ...version,
  configuration: {},
  steps: [
    {
      ...version.steps[0],
      step_type: 'processing' as const,
      configuration: { adapter: 'invoice', options: { confidence_threshold: '0.85' } },
    },
  ],
};
export const financialStep = {
  ...step,
  key: 'validate_totals',
  step_type: 'processing' as const,
  status: 'completed' as const,
};
export const line: InvoiceLine = {
  ...Object.fromEntries(LINE_COLUMNS.map((k) => [k, null])),
  description: 'Verified service',
  quantity: '2',
  unit_price: '50.00',
  line_subtotal: '100.00',
  tax_amount: '10.00',
  line_total: '110.00',
} as InvoiceLine;
export const provenance: InvoiceProvenance = {
  field_uuid: uuid,
  document_uuid: doc,
  raw_value: '0000123',
  normalized_value: '0000123',
  corrected_value: null,
  extracted_confidence: '0.75',
  confidence_basis: 'explicit_label_match',
  validation_confidence: null,
  validation_status: 'valid',
  review_status: 'unreviewed',
  reviewed_by: null,
  reviewed_at: null,
  extraction_method: 'deterministic',
  evidence: [{ document_uuid: doc, page: null, start: 0, end: 12, preview: 'Invoice: 0000123' }],
};
export const invoice: InvoiceRecord = {
  uuid,
  workflow_uuid: uuid,
  document_uuid: doc,
  extraction_uuid: uuid,
  revision: 9,
  normalized: {
    invoice_number: '0000123',
    invoice_date: '2026-10-01',
    due_date: null,
    vendor_name: 'Verified vendor',
    currency: 'INR',
    subtotal: '100.00',
    tax_total: '10.00',
    grand_total: '110.00',
    amount_due: '110.00',
    line_items: [line],
  },
  classification: { document_type: 'invoice', confidence: 90, uncertain: false },
  validation: [],
  matches: {
    vendor: {
      status: 'matched',
      vendor_uuid: uuid,
      match_type: 'exact_name',
      confidence: null,
      candidates: [],
    },
    purchase_order: { status: 'integration_unavailable', reference: 'PO-01', checks: [] },
  },
  effective_confidence: '0.75',
  field_provenance: {
    invoice_number: provenance,
    line_items: {
      ...provenance,
      raw_value: JSON.stringify([line]),
      normalized_value: [line],
      cells: [
        {
          description: {
            raw_value: 'Verified service',
            normalized_value: 'Verified service',
            evidence: provenance.evidence,
            review_status: 'unreviewed',
          },
        },
      ],
    },
  },
  duplicate_candidates: [],
  final_output: null,
};
export const output: InvoiceOutput = {
  uuid,
  revision: 9,
  schema_version: 1,
  digest: 'server-digest',
  created_at: '2026-10-01T12:00:00Z',
  data: {
    schema_version: 1,
    invoice: { ...invoice.normalized, invoice_number: 'REVIEWED-001' },
    source: { document_uuid: doc, workflow_uuid: uuid, extraction_uuid: uuid, revision: 9 },
    vendor: invoice.matches.vendor!,
    purchase_order_reference: invoice.matches.purchase_order!,
    validation: [],
    field_provenance: invoice.field_provenance,
    approval_uuid: uuid,
  },
};
