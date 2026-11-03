import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { EMPTY, Observable, defer, expand, map, reduce, throwError } from 'rxjs';
import { API_ENDPOINTS } from '../config/api-endpoints';
import { environment } from '../../../environments/environment';

export type AiModelProvider = 'groq' | 'openai' | 'gemini' | 'anthropic' | 'ollama' | 'azure_openai' | 'local' | string;

export interface CompanyAiModel {
  uuid: string;
  company: string;
  provider_config: string;
  provider_type: AiModelProvider;
  model_id: string;
  display_name: string;
  is_enabled: boolean;
  is_default: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface AiModelUserProfile {
  id: number;
  username: string;
  role: string;
  is_superuser?: boolean;
  company?: number | null;
  company_name?: string;
}

type ModelListResponse = CompanyAiModel[] | {
  results?: CompanyAiModel[];
  count?: number;
  next?: string | null;
};

@Injectable({ providedIn: 'root' })
export class CompanyAiModelService {
  private readonly http = inject(HttpClient);
  private readonly apiRoot = environment.apiBaseUrl;

  getMyProfile(): Observable<AiModelUserProfile> {
    return this.http.get<AiModelUserProfile>(`${this.apiRoot}${API_ENDPOINTS.auth.profile}`);
  }

  /** A tenant member receives only their company's currently available grants. */
  listApprovedModels(): Observable<CompanyAiModel[]> {
    const endpoint = `${this.apiRoot}${API_ENDPOINTS.ai.companyModels}`;
    // DRF may paginate model grants. Follow only pages of this exact API path;
    // never send the Authorization header to an arbitrary URL in `next`.
    return defer(() => {
      const seenPages = new Set<string>();
      const expectedPath = new URL(endpoint, 'https://docux.invalid').pathname;
      return this.http.get<ModelListResponse>(endpoint).pipe(
        expand(response => {
          const next = Array.isArray(response) ? null : response.next;
          if (!next) return EMPTY;
          let parsed: URL;
          try { parsed = new URL(next, 'https://docux.invalid'); }
          catch { return throwError(() => new Error('Invalid model catalog page URL.')); }
          if (parsed.pathname !== expectedPath || seenPages.has(parsed.search) || seenPages.size >= 50) {
            return throwError(() => new Error('Unexpected model catalog pagination response.'));
          }
          seenPages.add(parsed.search);
          return this.http.get<ModelListResponse>(endpoint + parsed.search);
        }),
        map(response => Array.isArray(response) ? response : (response.results ?? [])),
        reduce((all, rows) => [...all, ...rows], [] as CompanyAiModel[]),
        map(rows => rows.filter(row => row.is_enabled)),
      );
    });
  }

  setCompanyDefault(grantUuid: string): Observable<CompanyAiModel> {
    return this.http.post<CompanyAiModel>(
      `${this.apiRoot}${API_ENDPOINTS.ai.companyModels}${encodeURIComponent(grantUuid)}/set-default/`,
      {},
    );
  }
}

export function modelApiError(error: any, fallback: string): string {
  const body = error?.error;
  const detail = body?.detail;
  const modelError = body?.model_uuid;
  const nonFieldError = body?.non_field_errors;
  for (const value of [detail, modelError, nonFieldError]) {
    if (typeof value === 'string' && value.trim()) return value;
    if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  }
  if (error?.status === 403) return 'This action is not permitted for your company or role.';
  if (error?.status === 401) return 'Your session has expired. Please sign in again.';
  return fallback;
}
