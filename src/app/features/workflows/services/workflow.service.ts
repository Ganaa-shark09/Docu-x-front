import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { environment } from '../../../../environments/environment';
import {
  Artifact,
  Command,
  Definition,
  DefinitionInput,
  Exception,
  Finding,
  FindingDecision,
  Page,
  PublishInput,
  Run,
  RunStatus,
  StartInput,
  StepRun,
  Version,
  WorkflowComment,
} from '../models/workflow.model';
@Injectable({ providedIn: 'root' })
export class WorkflowService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/workflows`;
  profile(): Observable<{ id: number; role: string; is_superuser?: boolean }> {
    return this.http.get<{ id: number; role: string; is_superuser?: boolean }>(`${environment.apiBaseUrl}/auth/profile/`);
  }
  templates(
    page = 1,
  ): Observable<Page<{ uuid: string; name: string; is_system: boolean; is_active: boolean }>> {
    type Choice = { uuid: string; name: string; is_system: boolean; is_active: boolean };
    return this.http
      .get<Page<Choice> | Choice[]>(this.base + '/extraction-templates/', {
        params: new HttpParams().set('page', page),
      })
      .pipe(
        map((rows) =>
          Array.isArray(rows)
            ? { count: rows.length, next: null, previous: null, results: rows }
            : rows,
        ),
      );
  }
  definitions(page = 1, workflowType = ''): Observable<Page<Definition>> {
    let params = new HttpParams().set('page', page);
    if (workflowType) params = params.set('type', workflowType);
    return this.http
      .get<Page<Definition> | Definition[]>(this.base + '/definitions/', {
        params,
      })
      .pipe(
        map((rows) =>
          Array.isArray(rows)
            ? { count: rows.length, next: null, previous: null, results: rows }
            : rows,
        ),
      );
  }
  definition(uuid: string): Observable<Definition> {
    return this.http.get<Definition>(`${this.base}/definitions/${uuid}/`);
  }
  create(input: DefinitionInput): Observable<Definition> {
    return this.http.post<Definition>(`${this.base}/definitions/`, input);
  }
  activate(uuid: string, is_active: boolean): Observable<Definition> {
    return this.http.post<Definition>(`${this.base}/definitions/${uuid}/activation/`, {
      is_active,
    });
  }
  versions(uuid: string): Observable<Version[]> {
    return this.http.get<Version[]>(`${this.base}/definitions/${uuid}/versions/`);
  }
  version(uuid: string): Observable<Version> {
    return this.http.get<Version>(`${this.base}/versions/${uuid}/`);
  }
  publish(uuid: string, input: PublishInput): Observable<Version> {
    return this.http.post<Version>(`${this.base}/definitions/${uuid}/versions/`, input);
  }
  runs(page = 1, status: RunStatus | '' = ''): Observable<Page<Run>> {
    let params = new HttpParams().set('page', page);
    if (status) params = params.set('status', status);
    return this.http
      .get<Page<Run> | Run[]>(this.base + '/runs/', { params })
      .pipe(
        map((rows) =>
          Array.isArray(rows)
            ? { count: rows.length, next: null, previous: null, results: rows }
            : rows,
        ),
      );
  }
  run(uuid: string): Observable<Run> {
    return this.http.get<Run>(`${this.base}/runs/${uuid}/`);
  }
  start(input: StartInput): Observable<Run> {
    return this.http.post<Run>(`${this.base}/runs/`, input);
  }
  command(uuid: string, input: Command): Observable<Run> {
    return this.http.post<Run>(`${this.base}/runs/${uuid}/commands/`, input);
  }
  steps(uuid: string): Observable<StepRun[]> {
    return this.http.get<StepRun[]>(`${this.base}/runs/${uuid}/steps/`);
  }
  findings(uuid: string): Observable<Finding[]> {
    return this.http.get<Finding[]>(`${this.base}/runs/${uuid}/findings/`);
  }
  reviewFinding(
    uuid: string,
    finding: string,
    status: FindingDecision,
    owner?: number | null,
  ): Observable<Finding> {
    return this.http.post<Finding>(`${this.base}/runs/${uuid}/findings/${finding}/review/`, {
      status,
      ...(owner === undefined ? {} : { owner }),
    });
  }
  exceptions(uuid: string): Observable<Exception[]> {
    return this.http.get<Exception[]>(`${this.base}/runs/${uuid}/exceptions/`);
  }
  comments(uuid: string): Observable<WorkflowComment[]> {
    return this.http.get<WorkflowComment[]>(`${this.base}/runs/${uuid}/comments/`);
  }
  artifacts(uuid: string): Observable<Artifact[]> {
    return this.http.get<Artifact[]>(`${this.base}/runs/${uuid}/artifacts/`);
  }
}
