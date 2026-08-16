export type DocumentProcessingStage =
  | 'queued'
  | 'extracting'
  | 'classifying'
  | 'firewall_scan'
  | 'chunking'
  | 'embedding'
  | 'indexing'
  | 'ready'
  | 'failed';

export type RealtimeConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting';

export interface WebSocketTicketResponse {
  ticket: string;
  expires_in_seconds: number;
  websocket_path: string;
}

export interface DocumentProcessingEvent {
  event:
    | 'connection.ready'
    | 'subscription.updated'
    | 'document.processing.snapshot'
    | 'document.processing.updated'
    | string;

  event_version?: number;
  event_id?: string;

  document_uuid?: string;
  scope?: 'internal' | 'external' | string;

  stage?: DocumentProcessingStage;
  status?: string;
  progress?: number;

  is_ai_ready?: boolean;
  is_indexed?: boolean;
  is_ocr_completed?: boolean;

  message?: string;
  error?: string | null;

  updated_at?: string;
  occurred_at?: string;

  subscribed_document_uuids?: string[];
  rejected_document_uuids?: string[];

  extra?: Record<string, unknown>;
}

export interface DocumentProcessingState {
  documentUuid: string;

  stage: DocumentProcessingStage;
  status: string;
  progress: number;

  isAiReady: boolean;
  isIndexed: boolean;
  isOcrCompleted: boolean;

  message?: string;
  error?: string | null;

  updatedAt?: string;
}
