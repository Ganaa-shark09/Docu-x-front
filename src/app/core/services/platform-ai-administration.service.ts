import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { EMPTY, Observable, defer, expand, map, reduce, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { API_ENDPOINTS } from '../config/api-endpoints';
import { CompanyAiModel } from './company-ai-model.service';

export interface PlatformAiCompany {
  uuid: string;
  name: string;
  slug: string;
  status: string;
  allow_cloud_llm: boolean;
  allow_local_llm: boolean;
}

export type AiProviderType = 'groq' | 'openai' | 'gemini' | 'anthropic' | 'ollama' | 'azure_openai' | 'local';
export const PROVIDER_TYPES: { value: AiProviderType; label: string }[] = [
  { value: 'groq', label: 'Groq' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'gemini', label: 'Google Gemini' },
  { value: 'anthropic', label: 'Anthropic Claude' },
  { value: 'ollama', label: 'Ollama (private/local)' },
  { value: 'azure_openai', label: 'Azure OpenAI' },
  { value: 'local', label: 'Local fallback' },
];
export interface PlatformAiProvider {
  uuid: string;
  company: string;
  name: string;
  provider_type: AiProviderType;
  is_active: boolean;
  model_name: string;
  endpoint_url: string;
  deployment_name: string;
  api_version: string;
  max_tokens: number;
  temperature: number;
  has_api_key: boolean;
}
export type ProviderDraft = Omit<PlatformAiProvider, 'uuid' | 'has_api_key'> & { api_key: string };
export interface GrantDraft {
  company: string;
  provider_config: string;
  model_id: string;
  display_name: string;
  is_enabled: boolean;
  is_default: boolean;
}
interface Page<T> { results?: T[]; next?: string | null; }

@Injectable({ providedIn: 'root' })
export class PlatformAiAdministrationService {
  private readonly http = inject(HttpClient);
  private readonly root = environment.apiBaseUrl;
  private readonly companiesUrl = `${this.root}${API_ENDPOINTS.ai.platformCompanies}`;
  private readonly providersUrl = `${this.root}${API_ENDPOINTS.ai.platformProviders}`;
  private readonly grantsUrl = `${this.root}${API_ENDPOINTS.ai.companyModels}`;

  private collect<T>(url: string, lockedCompany?: string): Observable<T[]> {
    return defer(() => {
      const path = new URL(url, 'https://docux.invalid').pathname;
      const seen = new Set<string>();
      return this.http.get<Page<T> | T[]>(url).pipe(
        expand(response => {
          const next = Array.isArray(response) ? null : response.next;
          if (!next) return EMPTY;
          let parsed: URL;
          try { parsed = new URL(next, 'https://docux.invalid'); }
          catch { return throwError(() => new Error('Invalid API pagination link.')); }
          if (parsed.pathname !== path || seen.has(parsed.search) || seen.size >= 100 ||
              (lockedCompany && parsed.searchParams.get('company') !== lockedCompany)) {
            return throwError(() => new Error('Unexpected administration pagination response.'));
          }
          seen.add(parsed.search);
          return this.http.get<Page<T> | T[]>(url.split('?')[0] + parsed.search);
        }),
        map(response => Array.isArray(response) ? response : (response.results || [])),
        reduce((all, rows) => [...all, ...rows], [] as T[]),
      );
    });
  }

  listCompanies(): Observable<PlatformAiCompany[]> { return this.collect<PlatformAiCompany>(this.companiesUrl); }
  updatePolicy(uuid: string, flags: Pick<PlatformAiCompany, 'allow_cloud_llm' | 'allow_local_llm'>): Observable<PlatformAiCompany> {
    return this.http.patch<PlatformAiCompany>(`${this.companiesUrl}${encodeURIComponent(uuid)}/`, flags);
  }
  listProviders(companyUuid: string): Observable<PlatformAiProvider[]> {
    return this.http.get<PlatformAiProvider[]>(`${this.providersUrl}?company=${encodeURIComponent(companyUuid)}`);
  }
  createProvider(payload: ProviderDraft): Observable<PlatformAiProvider> {
    return this.http.post<PlatformAiProvider>(this.providersUrl, payload);
  }
  updateProvider(uuid: string, payload: Partial<ProviderDraft>): Observable<PlatformAiProvider> {
    return this.http.patch<PlatformAiProvider>(`${this.providersUrl}${encodeURIComponent(uuid)}/`, payload);
  }
  listGrants(companyUuid: string): Observable<CompanyAiModel[]> {
    const query = `?company=${encodeURIComponent(companyUuid)}`;
    return this.collect<CompanyAiModel>(this.grantsUrl + query, companyUuid);
  }
  createGrant(payload: GrantDraft): Observable<CompanyAiModel> {
    return this.http.post<CompanyAiModel>(this.grantsUrl, payload);
  }
  updateGrant(uuid: string, payload: { is_enabled: boolean; is_default?: boolean }): Observable<CompanyAiModel> {
    return this.http.patch<CompanyAiModel>(`${this.grantsUrl}${encodeURIComponent(uuid)}/`, payload);
  }
}
