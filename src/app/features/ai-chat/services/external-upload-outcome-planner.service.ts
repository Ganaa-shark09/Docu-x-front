import {
  Injectable,
} from '@angular/core';

import {
  ExternalDocument,
} from '../models/ai-chat.model';

import {
  ExternalDocumentReadinessService,
} from './external-document-readiness.service';


export type ExternalUploadScopeMode =
  'selected';


export type ExternalUploadOutcome =
  | {
      kind: 'error';
      message: string;
    }
  | {
      kind: 'wait';
      uploadedDocumentUuids: string[];
      queryDocumentUuids: string[];
      pendingDocumentUuids: string[];
      scopeMode: ExternalUploadScopeMode;
    }
  | {
      kind: 'send';
      uploadedDocumentUuids: string[];
      queryDocumentUuids: string[];
      scopeMode: ExternalUploadScopeMode;
    };


export interface ExternalUploadOutcomeRequest {
  requestedFileCount: number;
  selectedDocumentUuids: string[];
  uploadedDocuments: ExternalDocument[];
}


@Injectable({
  providedIn: 'root',
})
export class ExternalUploadOutcomePlannerService {
  constructor(
    private readonly readiness:
      ExternalDocumentReadinessService,
  ) {}


  plan(
    request:
      ExternalUploadOutcomeRequest,
  ): ExternalUploadOutcome {
    const uploadedDocumentUuids =
      this.normalizeUuids(
        request.uploadedDocuments
          .map(
            (document) =>
              document.uuid,
          ),
      );

    /*
     * Files were accepted by the upload request but
     * the backend did not return bindable document IDs.
     * Never broaden the query to unrelated conversation
     * documents in this situation.
     */
    if (
      request.requestedFileCount > 0 &&
      uploadedDocumentUuids.length === 0
    ) {
      return {
        kind:
          'error',

        message:
          'The files were uploaded, but the backend did not return document UUIDs. The AI request was not sent.',
      };
    }

    const failedDocument =
      request.uploadedDocuments.find(
        (document) =>
          this.readiness
            .isFailed(
              document,
            ),
      );

    if (failedDocument) {
      return {
        kind:
          'error',

        message:
          failedDocument
            .processing_error ||
          'One or more uploaded files failed during processing.',
      };
    }

    const queryDocumentUuids =
      this.normalizeUuids(
        [
          ...request
            .selectedDocumentUuids,

          ...uploadedDocumentUuids,
        ],
      );

    const pendingDocumentUuids =
      this.readiness
        .getPendingUuids(
          request.uploadedDocuments,
        );

    if (
      pendingDocumentUuids.length
    ) {
      return {
        kind:
          'wait',

        uploadedDocumentUuids,

        queryDocumentUuids,

        pendingDocumentUuids,

        scopeMode:
          'selected',
      };
    }

    return {
      kind:
        'send',

      uploadedDocumentUuids,

      queryDocumentUuids,

      scopeMode:
        'selected',
    };
  }


  private normalizeUuids(
    uuids: string[],
  ): string[] {
    return Array.from(
      new Set(
        uuids.filter(Boolean),
      ),
    );
  }
}
