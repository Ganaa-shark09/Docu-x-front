import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ExtractionFieldReviewListComponent } from './extraction-field-review-list.component';
describe('Extraction field permission UX', () => {
  let fixture: ComponentFixture<ExtractionFieldReviewListComponent>;
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [ExtractionFieldReviewListComponent] });
    fixture = TestBed.createComponent(ExtractionFieldReviewListComponent);
  });
  it('does not reconstruct values or evidence from a restricted field', () => {
    fixture.componentRef.setInput('fields', [
      {
        field_key: 'salary',
        restricted: true,
        label: 'Salary',
        extracted_value: 'secret-payroll',
        corrected_value: 'secret-correction',
        source_text: 'secret-evidence',
      },
    ]);
    fixture.componentRef.setInput('rawData', { salary: { value: 'secret-raw' } });
    fixture.componentRef.setInput('canCorrect', true);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Restricted field');
    expect(fixture.nativeElement.textContent).not.toContain('secret');
    expect(fixture.nativeElement.querySelector('input')).toBeNull();
  });
  it('preserves a server-provided masked representation', () => {
    fixture.componentRef.setInput('fields', [
      { field_key: 'salary', restricted: true, value: '[REDACTED]' },
    ]);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('[REDACTED]');
  });
  it('view-only users cannot submit corrections', () => {
    fixture.componentRef.setInput('fields', [
      { uuid: 'f', field_key: 'salary', value: 'authorized-value' },
    ]);
    fixture.detectChanges();
    const emit = vi.spyOn(fixture.componentInstance.correctionSubmitted, 'emit');
    fixture.componentInstance.submitCorrection({ uuid: 'f', field_key: 'salary' });
    expect(emit).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('input')).toBeNull();
  });
  it('authorized visible fields can submit corrections', () => {
    fixture.componentRef.setInput('canCorrect', true);
    fixture.componentRef.setInput('fields', [
      { uuid: 'f', field_key: 'salary', value: 'authorized-value' },
    ]);
    fixture.detectChanges();
    const emit = vi.spyOn(fixture.componentInstance.correctionSubmitted, 'emit');
    fixture.componentInstance.corrections['f'] = 'new-value';
    fixture.componentInstance.submitCorrection({ uuid: 'f', field_key: 'salary' });
    expect(emit).toHaveBeenCalledWith({
      fieldUuid: 'f',
      correctedValue: 'new-value',
      reviewerComment: '',
    });
  });
  it('clears editing drafts when current server fields replace old fields', () => {
    fixture.componentInstance.corrections['f'] = 'old-protected';
    fixture.componentRef.setInput('fields', [{ field_key: 'salary', restricted: true }]);
    fixture.detectChanges();
    expect(fixture.componentInstance.corrections).toEqual({});
  });
});
