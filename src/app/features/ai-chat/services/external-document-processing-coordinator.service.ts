import {
  Injectable,
  OnDestroy,
} from '@angular/core';

import {
  Subscription,
} from 'rxjs';

import {
  DocumentRealtimeService,
} from '../../../core/realtime/document-realtime.service';

import {
  DocumentProcessingEvent,
} from '../../../core/realtime/realtime.models';

import {
  ExternalDocument,
  ExternalDocumentReadinessItem,
  ExternalDocumentReadinessResponse,
} from '../models/ai-chat.model';

import {
  AiChatService,
} from './ai-chat.service';

import {
  ExternalDocumentReadinessService,
} from './external-document-readiness.service';


export type ExternalDocumentScopeMode =
  'selected' |
  'conversation';


export interface ExternalDocumentPollingRequest {
  documentUuids: string[];
  conversationUuid?: string;
  initialDelayMs?: number;

  onStatuses: (
    documents:
      ExternalDocumentReadinessItem[],
  ) => void;

  onReady: () => void;

  onFailed: (
    message: string,
  ) => void;
}


export interface ExternalPendingRealtimeSend {
  message: string;
  scopeUuids: string[];
  waitUuids: string[];
  scopeMode:
    ExternalDocumentScopeMode;
  conversationUuid?: string;
}


export interface ExternalRealtimeCoordinatorCallbacks {
  getDocuments:
    () => ExternalDocument[];

  onEvent: (
    event:
      DocumentProcessingEvent,
  ) => void;

  onStatuses: (
    documents:
      ExternalDocumentReadinessItem[],
  ) => void;

  onFailed: (
    message: string,
  ) => void;

  onSend: (
    pending:
      ExternalPendingRealtimeSend,
  ) => void;
}


@Injectable()
export class ExternalDocumentProcessingCoordinatorService
  implements OnDestroy {

  private pollingHandle:
    number | null = null;

  private pollingGeneration = 0;

  private realtimeSubscription?:
    Subscription;

  private realtimeCallbacks?:
    ExternalRealtimeCoordinatorCallbacks;

  private pendingRealtimeSend:
    ExternalPendingRealtimeSend |
    null = null;

  private realtimeFallbackHandle:
    number | null = null;

  private readonly pollingDelays = [
    2000,
    3000,
    5000,
    8000,
    10000,
  ];

  private readonly realtimeFallbackMs =
    5000;


  constructor(
    private readonly aiChatService:
      AiChatService,

    private readonly readiness:
      ExternalDocumentReadinessService,

    private readonly realtime:
      DocumentRealtimeService,
  ) {}


  ngOnDestroy(): void {
    this.realtimeSubscription
      ?.unsubscribe();

    this.clearPendingRealtimeSend();

    this.realtimeCallbacks =
      undefined;
  }


  bindRealtime(
    callbacks:
      ExternalRealtimeCoordinatorCallbacks,
  ): void {
    this.realtimeCallbacks =
      callbacks;

    this.realtimeSubscription
      ?.unsubscribe();

    this.realtimeSubscription =
      this.realtime.events$
        .subscribe(
          (
            event:
              DocumentProcessingEvent,
          ) => {
            if (
              event.event !==
                'document.processing.snapshot' &&
              event.event !==
                'document.processing.updated'
            ) {
              return;
            }

            if (!event.document_uuid) {
              return;
            }

            /*
             * Apply the realtime state first.
             * tryFlushPendingRealtimeSend() then reads
             * the component's updated document state.
             */
            callbacks.onEvent(
              event,
            );

            /*
             * Realtime activity proves the socket is
             * alive. Push the polling fallback out.
             */
            this.scheduleRealtimeFallback();

            this.tryFlushPendingRealtimeSend();
          },
        );
  }


  subscribeDocuments(
    documentUuids: string[],
  ): void {
    const normalized =
      this.normalizeUuids(
        documentUuids,
      );

    if (!normalized.length) {
      return;
    }

    this.realtime
      .subscribeDocuments(
        normalized,
      );
  }


  queueRealtimeSend(
    pending:
      ExternalPendingRealtimeSend,
  ): void {
    /*
     * A new pending send supersedes any previous
     * fallback/polling operation.
     */
    this.clearPendingRealtimeSend();

    this.pendingRealtimeSend = {
      ...pending,

      scopeUuids:
        this.normalizeUuids(
          pending.scopeUuids,
        ),

      waitUuids:
        this.normalizeUuids(
          pending.waitUuids,
        ),
    };

    this.subscribeDocuments(
      this.pendingRealtimeSend
        .waitUuids,
    );

    this.scheduleRealtimeFallback();

    /*
     * The documents might already be ready because
     * the upload/status response arrived before the
     * realtime snapshot.
     */
    this.tryFlushPendingRealtimeSend();
  }


  clearPendingRealtimeSend(): void {
    this.pendingRealtimeSend =
      null;

    this.cancelRealtimeFallback();

    this.stop();
  }


  start(
    request:
      ExternalDocumentPollingRequest,
  ): void {
    this.cancelPollingTimer();

    const documentUuids =
      this.normalizeUuids(
        request.documentUuids,
      );

    if (!documentUuids.length) {
      request.onReady();
      return;
    }

    const generation =
      ++this.pollingGeneration;

    this.schedulePolling(
      request,
      documentUuids,
      0,
      generation,
      request.initialDelayMs,
    );
  }


  stop(): void {
    ++this.pollingGeneration;

    this.cancelPollingTimer();
  }


  private tryFlushPendingRealtimeSend(): void {
    const pending =
      this.pendingRealtimeSend;

    const callbacks =
      this.realtimeCallbacks;

    if (
      !pending ||
      !callbacks
    ) {
      return;
    }

    const documentsByUuid =
      new Map<
        string,
        ExternalDocument
      >(
        callbacks
          .getDocuments()
          .map(
            (document) => [
              document.uuid,
              document,
            ],
          ),
      );

    const targetDocuments =
      pending.waitUuids
        .map(
          (uuid) =>
            documentsByUuid.get(
              uuid,
            ),
        )
        .filter(
          (
            document,
          ): document is ExternalDocument =>
            !!document,
        );

    /*
     * Wait until every requested document has
     * appeared in component state.
     */
    if (
      targetDocuments.length !==
      pending.waitUuids.length
    ) {
      return;
    }

    const failed =
      targetDocuments.find(
        (document) =>
          this.readiness.isFailed(
            document,
          ),
      );

    if (failed) {
      const message =
        failed.processing_error ||
        'An attachment failed during processing.';

      this.clearPendingRealtimeSend();

      callbacks.onFailed(
        message,
      );

      return;
    }

    const allReady =
      targetDocuments.every(
        (document) =>
          this.readiness
            .getPendingUuids(
              [
                document,
              ],
            )
            .length === 0,
      );

    if (!allReady) {
      return;
    }

    const completed =
      this.copyPending(
        pending,
      );

    this.clearPendingRealtimeSend();

    callbacks.onSend(
      completed,
    );
  }


  private scheduleRealtimeFallback(): void {
    if (
      !this.pendingRealtimeSend ||
      !this.realtimeCallbacks
    ) {
      return;
    }

    this.cancelRealtimeFallback();

    this.realtimeFallbackHandle =
      window.setTimeout(
        () => {
          this.realtimeFallbackHandle =
            null;

          const pending =
            this.pendingRealtimeSend;

          const callbacks =
            this.realtimeCallbacks;

          if (
            !pending ||
            !callbacks
          ) {
            return;
          }

          console.warn(
            '[DocuX realtime] No decisive ready event received; using processing-status fallback.',
            pending.waitUuids,
          );

          this.start({
            documentUuids:
              pending.waitUuids,

            conversationUuid:
              pending.conversationUuid,

            initialDelayMs:
              1000,

            onStatuses:
              (documents) => {
                if (
                  this.pendingRealtimeSend !==
                  pending
                ) {
                  return;
                }

                callbacks.onStatuses(
                  documents,
                );
              },

            onFailed:
              (message) => {
                if (
                  this.pendingRealtimeSend !==
                  pending
                ) {
                  return;
                }

                this.clearPendingRealtimeSend();

                callbacks.onFailed(
                  message,
                );
              },

            onReady:
              () => {
                if (
                  this.pendingRealtimeSend !==
                  pending
                ) {
                  return;
                }

                const completed =
                  this.copyPending(
                    pending,
                  );

                this.clearPendingRealtimeSend();

                callbacks.onSend(
                  completed,
                );
              },
          });
        },
        this.realtimeFallbackMs,
      );
  }


  private schedulePolling(
    request:
      ExternalDocumentPollingRequest,

    documentUuids: string[],

    attempt: number,

    generation: number,

    overrideDelayMs?: number,
  ): void {
    if (
      generation !==
      this.pollingGeneration
    ) {
      return;
    }

    const delay =
      overrideDelayMs ??
      this.pollingDelays[
        Math.min(
          attempt,
          this.pollingDelays.length - 1,
        )
      ];

    this.pollingHandle =
      window.setTimeout(
        () => {
          this.pollingHandle =
            null;

          this.poll(
            request,
            documentUuids,
            attempt,
            generation,
          );
        },
        delay,
      );
  }


  private poll(
    request:
      ExternalDocumentPollingRequest,

    documentUuids: string[],

    attempt: number,

    generation: number,
  ): void {
    if (
      generation !==
      this.pollingGeneration
    ) {
      return;
    }

    this.aiChatService
      .getExternalDocumentProcessingStatus(
        documentUuids,
        request.conversationUuid,
      )
      .subscribe({
        next: (
          response:
            ExternalDocumentReadinessResponse,
        ) => {
          if (
            generation !==
            this.pollingGeneration
          ) {
            return;
          }

          const statusDocuments =
            response.documents || [];

          request.onStatuses(
            statusDocuments,
          );

          const failedDocuments =
            statusDocuments.filter(
              (document) =>
                this.readiness
                  .isFailed(
                    document,
                  ),
            );

          if (
            response.has_failed ||
            failedDocuments.length > 0
          ) {
            this.stop();

            request.onFailed(
              failedDocuments[0]
                ?.processing_error ||
              'One or more attached files failed during processing.',
            );

            return;
          }

          const remainingPendingUuids =
            statusDocuments
              .filter(
                (document) =>
                  !this.readiness
                    .isReady(
                      document,
                    ) &&
                  !this.readiness
                    .isFailed(
                      document,
                    ),
              )
              .map(
                (document) =>
                  document.uuid,
              )
              .filter(Boolean);

          if (
            response.all_ready ||
            remainingPendingUuids
              .length === 0
          ) {
            this.stop();

            request.onReady();
            return;
          }

          this.schedulePolling(
            request,
            remainingPendingUuids,
            attempt + 1,
            generation,
          );
        },

        error: (error: unknown) => {
          if (
            generation !==
            this.pollingGeneration
          ) {
            return;
          }

          console.error(
            'External attachment processing-status error:',
            error,
          );

          this.schedulePolling(
            request,
            documentUuids,
            attempt + 1,
            generation,
          );
        },
      });
  }


  private copyPending(
    pending:
      ExternalPendingRealtimeSend,
  ): ExternalPendingRealtimeSend {
    return {
      ...pending,

      scopeUuids:
        [
          ...pending.scopeUuids,
        ],

      waitUuids:
        [
          ...pending.waitUuids,
        ],
    };
  }


  private normalizeUuids(
    documentUuids: string[],
  ): string[] {
    return Array.from(
      new Set(
        documentUuids
          .filter(Boolean),
      ),
    );
  }


  private cancelRealtimeFallback(): void {
    if (
      this.realtimeFallbackHandle ===
      null
    ) {
      return;
    }

    window.clearTimeout(
      this.realtimeFallbackHandle,
    );

    this.realtimeFallbackHandle =
      null;
  }


  private cancelPollingTimer(): void {
    if (
      this.pollingHandle ===
      null
    ) {
      return;
    }

    window.clearTimeout(
      this.pollingHandle,
    );

    this.pollingHandle =
      null;
  }
}
