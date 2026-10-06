import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  ExternalDocument,
  ExternalDocumentReadinessItem,
  LocalChatMessage,
} from '../models/ai-chat.model';

import {
  DocumentProcessingEvent,
} from '../../../core/realtime/realtime.models';

import {
  ExternalDocumentReadinessService,
} from './external-document-readiness.service';


describe(
  'ExternalDocumentReadinessService',
  () => {
    const service =
      new ExternalDocumentReadinessService();


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


    it(
      'recognizes ready documents',
      () => {
        expect(
          service.isReady(
            document({
              status: 'ready',
            }),
          ),
        ).toBe(true);

        expect(
          service.isReady(
            document({
              status: 'processing',
              is_ai_ready: true,
            }),
          ),
        ).toBe(true);
      },
    );


    it(
      'recognizes failed documents',
      () => {
        expect(
          service.isFailed(
            document({
              status: 'failed',
            }),
          ),
        ).toBe(true);

        expect(
          service.isFailed(
            document({
              processing_error:
                'Extraction failed',
            }),
          ),
        ).toBe(true);
      },
    );


    it(
      'returns only pending document UUIDs',
      () => {
        expect(
          service.getPendingUuids(
            [
              document({
                uuid: 'pending',
              }),

              document({
                uuid: 'ready',
                status: 'ready',
              }),

              document({
                uuid: 'failed',
                status: 'failed',
              }),
            ],
          ),
        ).toEqual(
          [
            'pending',
          ],
        );
      },
    );


    it(
      'applies realtime state to document and message attachment',
      () => {
        const messages: LocalChatMessage[] = [
          {
            role: 'user',
            content: 'Question',
            created_at:
              new Date().toISOString(),
            attachments: [
              {
                uuid: 'document-1',
                title: 'Document',
                status: 'processing',
                is_ai_ready: false,
              },
            ],
          },
        ];

        const event = {
          event:
            'document.processing.updated',
          document_uuid:
            'document-1',
          status:
            'ready',
          is_ai_ready:
            true,
        } as DocumentProcessingEvent;

        const state =
          service.applyRealtimeEvent(
            [
              document(),
            ],
            messages,
            event,
          );

        expect(
          state.documents[0]
            .status,
        ).toBe(
          'ready',
        );

        expect(
          state.documents[0]
            .is_ai_ready,
        ).toBe(true);

        expect(
          state.messages[0]
            .attachments?.[0]
            .status,
        ).toBe(
          'ready',
        );

        expect(
          state.messages[0]
            .attachments?.[0]
            .is_ai_ready,
        ).toBe(true);
      },
    );


    it(
      'applies polling status to document and message attachment',
      () => {
        const messages: LocalChatMessage[] = [
          {
            role: 'user',
            content: 'Question',
            created_at:
              new Date().toISOString(),
            attachments: [
              {
                uuid: 'document-1',
                title: 'Document',
                status: 'processing',
                is_ai_ready: false,
              },
            ],
          },
        ];

        const statuses = [
          {
            uuid:
              'document-1',
            status:
              'failed',
            is_ai_ready:
              false,
            processing_error:
              'Indexing failed',
          } as ExternalDocumentReadinessItem,
        ];

        const state =
          service.applyProcessingStatuses(
            [
              document(),
            ],
            messages,
            statuses,
          );

        expect(
          state.documents[0]
            .status,
        ).toBe(
          'failed',
        );

        expect(
          state.documents[0]
            .processing_error,
        ).toBe(
          'Indexing failed',
        );

        expect(
          state.messages[0]
            .attachments?.[0]
            .processing_error,
        ).toBe(
          'Indexing failed',
        );
      },
    );
  },
);
