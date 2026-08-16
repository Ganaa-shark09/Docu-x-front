export interface DocumentListItem {
  uuid: string;
  title: string;
  description?: string;
  company_name?: string;
  department_name?: string;
  uploaded_by_email?: string;
  current_user_access?: string;
  document_type: string;
  status: string;

  processing_stage?:
    | 'queued'
    | 'extracting'
    | 'classifying'
    | 'firewall_scan'
    | 'chunking'
    | 'embedding'
    | 'indexing'
    | 'ready'
    | 'failed';

  processing_progress?: number;

  sensitivity_label: string;
  original_filename: string;
  file_size: number;
  mime_type?: string;
  checksum?: string;
  page_count?: number;
  language?: string;
  is_indexed: boolean;
  is_ocr_completed: boolean;
  is_ai_ready: boolean;
  processing_error?: string;
  created_at: string;
  updated_at: string;
}

export interface DocumentDetail extends DocumentListItem {
  versions?: DocumentVersion[];
  access_policies?: DocumentAccessPolicy[];
  processing_jobs?: DocumentProcessingJob[];
}

export interface DocumentProcessingJob {
  uuid: string;
  job_type: string;
  status: string;
  error_message?: string;
  started_at?: string | null;
  completed_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface DocumentVersion {
  uuid: string;
  version_number: number;
  file?: string;
  file_size?: number;
  checksum?: string;
  created_at: string;
  updated_at: string;
}

export interface DocumentAccessPolicy {
  uuid: string;
  user?: number;
  user_email?: string;
  role?: string;
  access_level: string;
  can_download: boolean;
  can_export: boolean;
  can_use_ai: boolean;
  created_at: string;
  updated_at: string;
}

export interface DocumentFilters {
  search?: string;
  status?: string;
  document_type?: string;
  sensitivity_label?: string;
  is_ai_ready?: string;
  ordering?: string;
  page?: number;
}

export interface DepartmentOption {
  uuid: string;
  name: string;
  department_type: string;
}
