import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ExtractionRunDetailPageComponent } from './extraction-run-detail-page.component';
import { ExtractionWorkflowService } from '../../services/extraction-workflow.service';
import { DocumentsService } from '../../../documents/services/documents.service';
import { ExtractionRun } from '../../models/extraction-workflow.model';
const run: ExtractionRun = {
  uuid: 'run',
  document_uuid: 'doc',
  document_title: 'Payroll',
  status: 'review_required',
  created_at: '2026-01-01',
  result_fields: [{ uuid: 'salary', field_key: 'salary', value: 'visible-value' }],
};
describe('Extraction action authorization', () => {
  let component: ExtractionRunDetailPageComponent;
  const service = {
    getRun: vi.fn(() => of(run)),
    getFields: vi.fn(() => of(run.result_fields)),
    correctField: vi.fn(),
    exportRun: vi.fn(),
  };
  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      imports: [ExtractionRunDetailPageComponent],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ uuid: 'run' }) } },
        },
        { provide: ExtractionWorkflowService, useValue: service },
        {
          provide: DocumentsService,
          useValue: { getDocument: () => of({ current_user_access: 'review' }) },
        },
      ],
    });
    component = TestBed.createComponent(ExtractionRunDetailPageComponent).componentInstance;
    component.ngOnInit();
  });
  it('handles correction denial without pretending a field was saved', () => {
    service.correctField.mockReturnValue(
      throwError(
        () =>
          new HttpErrorResponse({ status: 403, error: { detail: 'Review permission revoked.' } }),
      ),
    );
    component.saveCorrection({
      fieldUuid: 'salary',
      correctedValue: 'new-value',
      reviewerComment: '',
    });
    expect(component.errorMessage).toContain('revoked');
    expect(component.successMessage).toBe('');
    expect(component.canCorrect).toBe(false);
    expect(component.isSavingFieldUuid).toBeNull();
  });
  it('handles export denial without creating a client-side export', () => {
    service.exportRun.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 403 })));
    component.exportJson();
    expect(component.exportDenied).toBe(true);
    expect(component.successMessage).toBe('');
    expect(component.errorMessage).toContain('not permitted');
    expect(component.isExporting).toBe(false);
  });
  it('prevents approved extraction corrections even with review access', () => {
    component.run = { ...run, status: 'approved' };
    component.saveCorrection({
      fieldUuid: 'salary',
      correctedValue: 'new-value',
      reviewerComment: '',
    });
    expect(component.canCorrect).toBe(false);
    expect(service.correctField).not.toHaveBeenCalled();
  });
});
