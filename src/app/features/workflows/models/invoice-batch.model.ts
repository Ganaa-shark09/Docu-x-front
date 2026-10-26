import { Page, RunStatus } from './workflow.model';

export interface InvoiceBatchItem {
  uuid: string;
  position: number;
  document_uuid: string;
  document_title: string;
  run_uuid: string | null;
  status: RunStatus | 'failed';
  error_code: string;
  error_message: string;
}

export interface InvoiceBatch {
  uuid: string;
  name: string;
  version_uuid: string;
  created_at: string;
  items: InvoiceBatchItem[];
  progress: { total: number; completed: number; review: number; failed: number; processing: number };
}

export type InvoiceBatchPage = Page<InvoiceBatch>;
