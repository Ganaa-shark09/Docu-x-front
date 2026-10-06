import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  ExternalDocument,
} from '../models/ai-chat.model';

import {
  ExternalDocumentReadinessService,
} from './external-document-readiness.service';

import {
  ExternalUploadOutcomePlannerService,
} from './external-upload-outcome-planner.service';


describe(
  'ExternalUploadOutcomePlannerService',
  () => {
    const service =
      new ExternalUploadOutcomePlannerService(
        new ExternalDocumentReadinessService(),
      );


    function document(
      overrides:
        Partial<ExternalDocument> = {},
    ): ExternalDocument {
      return {
        uuid:
          'uploaded-1',

        title:
          'Uploaded document',

        status:
          'processing',

        is_ai_ready:
          false,

        ...overrides,
      };
    }


    it(
      'rejects an upload result with no document UUIDs',
      () => {
        const outcome =
          service.plan({
            requestedFileCount:
              1,

            selectedDocumentUuids:
              [],

            uploadedDocuments: [
              document({
                uuid:
                  '',
              }),
            ],
          });

        expect(
          outcome.kind,
        ).toBe(
          'error',
        );

        if (
          outcome.kind !==
          'error'
        ) {
          throw new Error(
            'Expected error outcome.',
          );
        }

        expect(
          outcome.message,
        ).toContain(
          'did not return document UUIDs',
        );
      },
    );


    it(
      'rejects a failed uploaded document',
      () => {
        const outcome =
          service.plan({
            requestedFileCount:
              1,

            selectedDocumentUuids:
              [],

            uploadedDocuments: [
              document({
                status:
                  'failed',

                processing_error:
                  'Extraction failed',
              }),
            ],
          });

        expect(
          outcome,
        ).toEqual({
          kind:
            'error',

          message:
            'Extraction failed',
        });
      },
    );


    it(
      'waits while uploaded documents are processing',
      () => {
        const outcome =
          service.plan({
            requestedFileCount:
              1,

            selectedDocumentUuids: [
              'selected-before-send',
            ],

            uploadedDocuments: [
              document({
                uuid:
                  'uploaded-processing',
              }),
            ],
          });

        expect(
          outcome,
        ).toEqual({
          kind:
            'wait',

          uploadedDocumentUuids: [
            'uploaded-processing',
          ],

          queryDocumentUuids: [
            'selected-before-send',
            'uploaded-processing',
          ],

          pendingDocumentUuids: [
            'uploaded-processing',
          ],

          scopeMode:
            'selected',
        });
      },
    );


    it(
      'sends immediately when uploaded documents are ready',
      () => {
        const outcome =
          service.plan({
            requestedFileCount:
              1,

            selectedDocumentUuids: [
              'selected-1',
            ],

            uploadedDocuments: [
              document({
                uuid:
                  'uploaded-1',

                status:
                  'ready',

                is_ai_ready:
                  true,
              }),
            ],
          });

        expect(
          outcome,
        ).toEqual({
          kind:
            'send',

          uploadedDocumentUuids: [
            'uploaded-1',
          ],

          queryDocumentUuids: [
            'selected-1',
            'uploaded-1',
          ],

          scopeMode:
            'selected',
        });
      },
    );


    it(
      'deduplicates the frozen query document scope',
      () => {
        const outcome =
          service.plan({
            requestedFileCount:
              1,

            selectedDocumentUuids: [
              'shared-document',
              'selected-2',
              'shared-document',
            ],

            uploadedDocuments: [
              document({
                uuid:
                  'shared-document',

                status:
                  'ready',

                is_ai_ready:
                  true,
              }),
            ],
          });

        if (
          outcome.kind !==
          'send'
        ) {
          throw new Error(
            'Expected send outcome.',
          );
        }

        expect(
          outcome.queryDocumentUuids,
        ).toEqual(
          [
            'shared-document',
            'selected-2',
          ],
        );
      },
    );
  },
);
