/** Server-owned preflight. Contains presence indicators, never raw extracted values. */
export interface InvoiceReadiness {
  status: 'ready' | 'needs_review' | 'processing' | 'blocked' | 'restricted';
  can_start_invoice_workflow: boolean;
  internal_ai_indexed: boolean;
  message: string;
  checks: Array<{ key: string; present: boolean }>;
  missing_signals: string[];
}
