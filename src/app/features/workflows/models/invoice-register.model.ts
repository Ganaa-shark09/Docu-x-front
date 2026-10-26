import { Page, RunStatus } from './workflow.model';

// The register deliberately contains only the bounded fields returned by the
// permission-filtered listing endpoint. Never deserialize full invoice content here.
export interface InvoiceRegisterRow {
  uuid: string;
  workflow_uuid: string;
  document_uuid: string;
  document_title: string;
  status: RunStatus;
  revision: number;
  invoice_number: string | null;
  invoice_date: string | null;
  vendor_name: string | null;
  currency: string | null;
  grand_total: string | null;
  open_issues: number;
  has_final_output: boolean;
  effective_confidence: string | null;
  created_at: string;
  updated_at: string;
}

export type InvoiceRegisterPage = Page<InvoiceRegisterRow>;

export interface InvoiceRegisterSummary {
  total: number;
  by_status: Record<RunStatus, number>;
}

export interface InvoiceRegisterQuery {
  page?: number;
  status?: RunStatus | '';
  search?: string;
}
