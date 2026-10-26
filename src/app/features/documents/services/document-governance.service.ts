import { DocumentScope } from './documents.service';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, Subject, EMPTY, expand, map, reduce, tap } from 'rxjs';
import { environment } from '../../../../environments/environment';
import {
  DocumentGovernance,
  GovernancePatch,
  SensitivityPolicy,
  RetentionPolicy,
  FieldPolicy,
  Membership,
} from '../models/governance.model';

interface Page<T> {
  results: T[];
  next: string | null;
}
@Injectable({ providedIn: 'root' })
export class DocumentGovernanceService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiBaseUrl;
  private readonly changes = new Subject<string>();
  readonly changes$ = this.changes.asObservable();
  invalidate(uuid: string): void {
    this.changes.next(uuid);
  }
  get(uuid: string, scope: DocumentScope = 'internal'): Observable<DocumentGovernance> {
    return this.http.get<DocumentGovernance>(
      `${this.base}/documents/${uuid}/governance/${this.scopeQuery(scope)}`,
    );
  }
  update(
    uuid: string,
    patch: GovernancePatch,
    scope: DocumentScope = 'internal',
  ): Observable<DocumentGovernance> {
    return this.http
      .patch<DocumentGovernance>(
        `${this.base}/documents/${uuid}/governance/${this.scopeQuery(scope)}`,
        patch,
      )
      .pipe(tap(() => this.invalidate(uuid)));
  }
  fields(uuid: string, scope: DocumentScope = 'internal'): Observable<FieldPolicy[]> {
    return this.http.get<FieldPolicy[]>(
      `${this.base}/documents/${uuid}/field-policies/${this.scopeQuery(scope)}`,
    );
  }
  addField(
    uuid: string,
    rule: Omit<FieldPolicy, 'uuid'>,
    scope: DocumentScope = 'internal',
  ): Observable<FieldPolicy> {
    return this.http
      .post<FieldPolicy>(
        `${this.base}/documents/${uuid}/field-policies/${this.scopeQuery(scope)}`,
        rule,
      )
      .pipe(tap(() => this.invalidate(uuid)));
  }
  revoke(
    uuid: string,
    ruleUuid: string,
    kind: 'field' | 'access',
    scope: DocumentScope = 'internal',
  ): Observable<void> {
    return this.http
      .delete<void>(
        `${this.base}/documents/${uuid}/${kind}-policies/${ruleUuid}/${this.scopeQuery(scope)}`,
      )
      .pipe(tap(() => this.invalidate(uuid)));
  }
  sensitivity(): Observable<SensitivityPolicy[]> {
    return this.list('/documents/sensitivity-policies/');
  }
  retention(): Observable<RetentionPolicy[]> {
    return this.list('/documents/retention-policies/');
  }
  memberships(): Observable<Membership[]> {
    return this.list('/workspaces/memberships/');
  }
  saveSensitivity(
    value: Omit<SensitivityPolicy, 'uuid'>,
    uuid?: string,
  ): Observable<SensitivityPolicy> {
    const url = `${this.base}/documents/sensitivity-policies/${uuid ? uuid + '/' : ''}`;
    return uuid
      ? this.http.patch<SensitivityPolicy>(url, value)
      : this.http.post<SensitivityPolicy>(url, value);
  }
  saveRetention(value: Omit<RetentionPolicy, 'uuid'>, uuid?: string): Observable<RetentionPolicy> {
    const url = `${this.base}/documents/retention-policies/${uuid ? uuid + '/' : ''}`;
    return uuid
      ? this.http.patch<RetentionPolicy>(url, value)
      : this.http.post<RetentionPolicy>(url, value);
  }
  deletePolicy(uuid: string, kind: 'sensitivity' | 'retention'): Observable<void> {
    return this.http.delete<void>(`${this.base}/documents/${kind}-policies/${uuid}/`);
  }
  private scopeQuery(scope: DocumentScope): string {
    return scope === 'external' ? '?scope=external' : '';
  }
  private list<T>(path: string): Observable<T[]> {
    const page = (index: number) =>
      this.http.get<T[] | Page<T>>(`${this.base}${path}`, {
        params: new HttpParams().set('page', index),
      });
    return page(1).pipe(
      expand((response, index) =>
        !Array.isArray(response) && response.next ? page(index + 2) : EMPTY,
      ),
      map((response) => (Array.isArray(response) ? response : response.results)),
      reduce((all, rows) => [...all, ...rows], [] as T[]),
    );
  }
}
