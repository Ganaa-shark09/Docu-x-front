import {
  Injectable,
} from '@angular/core';

import {
  Observable,
} from 'rxjs';

import {
  ExternalDocumentBulkUploadResponse,
} from '../models/ai-chat.model';

import {
  AiChatService,
} from './ai-chat.service';


export interface ExternalDocumentUploadRequest {
  files: File[];
  conversationUuid?: string | null;
}


@Injectable({
  providedIn: 'root',
})
export class ExternalDocumentUploadService {
  constructor(
    private readonly aiChatService:
      AiChatService,
  ) {}


  upload(
    request:
      ExternalDocumentUploadRequest,
  ): Observable<
    ExternalDocumentBulkUploadResponse
  > {
    const formData =
      new FormData();

    if (
      request.conversationUuid
    ) {
      formData.append(
        'conversation_uuid',
        request.conversationUuid,
      );
    }

    formData.append(
      'document_type',
      'other',
    );

    formData.append(
      'sensitivity_label',
      'internal',
    );

    request.files.forEach(
      (file) => {
        formData.append(
          'files',
          file,
        );
      },
    );

    return this.aiChatService
      .bulkUploadExternalDocuments(
        formData,
      );
  }
}
