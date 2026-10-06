import {
  Subject,
  of,
} from 'rxjs';

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

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
  ExternalDocumentProcessingCoordinatorService,
} from './external-document-processing-coordinator.service';

import {
  ExternalDocumentReadinessService,
} from './external-document-readiness.service';


describe(
  'ExternalDocumentProcessingCoordinatorService',
  () => {
    let getStatus:
      ReturnType<typeof vi.fn>;

    let subscribeDocuments:
      ReturnType<typeof vi.fn>;

    let realtimeEvents:
      Subject<DocumentProcessingEvent>;

    let service:
      ExternalDocumentProcessingCoordinatorService;


    function item(
      overrides:
        Partial<
          ExternalDocumentReadinessItem
        > = {},
    ): ExternalDocumentReadinessItem {
      return {
        uuid: 'document-1',
        status: 'processing',
        is_ai_ready: false,
        processing_error: '',
        ...overrides,
      } as ExternalDocumentReadinessItem;
    }


    function document(
      overrides:
        Partial<ExternalDocument> = {},
    ): ExternalDocument {
      return {
        uuid: 'document-1',
        title: 'Document',
        status: 'processing',
        is_ai_ready: false,
        processing_error: '',
        ...overrides,
      } as ExternalDocument;
    }


    function response(
      statusDocument:
        ExternalDocumentReadinessItem,

      overrides:
        Partial<
          ExternalDocumentReadinessResponse
        > = {},
    ): ExternalDocumentReadinessResponse {
      return {
        documents: [
          statusDocument,
        ],
        all_ready: false,
        has_failed: false,
        ...overrides,
      } as ExternalDocumentReadinessResponse;
    }


    beforeEach(
      () => {
        vi.useFakeTimers();

        getStatus =
          vi.fn();

        subscribeDocuments =
          vi.fn();

        realtimeEvents =
          new Subject<
            DocumentProcessingEvent
          >();

        const aiChatService = {
          getExternalDocumentProcessingStatus:
            getStatus,
        } as unknown as AiChatService;

        const realtimeService = {
          events$:
            realtimeEvents
              .asObservable(),

          subscribeDocuments,
        } as unknown as DocumentRealtimeService;

        service =
          new ExternalDocumentProcessingCoordinatorService(
            aiChatService,
            new ExternalDocumentReadinessService(),
            realtimeService,
          );
      },
    );


    afterEach(
      () => {
        service.ngOnDestroy();

        realtimeEvents.complete();

        vi.useRealTimers();
      },
    );


    it(
      'finishes polling when all documents are ready',
      () => {
        getStatus.mockReturnValue(
          of(
            response(
              item({
                status: 'ready',
                is_ai_ready: true,
              }),
              {
                all_ready: true,
              },
            ),
          ),
        );

        const onStatuses =
          vi.fn();

        const onReady =
          vi.fn();

        service.start({
          documentUuids: [
            'document-1',
          ],

          conversationUuid:
            'conversation-1',

          initialDelayMs:
            0,

          onStatuses,

          onReady,

          onFailed:
            vi.fn(),
        });

        vi.advanceTimersByTime(
          0,
        );

        expect(
          getStatus,
        ).toHaveBeenCalledWith(
          [
            'document-1',
          ],
          'conversation-1',
        );

        expect(
          onStatuses,
        ).toHaveBeenCalledTimes(
          1,
        );

        expect(
          onReady,
        ).toHaveBeenCalledTimes(
          1,
        );
      },
    );


    it(
      'reports a failed polling document',
      () => {
        getStatus.mockReturnValue(
          of(
            response(
              item({
                status: 'failed',
                processing_error:
                  'Indexing failed',
              }),
              {
                has_failed: true,
              },
            ),
          ),
        );

        const onFailed =
          vi.fn();

        service.start({
          documentUuids: [
            'document-1',
          ],

          initialDelayMs:
            0,

          onStatuses:
            vi.fn(),

          onReady:
            vi.fn(),

          onFailed,
        });

        vi.advanceTimersByTime(
          0,
        );

        expect(
          onFailed,
        ).toHaveBeenCalledWith(
          'Indexing failed',
        );
      },
    );


    it(
      'continues polling until a document becomes ready',
      () => {
        getStatus
          .mockReturnValueOnce(
            of(
              response(
                item(),
              ),
            ),
          )
          .mockReturnValueOnce(
            of(
              response(
                item({
                  status: 'ready',
                  is_ai_ready: true,
                }),
                {
                  all_ready: true,
                },
              ),
            ),
          );

        const onReady =
          vi.fn();

        service.start({
          documentUuids: [
            'document-1',
          ],

          initialDelayMs:
            0,

          onStatuses:
            vi.fn(),

          onReady,

          onFailed:
            vi.fn(),
        });

        vi.advanceTimersByTime(
          0,
        );

        expect(
          getStatus,
        ).toHaveBeenCalledTimes(
          1,
        );

        vi.advanceTimersByTime(
          3000,
        );

        expect(
          getStatus,
        ).toHaveBeenCalledTimes(
          2,
        );

        expect(
          onReady,
        ).toHaveBeenCalledTimes(
          1,
        );
      },
    );


    it(
      'cancels a pending polling timer',
      () => {
        getStatus.mockReturnValue(
          of(
            response(
              item(),
            ),
          ),
        );

        service.start({
          documentUuids: [
            'document-1',
          ],

          initialDelayMs:
            1000,

          onStatuses:
            vi.fn(),

          onReady:
            vi.fn(),

          onFailed:
            vi.fn(),
        });

        service.stop();

        vi.advanceTimersByTime(
          1000,
        );

        expect(
          getStatus,
        ).not.toHaveBeenCalled();
      },
    );


    it(
      'subscribes to normalized realtime document UUIDs',
      () => {
        service.subscribeDocuments(
          [
            'document-1',
            'document-1',
            '',
            'document-2',
          ],
        );

        expect(
          subscribeDocuments,
        ).toHaveBeenCalledWith(
          [
            'document-1',
            'document-2',
          ],
        );
      },
    );


    it(
      'flushes a frozen pending send when realtime marks the document ready',
      () => {
        let documents = [
          document(),
        ];

        const onSend =
          vi.fn();

        service.bindRealtime({
          getDocuments:
            () => documents,

          onEvent:
            (event) => {
              documents = [
                document({
                  status:
                    event.status,
                  is_ai_ready:
                    event.is_ai_ready,
                }),
              ];
            },

          onStatuses:
            vi.fn(),

          onFailed:
            vi.fn(),

          onSend,
        });

        service.queueRealtimeSend({
          message:
            'Explain this file',

          scopeUuids: [
            'selected-1',
            'document-1',
          ],

          waitUuids: [
            'document-1',
          ],

          scopeMode:
            'selected',

          conversationUuid:
            'conversation-1',
        });

        realtimeEvents.next({
          event:
            'document.processing.updated',

          document_uuid:
            'document-1',

          status:
            'ready',

          is_ai_ready:
            true,
        });

        expect(
          onSend,
        ).toHaveBeenCalledTimes(
          1,
        );

        expect(
          onSend,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            message:
              'Explain this file',

            scopeUuids: [
              'selected-1',
              'document-1',
            ],

            scopeMode:
              'selected',
          }),
        );

        expect(
          getStatus,
        ).not.toHaveBeenCalled();
      },
    );


    it(
      'reports realtime processing failure without sending',
      () => {
        let documents = [
          document(),
        ];

        const onFailed =
          vi.fn();

        const onSend =
          vi.fn();

        service.bindRealtime({
          getDocuments:
            () => documents,

          onEvent:
            () => {
              documents = [
                document({
                  status:
                    'failed',

                  processing_error:
                    'Extraction failed',
                }),
              ];
            },

          onStatuses:
            vi.fn(),

          onFailed,

          onSend,
        });

        service.queueRealtimeSend({
          message:
            'Explain this file',

          scopeUuids: [
            'document-1',
          ],

          waitUuids: [
            'document-1',
          ],

          scopeMode:
            'selected',
        });

        realtimeEvents.next({
          event:
            'document.processing.updated',

          document_uuid:
            'document-1',

          status:
            'failed',

          error:
            'Extraction failed',
        });

        expect(
          onFailed,
        ).toHaveBeenCalledWith(
          'Extraction failed',
        );

        expect(
          onSend,
        ).not.toHaveBeenCalled();
      },
    );


    it(
      'falls back to polling and preserves the frozen send scope',
      () => {
        const documents = [
          document(),
        ];

        const onStatuses =
          vi.fn();

        const onSend =
          vi.fn();

        getStatus.mockReturnValue(
          of(
            response(
              item({
                status: 'ready',
                is_ai_ready: true,
              }),
              {
                all_ready: true,
              },
            ),
          ),
        );

        service.bindRealtime({
          getDocuments:
            () => documents,

          onEvent:
            vi.fn(),

          onStatuses,

          onFailed:
            vi.fn(),

          onSend,
        });

        service.queueRealtimeSend({
          message:
            'Use both files',

          scopeUuids: [
            'selected-before-send',
            'uploaded-processing',
          ],

          waitUuids: [
            'uploaded-processing',
          ],

          scopeMode:
            'selected',

          conversationUuid:
            'conversation-processing',
        });

        /*
         * 5 seconds with no decisive realtime
         * event triggers fallback.
         */
        vi.advanceTimersByTime(
          5000,
        );

        /*
         * Fallback polling starts after another
         * 1 second, matching the previous component
         * behavior.
         */
        vi.advanceTimersByTime(
          1000,
        );

        expect(
          getStatus,
        ).toHaveBeenCalledWith(
          [
            'uploaded-processing',
          ],
          'conversation-processing',
        );

        expect(
          onStatuses,
        ).toHaveBeenCalledTimes(
          1,
        );

        expect(
          onSend,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            message:
              'Use both files',

            scopeUuids: [
              'selected-before-send',
              'uploaded-processing',
            ],

            scopeMode:
              'selected',
          }),
        );
      },
    );
  },
);
