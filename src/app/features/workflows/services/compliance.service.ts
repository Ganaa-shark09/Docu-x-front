import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { environment } from '../../../../environments/environment';
import { Page, Principal, Run, Json } from '../models/workflow.model';
import {
  Framework,
  FrameworkDraft,
  FrameworkVersion,
  Requirement,
  Control,
  ControlDefinition,
  Mapping,
  Assessment,
  CreateAssessment,
  Detail,
  Evidence,
  EvidenceInput,
  Decision,
  DecisionInput,
  Output,
  Evaluation,
  Discovery,
} from '../models/compliance.model';
@Injectable({ providedIn: 'root' })
export class ComplianceService {
  private http = inject(HttpClient);
  private base = environment.apiBaseUrl + '/workflows/';
  url(group: string, id = '', action = '') {
    return this.base + group + '/' + (id ? encodeURIComponent(id) + '/' : '') + action;
  }
  frameworks(page = 1) {
    return this.http.get<Page<Framework>>(this.url('compliance-frameworks'), { params: { page } });
  }
  framework(id: string) {
    return this.http.get<Framework>(this.url('compliance-frameworks', id));
  }
  createFramework(input: {
    code: string;
    name: string;
    description: string;
    source: string;
    jurisdiction: string;
    draft: FrameworkDraft;
  }) {
    return this.http.post<Framework>(this.url('compliance-frameworks'), input);
  }
  draft(id: string, revision: number, draft: FrameworkDraft) {
    return this.http.post<Framework>(this.url('compliance-frameworks', id, 'draft/'), {
      revision,
      draft,
    });
  }
  publish(id: string, revision: number) {
    return this.http.post<{ uuid: string; number: number; digest: string }>(
      this.url('compliance-frameworks', id, 'publish/'),
      { revision },
    );
  }
  activate(id: string, revision: number, version_uuid: string | null) {
    return this.http.post<Framework>(this.url('compliance-frameworks', id, 'activate/'), {
      revision,
      version_uuid,
    });
  }
  versions(id: string, page = 1) {
    return this.http.get<Page<FrameworkVersion>>(
      this.url('compliance-frameworks', id, 'versions/'),
      { params: { page } },
    );
  }
  requirements(id: string, version_uuid: string, page = 1) {
    return this.http.get<Page<Requirement>>(
      this.url('compliance-frameworks', id, 'requirements/'),
      { params: { page, version_uuid } },
    );
  }
  controls(page = 1) {
    return this.http.get<Page<Control>>(this.url('compliance-controls'), { params: { page } });
  }
  control(id: string) {
    return this.http.get<Control>(this.url('compliance-controls', id));
  }
  createControl(input: {
    code: string;
    name: string;
    department: number | null;
    definition: ControlDefinition;
  }) {
    return this.http.post<Control>(this.url('compliance-controls'), input);
  }
  configureControl(c: Control, name: string, definition: ControlDefinition, is_active: boolean) {
    return this.http.post<Control>(this.url('compliance-controls', c.uuid, 'configure/'), {
      revision: c.revision,
      name,
      definition,
      is_active,
    });
  }
  mappings(id: string, page = 1) {
    return this.http.get<Page<Mapping>>(this.url('compliance-controls', id, 'mappings/'), {
      params: { page },
    });
  }
  map(c: Control, requirement_uuid: string, is_active: boolean) {
    return this.http.post<{ uuid: string; revision: number }>(
      this.url('compliance-controls', c.uuid, 'mapping/'),
      { revision: c.revision, requirement_uuid, is_active },
    );
  }
  assessments(page = 1) {
    return this.http.get<Page<Assessment>>(this.url('compliance-assessments'), {
      params: { page },
    });
  }
  assessment(id: string) {
    return this.http.get<Detail>(this.url('compliance-assessments', id));
  }
  createAssessment(input: CreateAssessment) {
    return this.http.post<Assessment>(this.url('compliance-assessments'), input);
  }
  submit(
    id: string,
    revision: number,
    reviewer: Principal,
    approver: Principal,
    idempotency_key: string,
  ) {
    return this.http.post<Run>(this.url('compliance-assessments', id, 'submit/'), {
      revision,
      reviewer,
      approver,
      idempotency_key,
    });
  }
  evidence(id: string, page = 1) {
    return this.http.get<Page<Evidence>>(this.url('compliance-assessments', id, 'evidence/'), {
      params: { page },
    });
  }
  link(id: string, input: EvidenceInput) {
    return this.http.post<{ uuid: string; revision: number }>(
      this.url('compliance-assessments', id, 'evidence/'),
      input,
    );
  }
  discover(id: string, query: string) {
    return this.http.post<Discovery>(this.url('compliance-assessments', id, 'discover/'), {
      query,
    });
  }
  evaluate(id: string, revision: number, idempotency_key: string) {
    return this.http.post<{ uuid: string; revision: number; data: Evaluation['data'] }>(
      this.url('compliance-assessments', id, 'evaluate/'),
      { revision, idempotency_key },
    );
  }
  decisions(id: string, page = 1) {
    return this.http.get<Page<Decision>>(this.url('compliance-assessments', id, 'decisions/'), {
      params: { page },
    });
  }
  decide(id: string, input: DecisionInput) {
    return this.http.post<{ uuid: string; revision: number }>(
      this.url('compliance-assessments', id, 'decisions/'),
      input,
    );
  }
  outputs(id: string, page = 1) {
    return this.http.get<Page<Output>>(this.url('compliance-assessments', id, 'outputs/'), {
      params: { page },
    });
  }
  evaluations(id: string, page = 1) {
    return this.http.get<Page<Evaluation>>(this.url('compliance-assessments', id, 'evaluations/'), {
      params: { page },
    });
  }
  export(id: string, output_uuid: string, external: boolean) {
    return this.http.post<{ output_uuid: string; external: boolean; digest: string; data: Json }>(
      this.url('compliance-assessments', id, 'export/'),
      { output_uuid, external },
    );
  }
  message(e: unknown) {
    const status = e instanceof HttpErrorResponse ? e.status : 0;
    return (
      (
        {
          400: 'The command could not be validated. Check the selected scope, evidence and required review.',
          401: 'Your session expired. Sign in again.',
          403: 'You no longer have access to this assessment or evidence.',
          404: 'This assessment or source is unavailable.',
          409: 'This assessment changed while you were reviewing it. Current state was refreshed; review before submitting again.',
          422: 'The assessment requires valid current evidence and completed reviews.',
        } as Record<number, string>
      )[status] || 'The request could not be completed. Retry after checking the current state.'
    );
  }
}
