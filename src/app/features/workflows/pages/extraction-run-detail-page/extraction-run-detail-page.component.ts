import { DatePipe, NgIf } from '@angular/common';
import {
  ChangeDetectorRef,
  Component,
  NgZone,
  OnInit,
  inject,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import {
  ExtractionResultField,
  ExtractionRun,
} from '../../models/extraction-workflow.model';
import { ExtractionWorkflowService } from '../../services/extraction-workflow.service';
import { ExtractionStatusBadgeComponent } from '../../components/extraction-status-badge/extraction-status-badge.component';
import { ExtractionFieldReviewListComponent } from '../../components/extraction-field-review-list/extraction-field-review-list.component';

@Component({
  selector: 'app-extraction-run-detail-page',
  standalone: true,
  imports: [
    DatePipe,
    ExtractionFieldReviewListComponent,
    ExtractionStatusBadgeComponent,
    NgIf,
    RouterLink,
  ],
  templateUrl: './extraction-run-detail-page.component.html',
  styleUrl: './extraction-run-detail-page.component.scss',
})
export class ExtractionRunDetailPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly service = inject(ExtractionWorkflowService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly ngZone = inject(NgZone);

  run: ExtractionRun | null = null;
  fields: ExtractionResultField[] = [];

  isLoading = false;
  isRerunning = false;
  isSubmittingApproval = false;
  isExporting = false;
  isSavingFieldUuid: string | null = null;

  errorMessage = '';
  successMessage = '';

  ngOnInit(): void {
    this.loadRun();
  }

  loadRun(): void {
    const uuid = this.route.snapshot.paramMap.get('uuid');

    if (!uuid) {
      this.router.navigate(['/workflows']);
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';
    this.successMessage = '';
    this.cdr.markForCheck();

    this.service.getRun(uuid).subscribe({
      next: (run) => {
        this.ngZone.run(() => {
          console.log('Extraction run detail loaded:', run);
          this.run = run;
          this.fields = run.result_fields || run.fields || [];
          this.isLoading = false;
          this.cdr.detectChanges();
          this.loadFields(run.uuid);
        });
      },
      error: (error) => {
        this.ngZone.run(() => {
          console.error('Extraction run detail error:', error);
          this.errorMessage = 'Unable to load extraction run detail.';
          this.isLoading = false;
          this.cdr.detectChanges();
        });
      },
    });
  }

  loadFields(uuid: string): void {
    this.service.getFields(uuid).subscribe({
      next: (fields) => {
        this.ngZone.run(() => {
          this.fields = fields || [];
          this.cdr.detectChanges();
        });
      },
      error: () => {
        // Detail serializer may already include fields. Keep existing fields.
      },
    });
  }

  rerun(): void {
    if (!this.run) {
      return;
    }

    this.isRerunning = true;
    this.errorMessage = '';
    this.successMessage = '';
    this.cdr.markForCheck();

    this.service.rerun(this.run.uuid).subscribe({
      next: (response) => {
        this.ngZone.run(() => {
          this.successMessage = response.detail || 'Extraction rerun started.';
          this.isRerunning = false;
          this.cdr.detectChanges();
          this.loadRun();
        });
      },
      error: (error) => {
        this.ngZone.run(() => {
          console.error('Extraction rerun error:', error);
          this.errorMessage = error?.error?.detail || 'Unable to rerun extraction.';
          this.isRerunning = false;
          this.cdr.detectChanges();
        });
      },
    });
  }

  submitForApproval(): void {
    if (!this.run) {
      return;
    }

    this.isSubmittingApproval = true;
    this.errorMessage = '';
    this.successMessage = '';
    this.cdr.markForCheck();

    this.service.submitForApproval(this.run.uuid, {}).subscribe({
      next: () => {
        this.ngZone.run(() => {
          this.successMessage = 'Extraction submitted for approval.';
          this.isSubmittingApproval = false;
          this.cdr.detectChanges();
        });
      },
      error: (error) => {
        this.ngZone.run(() => {
          console.error('Submit for approval error:', error);
          this.errorMessage =
            error?.error?.detail ||
            error?.error?.assigned_to?.[0] ||
            'Unable to submit extraction for approval.';
          this.isSubmittingApproval = false;
          this.cdr.detectChanges();
        });
      },
    });
  }

  exportJson(): void {
    if (!this.run) {
      return;
    }

    this.isExporting = true;
    this.errorMessage = '';
    this.successMessage = '';
    this.cdr.markForCheck();

    this.service.exportRun(this.run.uuid, 'json').subscribe({
      next: (response) => {
        this.ngZone.run(() => {
          const blob = response.body;

          if (blob) {
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `extraction-${this.run?.uuid}.json`;
            link.click();
            window.URL.revokeObjectURL(url);
          }

          this.successMessage = 'Extraction export downloaded.';
          this.isExporting = false;
          this.cdr.detectChanges();
        });
      },
      error: (error) => {
        this.ngZone.run(() => {
          console.error('Extraction export error:', error);
          this.errorMessage = error?.error?.detail || 'Unable to export extraction.';
          this.isExporting = false;
          this.cdr.detectChanges();
        });
      },
    });
  }

  saveCorrection(event: {
    fieldUuid: string;
    correctedValue: unknown;
    reviewerComment: string;
  }): void {
    if (!this.run) {
      return;
    }

    this.isSavingFieldUuid = event.fieldUuid;
    this.errorMessage = '';
    this.successMessage = '';
    this.cdr.markForCheck();

    this.service
      .correctField(this.run.uuid, event.fieldUuid, {
        corrected_value: event.correctedValue,
        reviewer_comment: event.reviewerComment,
      })
      .subscribe({
        next: (field) => {
          this.ngZone.run(() => {
            this.fields = this.fields.map((existing) =>
              existing.uuid === field.uuid ? field : existing,
            );
            this.successMessage = 'Field correction saved.';
            this.isSavingFieldUuid = null;
            this.cdr.detectChanges();
          });
        },
        error: (error) => {
          this.ngZone.run(() => {
            console.error('Field correction error:', error);
            this.errorMessage = error?.error?.detail || 'Unable to save field correction.';
            this.isSavingFieldUuid = null;
            this.cdr.detectChanges();
          });
        },
      });
  }

  get documentTitle(): string {
    const document = this.run?.document;

    if (document && typeof document === 'object') {
      return document.title || this.run?.document_title || 'Extraction run';
    }

    return this.run?.document_title || this.run?.document_uuid || 'Extraction run';
  }

  get templateName(): string {
    const template = this.run?.template;

    if (template && typeof template === 'object') {
      return template.name || this.run?.template_name || 'Template';
    }

    return this.run?.template_name || this.run?.template_type || 'Template';
  }

  get rawData(): Record<string, unknown> | null {
    return this.run?.raw_output || this.run?.extracted_data || null;
  }

  get confidenceLabel(): string {
    const raw = this.run?.overall_confidence ?? this.run?.confidence;

    if (raw === null || raw === undefined || raw === '') {
      return '-';
    }

    const value = Number(raw);

    if (!Number.isFinite(value)) {
      return String(raw);
    }

    return value <= 1 ? `${Math.round(value * 100)}%` : `${Math.round(value)}%`;
  }
}
