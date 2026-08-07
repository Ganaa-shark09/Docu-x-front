import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { API_ENDPOINTS } from '../../../core/config/api-endpoints';
import { environment } from '../../../../environments/environment';
import {
  AiChatRequest,
  AiChatResponse,
  AiChatScope,
  AiConversation,
  AiConversationDetail,
  ExternalAiChatRequest,
  ExternalDocument,
  ExternalDocumentBulkUploadResponse,
} from '../models/ai-chat.model';

type ConversationListResponse =
  | AiConversation[]
  | {
      count?: number;
      results?: AiConversation[];
      conversations?: AiConversation[];
      data?: AiConversation[];
    };

type ExternalDocumentListResponse =
  | ExternalDocument[]
  | {
      count?: number;
      results?: ExternalDocument[];
      documents?: ExternalDocument[];
      data?: ExternalDocument[];
    };

@Injectable({
  providedIn: 'root',
})
export class AiChatService {
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = environment.apiBaseUrl;

  sendInternalChatMessage(payload: AiChatRequest): Observable<AiChatResponse> {
    return this.http.post<AiChatResponse>(
      `${this.apiBaseUrl}${API_ENDPOINTS.ai.chat}`,
      payload,
    );
  }

  sendExternalChatMessage(payload: ExternalAiChatRequest): Observable<AiChatResponse> {
    return this.http.post<AiChatResponse>(
      `${this.apiBaseUrl}${API_ENDPOINTS.ai.externalChat}`,
      payload,
    );
  }

  sendMessage(payload: AiChatRequest): Observable<AiChatResponse> {
    return this.sendInternalChatMessage(payload);
  }

  listConversations(scope: AiChatScope): Observable<AiConversation[]> {
    const params = new HttpParams().set('scope', scope);

    return this.http
      .get<ConversationListResponse>(
        `${this.apiBaseUrl}${API_ENDPOINTS.ai.conversations}`,
        { params },
      )
      .pipe(
        map((response) => {
          if (Array.isArray(response)) {
            return response;
          }

          return response.results || response.conversations || response.data || [];
        }),
      );
  }

  getConversation(uuid: string): Observable<AiConversationDetail> {
    return this.http.get<AiConversationDetail>(
      `${this.apiBaseUrl}${API_ENDPOINTS.ai.conversations}${uuid}/`,
    );
  }

  getExternalDocuments(conversationUuid?: string): Observable<ExternalDocument[]> {
    let params = new HttpParams();

    if (conversationUuid) {
      params = params.set('conversation_uuid', conversationUuid);
    }

    return this.http
      .get<ExternalDocumentListResponse>(
        `${this.apiBaseUrl}${API_ENDPOINTS.ai.externalDocuments}`,
        { params },
      )
      .pipe(
        map((response) => {
          if (Array.isArray(response)) {
            return response;
          }

          return response.results || response.documents || response.data || [];
        }),
      );
  }

  uploadExternalDocument(formData: FormData): Observable<ExternalDocument> {
    return this.http.post<ExternalDocument>(
      `${this.apiBaseUrl}${API_ENDPOINTS.ai.externalDocuments}`,
      formData,
    );
  }

  bulkUploadExternalDocuments(
    formData: FormData,
  ): Observable<ExternalDocumentBulkUploadResponse> {
    return this.http.post<ExternalDocumentBulkUploadResponse>(
      `${this.apiBaseUrl}${API_ENDPOINTS.ai.externalDocumentsBulkUpload}`,
      formData,
    );
  }

  deleteExternalDocument(uuid: string): Observable<void> {
    return this.http.delete<void>(
      `${this.apiBaseUrl}${API_ENDPOINTS.ai.externalDocuments}${uuid}/`,
    );
  }
}
