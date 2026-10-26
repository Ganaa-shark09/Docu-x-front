import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of, Subject } from 'rxjs';
import { beforeEach, afterEach, describe, it, expect } from 'vitest';
import { WorkflowRunDetailComponent } from './workflow-run-detail.component';
import { DocumentGovernanceService } from '../../documents/services/document-governance.service';
import { DocumentRealtimeService } from '../../../core/realtime/document-realtime.service';
import { legalRun, legalAnalysis } from '../legal-test.fixtures';
import { uuid, doc, definition, version, step, finding, artifact } from '../workflow-test.fixtures';
import { contract } from '../contract-test.fixtures';
import { environment } from '../../../../environments/environment';
import { LegalAnalysisComponent } from '../components/legal-analysis.component';
import { By } from '@angular/platform-browser';
describe('Legal integration preserves generic workflow and contract review', () => {
  let fixture: ComponentFixture<WorkflowRunDetailComponent>, http: HttpTestingController;
  const base = environment.apiBaseUrl,
    root = base + '/workflows',
    url = root + '/runs/' + uuid;
  function load(type = 'legal_clause_intelligence', enabled = true) {
    http.expectOne(url + '/').flush(legalRun);
    http
      .expectOne(root + '/definitions/' + uuid + '/')
      .flush({ ...definition, workflow_type: type });
    http.expectOne(root + '/versions/' + uuid + '/').flush({
      ...version,
      steps: [
        ...version.steps,
        {
          uuid: doc,
          key: 'metadata',
          name: 'Contract',
          step_type: 'processing',
          configuration: {
            adapter: 'contract_review',
            options: enabled ? { clause_playbook_version: uuid } : {},
          },
        },
      ],
    });
    http.expectOne(url + '/steps/').flush([step]);
    http.expectOne(url + '/findings/').flush([finding]);
    http.expectOne(url + '/exceptions/').flush([]);
    http.expectOne(url + '/comments/').flush([]);
    http.expectOne(url + '/artifacts/').flush([artifact]);
    fixture.detectChanges();
    if (type === 'contract_review') {
      http.expectOne(url + '/contract-review/').flush(contract);
      http
        .expectOne(base + '/documents/' + doc + '/')
        .flush({ uuid: doc, current_user_access: 'review' });
      fixture.detectChanges();
    }
    if (type === 'legal_clause_intelligence' || (enabled && type === 'contract_review')) {
      http.expectOne(url + '/clause-analysis/').flush(legalAnalysis);
      http
        .expectOne(base + '/documents/' + doc + '/')
        .flush({ uuid: doc, current_user_access: 'review' });
      fixture.detectChanges();
    }
  }
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [WorkflowRunDetailComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({ uuid })) } },
        {
          provide: DocumentGovernanceService,
          useValue: { changes$: new Subject(), memberships: () => of([]) },
        },
        {
          provide: DocumentRealtimeService,
          useValue: { revoked$: new Subject(), subscribeDocuments: () => {} },
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(WorkflowRunDetailComponent);
  });
  afterEach(() => {
    fixture.destroy();
    http.verify({ ignoreCancelled: true });
  });
  it('uses the existing run URL with generic findings and existing approval links', () => {
    load();
    expect(fixture.nativeElement.querySelector('app-legal-analysis')).toBeTruthy();
    expect(fixture.nativeElement.textContent).toContain('Possible risk');
    expect(fixture.nativeElement.querySelector('a[href="/approvals/' + uuid + '"]')).toBeTruthy();
  });
  it('does not read legal data for legacy contracts', () => {
    load('contract_review', false);
    http.expectNone(url + '/clause-analysis/');
    expect(fixture.nativeElement.querySelector('app-contract-workspace')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('app-legal-analysis')).toBeNull();
  });
  it('embeds clause intelligence inside the existing contract workspace when policy opts in', () => {
    load('contract_review', true);
    expect(
      fixture.nativeElement.querySelector('app-contract-workspace app-legal-analysis'),
    ).toBeTruthy();
  });
  it('blocks generic acceptance while legal review is incomplete', () => {
    load();
    fixture.componentInstance.command({ action: 'accept', comment: '' });
    http.expectNone(url + '/commands/');
  });
  it('blocks parent refresh and generic decisions while a legal draft is open', () => {
    load();
    const legal = fixture.debugElement.query(By.directive(LegalAnalysisComponent))
      .componentInstance as LegalAnalysisComponent;
    legal.reviewClause(legalAnalysis.clauses[0]);
    fixture.componentInstance.load();
    fixture.componentInstance.command({ action: 'accept', comment: 'Reviewed' });
    http.expectNone(url + '/');
    http.expectNone(url + '/commands/');
    expect(fixture.componentInstance.invoicePending()).toBe(true);
    legal.cancelEdit();
    expect(fixture.componentInstance.invoicePending()).toBe(false);
  });
  it('keeps existing generic finding review endpoint', () => {
    load();
    fixture.componentInstance.reviewFinding(finding, 'accepted');
    const r = http.expectOne(url + '/findings/' + uuid + '/review/');
    expect(r.request.body.status).toBe('accepted');
    r.flush({ ...finding, review_state: 'accepted' });
  });
});
