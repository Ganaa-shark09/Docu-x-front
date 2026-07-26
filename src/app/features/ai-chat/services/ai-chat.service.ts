import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../../../environments/environment';
import { API_ENDPOINTS } from '../../../core/config/api-endpoints';
import { PaginatedResponse } from '../../../shared/models/api-response.model';
import {
  AiChatRequest,
  AiChatResponse,
  AiConversation,
  AiConversationDetail,
} from '../models/ai-chat.model';

@Injectable({
  providedIn: 'root',
})
export class AiChatService {
  private readonly http = inject(HttpClient);

  sendMessage(payload: AiChatRequest): Observable<AiChatResponse> {
    return this.http.post<AiChatResponse>(
      `${environment.apiBaseUrl}${API_ENDPOINTS.ai.chat}`,
      payload,
    );
  }

  listConversations(): Observable<AiConversation[]> {
    return this.http
      .get<PaginatedResponse<AiConversation> | AiConversation[]>(
        `${environment.apiBaseUrl}${API_ENDPOINTS.ai.conversations}`,
      )
      .pipe(map((response) => this.unwrapList(response)));
  }

  getConversation(uuid: string): Observable<AiConversationDetail> {
    return this.http.get<AiConversationDetail>(
      `${environment.apiBaseUrl}${API_ENDPOINTS.ai.conversations}${uuid}/`,
    );
  }

  private unwrapList<T>(response: PaginatedResponse<T> | T[]): T[] {
    if (Array.isArray(response)) {
      return response;
    }

    return response.results;
  }
}
