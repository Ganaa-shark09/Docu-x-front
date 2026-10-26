import { HttpClient, HttpErrorResponse, HttpResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { Page, Run } from '../models/workflow.model';
import {
  ClauseType,
  TaxonomyInput,
  Playbook,
  PlaybookDraft,
  PlaybookVersion,
  ClauseAnalysis,
  ClauseInstance,
  ClauseDeviation,
  ClauseEvidence,
  ClauseCorrection,
  LegalOutput,
  DecisionInput,
  CorrectionInput,
  LegalDefinitionInput,
  LegalDefinitionResult,
} from '../models/legal-clause.model';
@Injectable({ providedIn: 'root' })
export class LegalClauseService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiBaseUrl + '/workflows';
  private readonly changes = new Subject<string>();
  readonly revoked$ = this.changes.asObservable();
  invalidate(uuid = '*'): void {
    this.changes.next(uuid);
  }
  taxonomy(page = 1): Observable<Page<ClauseType>> {
    return this.http.get<Page<ClauseType>>(this.base + '/clause-types/', { params: { page } });
  }
  type(uuid: string): Observable<ClauseType> {
    return this.http.get<ClauseType>(this.base + '/clause-types/' + uuid + '/');
  }
  createType(value: TaxonomyInput): Observable<ClauseType> {
    return this.http.post<ClauseType>(this.base + '/clause-types/', value);
  }
  updateType(uuid: string, value: Partial<TaxonomyInput>): Observable<ClauseType> {
    return this.http.patch<ClauseType>(this.base + '/clause-types/' + uuid + '/', value);
  }
  playbooks(page = 1): Observable<Page<Playbook>> {
    return this.http.get<Page<Playbook>>(this.base + '/clause-playbooks/', { params: { page } });
  }
  playbook(uuid: string): Observable<Playbook> {
    return this.http.get<Playbook>(this.base + '/clause-playbooks/' + uuid + '/');
  }
  createPlaybook(value: {
    name: string;
    description: string;
    department: number | null;
    draft: PlaybookDraft;
  }): Observable<Playbook> {
    return this.http.post<Playbook>(this.base + '/clause-playbooks/', value);
  }
  editDraft(
    uuid: string,
    value: { expected_revision: number; name: string; description: string; draft: PlaybookDraft },
  ): Observable<Playbook> {
    return this.http.patch<Playbook>(this.base + '/clause-playbooks/' + uuid + '/draft/', value);
  }
  publish(uuid: string, expected_revision: number): Observable<PlaybookVersion> {
    return this.http.post<PlaybookVersion>(this.base + '/clause-playbooks/' + uuid + '/publish/', {
      expected_revision,
    });
  }
  activate(
    uuid: string,
    expected_revision: number,
    active: boolean,
    version?: string,
  ): Observable<Playbook> {
    return this.http.post<Playbook>(this.base + '/clause-playbooks/' + uuid + '/activate/', {
      expected_revision,
      active,
      ...(version ? { version } : {}),
    });
  }
  versions(uuid: string, page = 1): Observable<Page<PlaybookVersion>> {
    return this.http.get<Page<PlaybookVersion>>(
      this.base + '/clause-playbooks/' + uuid + '/versions/',
      { params: { page } },
    );
  }
  forRun(uuid: string): Observable<ClauseAnalysis> {
    return this.http.get<ClauseAnalysis>(this.base + '/runs/' + uuid + '/clause-analysis/');
  }
  forContract(uuid: string): Observable<ClauseAnalysis> {
    return this.http.get<ClauseAnalysis>(
      this.base + '/contract-reviews/' + uuid + '/clause-analysis/',
    );
  }
  analysis(uuid: string): Observable<ClauseAnalysis> {
    return this.http.get<ClauseAnalysis>(this.base + '/clause-analyses/' + uuid + '/');
  }
  clauses(uuid: string): Observable<ClauseInstance[]> {
    return this.http.get<ClauseInstance[]>(this.base + '/clause-analyses/' + uuid + '/clauses/');
  }
  deviations(uuid: string): Observable<ClauseDeviation[]> {
    return this.http.get<ClauseDeviation[]>(
      this.base + '/clause-analyses/' + uuid + '/deviations/',
    );
  }
  evidence(uuid: string): Observable<
    {
      clause_uuid: string;
      evidence: ClauseEvidence[];
      fact_evidence: Record<string, ClauseEvidence[]>;
    }[]
  > {
    return this.http.get<
      {
        clause_uuid: string;
        evidence: ClauseEvidence[];
        fact_evidence: Record<string, ClauseEvidence[]>;
      }[]
    >(this.base + '/clause-analyses/' + uuid + '/evidence/');
  }
  decide(
    uuid: string,
    input: DecisionInput,
  ): Observable<{ uuid: string; revision: number; workflow_revision: number; decision: string }> {
    return this.http.post<{
      uuid: string;
      revision: number;
      workflow_revision: number;
      decision: string;
    }>(this.base + '/clause-analyses/' + uuid + '/decision/', input);
  }
  correct(uuid: string, input: CorrectionInput): Observable<{ uuid: string; revision: number }> {
    return this.http.post<{ uuid: string; revision: number }>(
      this.base + '/clause-analyses/' + uuid + '/correct/',
      input,
    );
  }
  corrections(uuid: string, page = 1): Observable<Page<ClauseCorrection>> {
    return this.http.get<Page<ClauseCorrection>>(
      this.base + '/clause-analyses/' + uuid + '/corrections/',
      { params: { page } },
    );
  }
  outputs(uuid: string): Observable<LegalOutput[]> {
    return this.http.get<LegalOutput[]>(this.base + '/clause-analyses/' + uuid + '/outputs/');
  }
  reanalyze(uuid: string, version: string, idempotency_key: string): Observable<Run> {
    return this.http.post<Run>(this.base + '/clause-analyses/' + uuid + '/reanalyze/', {
      version,
      idempotency_key,
    });
  }
  export(uuid: string): Observable<HttpResponse<Blob>> {
    return this.http.get(this.base + '/clause-analyses/' + uuid + '/export/', {
      observe: 'response',
      responseType: 'blob',
    });
  }
  createDefinition(value: LegalDefinitionInput): Observable<LegalDefinitionResult> {
    return this.http.post<LegalDefinitionResult>(
      this.base + '/clause-analyses/definitions/',
      value,
    );
  }
  message(error: unknown): string {
    const status = error instanceof HttpErrorResponse ? error.status : 0;
    if (status === 401) return 'Your session has ended. Sign in again.';
    if (status === 403)
      return 'You no longer have permission to access or modify this legal resource.';
    if (status === 404) return 'This legal resource is unavailable or no longer accessible.';
    if (status === 409)
      return 'This resource changed while you were working. Latest data has been refreshed; reconsider your action before submitting again.';
    if ([400, 422].includes(status))
      return 'Validation failed. Check rule conditions, conflicting requirements, evidence and review state. Publication and finalization require complete validated data.';
    return 'Unable to complete the legal request. Refresh to check access and try again.';
  }
}
