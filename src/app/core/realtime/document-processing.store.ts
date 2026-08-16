import { Injectable, inject } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

import { DocumentRealtimeService } from './document-realtime.service';

import {
  DocumentProcessingEvent,
  DocumentProcessingStage,
  DocumentProcessingState,
} from './realtime.models';

export interface ProcessingDocumentSeed {
  uuid: string;

  status?: string | null;

  processing_stage?:
    | DocumentProcessingStage
    | null;

  processing_progress?:
    | number
    | null;

  is_ai_ready?: boolean;
  is_indexed?: boolean;
  is_ocr_completed?: boolean;

  processing_error?:
    | string
    | null;
}

@Injectable({
  providedIn: 'root',
})
export class DocumentProcessingStore {
  private readonly realtime =
    inject(DocumentRealtimeService);

  private readonly states =
    new Map<
      string,
      DocumentProcessingState
    >();

  private readonly statesSubject =
    new BehaviorSubject<
      Map<
        string,
        DocumentProcessingState
      >
    >(
      new Map(),
    );

  readonly states$ =
    this.statesSubject.asObservable();

  constructor() {
    this.realtime.events$
      .subscribe((event) => {
        if (
          event.event !==
            'document.processing.snapshot' &&
          event.event !==
            'document.processing.updated'
        ) {
          return;
        }

        this.applyEvent(event);
      });
  }

  seedDocuments(
    documents: ProcessingDocumentSeed[],
  ): void {
    let changed = false;

    for (const document of documents) {
      if (!document.uuid) {
        continue;
      }

      const previous =
        this.states.get(
          document.uuid,
        );

      const stage =
        document.processing_stage ||
        this.inferStage(
          document.status,
          document.is_ai_ready,
        );

      const next:
        DocumentProcessingState = {
          documentUuid:
            document.uuid,

          stage,

          status:
            document.status ||
            previous?.status ||
            'processing',

          progress:
            document.processing_progress ??
            previous?.progress ??
            this.defaultProgress(stage),

          isAiReady:
            document.is_ai_ready ??
            previous?.isAiReady ??
            false,

          isIndexed:
            document.is_indexed ??
            previous?.isIndexed ??
            false,

          isOcrCompleted:
            document.is_ocr_completed ??
            previous?.isOcrCompleted ??
            false,

          error:
            document.processing_error ??
            previous?.error ??
            null,
        };

      this.states.set(
        document.uuid,
        next,
      );

      changed = true;
    }

    if (changed) {
      this.emit();
    }
  }

  subscribeDocuments(
    documents: ProcessingDocumentSeed[],
  ): void {
    this.seedDocuments(
      documents,
    );

    this.realtime.subscribeDocuments(
      documents
        .map(
          (document) =>
            document.uuid,
        )
        .filter(Boolean),
    );
  }

  getState(
    documentUuid: string,
  ):
    | DocumentProcessingState
    | undefined {
    return this.states.get(
      documentUuid,
    );
  }

  isReady(
    documentUuid: string,
  ): boolean {
    const state =
      this.getState(documentUuid);

    return (
      state?.stage === 'ready' ||
      state?.isAiReady === true
    );
  }

  isFailed(
    documentUuid: string,
  ): boolean {
    const state =
      this.getState(documentUuid);

    return (
      state?.stage === 'failed' ||
      state?.status === 'failed'
    );
  }

  clear(): void {
    this.states.clear();
    this.emit();
  }

  private applyEvent(
    event: DocumentProcessingEvent,
  ): void {
    if (!event.document_uuid) {
      return;
    }

    const previous =
      this.states.get(
        event.document_uuid,
      );

    const stage =
      event.stage ||
      this.inferStage(
        event.status,
        event.is_ai_ready,
      );

    const next:
      DocumentProcessingState = {
        documentUuid:
          event.document_uuid,

        stage,

        status:
          event.status ||
          previous?.status ||
          'processing',

        progress:
          event.progress ??
          previous?.progress ??
          this.defaultProgress(stage),

        isAiReady:
          event.is_ai_ready ??
          previous?.isAiReady ??
          false,

        isIndexed:
          event.is_indexed ??
          previous?.isIndexed ??
          false,

        isOcrCompleted:
          event.is_ocr_completed ??
          previous?.isOcrCompleted ??
          false,

        message:
          event.message ??
          previous?.message,

        error:
          event.error ??
          previous?.error ??
          null,

        updatedAt:
          event.updated_at ??
          event.occurred_at ??
          previous?.updatedAt,
      };

    this.states.set(
      event.document_uuid,
      next,
    );

    this.emit();
  }

  private inferStage(
    status?: string | null,
    isAiReady?: boolean,
  ): DocumentProcessingStage {
    const normalized =
      String(status || '')
        .toLowerCase();

    if (
      isAiReady ||
      normalized === 'ready'
    ) {
      return 'ready';
    }

    if (normalized === 'failed') {
      return 'failed';
    }

    if (
      normalized === 'uploaded' ||
      normalized === 'queued'
    ) {
      return 'queued';
    }

    return 'extracting';
  }

  private defaultProgress(
    stage: DocumentProcessingStage,
  ): number {
    switch (stage) {
      case 'queued':
        return 0;

      case 'extracting':
        return 10;

      case 'classifying':
        return 35;

      case 'firewall_scan':
        return 45;

      case 'chunking':
        return 55;

      case 'embedding':
        return 70;

      case 'indexing':
        return 90;

      case 'ready':
        return 100;

      case 'failed':
        return 0;
    }
  }

  private emit(): void {
    this.statesSubject.next(
      new Map(this.states),
    );
  }
}
