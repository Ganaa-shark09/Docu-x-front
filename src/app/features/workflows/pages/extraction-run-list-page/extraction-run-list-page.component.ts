import { DatePipe, NgFor, NgIf } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { finalize } from 'rxjs';

import { ExtractionRun } from '../../models/extraction-workflow.model';
import { ExtractionWorkflowService } from '../../services/extraction-workflow.service';
import { ExtractionStatusBadgeComponent } from '../../components/extraction-status-badge/extraction-status-badge.component';

@Component({
  selector: 'app-extraction-run-list-page',
  standalone: true,
  imports: [
    DatePipe,
    ExtractionStatusBadgeComponent,
    NgFor,
    NgIf,
    ReactiveFormsModule,
    RouterLink,
  ],
  templateUrl: './extraction-run-list-page.component.html',
  styleUrl: './extraction-run-list-page.component.scss',
})
export class ExtractionRunListPageComponent implements OnInit {
  private readonly service = inject(ExtractionWorkflowService);
  private readonly fb = inject(FormBuilder);
  private readonly cdr = inject(ChangeDetectorRef);

  runs: ExtractionRun[] = [];
  isLoading = false;
  errorMessage = '';

  filtersForm = this.fb.nonNullable.group({
    search: [''],
    status: [''],
  });

  ngOnInit(): void {
    this.loadRuns();
  }

  loadRuns(): void {
    this.isLoading = true;
    this.errorMessage = '';
    this.cdr.markForCheck();

    this.service
      .getRuns(this.filtersForm.getRawValue())
      .pipe(
        finalize(() => {
          this.isLoading = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (runs) => {
          console.log('Extraction runs loaded:', runs);
          this.runs = runs;
          this.cdr.markForCheck();
        },
        error: (error) => {
          console.error('Extraction run list error:', error);
          this.errorMessage = 'Unable to load extraction workflow runs.';
          this.runs = [];
          this.cdr.markForCheck();
        },
      });
  }

  resetFilters(): void {
    this.filtersForm.reset({
      search: '',
      status: '',
    });

    this.loadRuns();
  }

  getDocumentTitle(run: ExtractionRun): string {
    const document = this.getDocumentObject(run);

    return (
      document?.title ||
      run.document_title ||
      run.original_filename ||
      run.document_uuid ||
      'Untitled document'
    );
  }

  getTemplateName(run: ExtractionRun): string {
    const template = this.getTemplateObject(run);

    return (
      template?.name ||
      run.template_name ||
      run.template_type ||
      'Extraction template'
    );
  }

  getConfidence(run: ExtractionRun): string {
    const raw = run.overall_confidence ?? run.confidence;

    if (raw === null || raw === undefined || raw === '') {
      return '-';
    }

    const value = Number(raw);

    if (!Number.isFinite(value)) {
      return String(raw);
    }

    return value <= 1 ? `${Math.round(value * 100)}%` : `${Math.round(value)}%`;
  }

  private getDocumentObject(run: ExtractionRun) {
    return run.document && typeof run.document === 'object' ? run.document : null;
  }

  private getTemplateObject(run: ExtractionRun) {
    return run.template && typeof run.template === 'object' ? run.template : null;
  }
}
