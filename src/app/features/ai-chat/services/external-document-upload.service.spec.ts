import {
  of,
} from 'rxjs';

import {
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import {
  ExternalDocumentBulkUploadResponse,
} from '../models/ai-chat.model';

import {
  AiChatService,
} from './ai-chat.service';

import {
  ExternalDocumentUploadService,
} from './external-document-upload.service';


describe(
  'ExternalDocumentUploadService',
  () => {
    function createService() {
      const bulkUpload =
        vi.fn(
          (
            _formData: FormData,
          ) =>
            of({
              conversation_uuid:
                'conversation-1',

              uploaded_count:
                1,

              documents:
                [],
            } satisfies
              ExternalDocumentBulkUploadResponse),
        );

      const aiChatService = {
        bulkUploadExternalDocuments:
          bulkUpload,
      } as unknown as AiChatService;

      return {
        service:
          new ExternalDocumentUploadService(
            aiChatService,
          ),

        bulkUpload,
      };
    }


    it(
      'builds the required external document upload payload',
      () => {
        const {
          service,
          bulkUpload,
        } = createService();

        const file =
          new File(
            [
              'document contents',
            ],
            'invoice.pdf',
            {
              type:
                'application/pdf',
            },
          );

        service
          .upload({
            files: [
              file,
            ],

            conversationUuid:
              'conversation-1',
          })
          .subscribe();

        expect(
          bulkUpload,
        ).toHaveBeenCalledTimes(
          1,
        );

        const formData =
          bulkUpload
            .mock
            .calls[0][0] as FormData;

        expect(
          formData.get(
            'conversation_uuid',
          ),
        ).toBe(
          'conversation-1',
        );

        expect(
          formData.get(
            'document_type',
          ),
        ).toBe(
          'other',
        );

        expect(
          formData.get(
            'sensitivity_label',
          ),
        ).toBe(
          'internal',
        );

        expect(
          formData.getAll(
            'files',
          ),
        ).toEqual(
          [
            file,
          ],
        );
      },
    );


    it(
      'omits conversation UUID for a new conversation',
      () => {
        const {
          service,
          bulkUpload,
        } = createService();

        const file =
          new File(
            [
              'text',
            ],
            'notes.txt',
            {
              type:
                'text/plain',
            },
          );

        service
          .upload({
            files: [
              file,
            ],
          })
          .subscribe();

        const formData =
          bulkUpload
            .mock
            .calls[0][0] as FormData;

        expect(
          formData.has(
            'conversation_uuid',
          ),
        ).toBe(false);
      },
    );


    it(
      'preserves all files in a bulk upload',
      () => {
        const {
          service,
          bulkUpload,
        } = createService();

        const first =
          new File(
            [
              'first',
            ],
            'first.pdf',
          );

        const second =
          new File(
            [
              'second',
            ],
            'second.csv',
          );

        service
          .upload({
            files: [
              first,
              second,
            ],
          })
          .subscribe();

        const formData =
          bulkUpload
            .mock
            .calls[0][0] as FormData;

        expect(
          formData.getAll(
            'files',
          ),
        ).toEqual(
          [
            first,
            second,
          ],
        );
      },
    );
  },
);
