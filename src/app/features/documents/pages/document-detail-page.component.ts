import { DatePipe, NgFor, NgIf } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, inject } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subscription, finalize, interval } from 'rxjs';

import { DocumentDetail, DocumentProcessingJob } from '../models/document.model';
import { DocumentStatusBadgeComponent } from '../components/document-status-badge.component';
import { DocumentsService } from '../services/documents.service';
import { DocumentProcessingPipelineComponent } from '../components/document-processing-pipeline.component';

@Component({
  selector: 'app-document-detail-page',
  standalone: true,
  imports: [
    DatePipe,
    DocumentStatusBadgeComponent,
    NgFor,
    NgIf,
    RouterLink,
    DocumentProcessingPipelineComponent,
  ],
  templateUrl: './document-detail-page.component.html',
  styleUrls: ['./document-detail-page.component.scss'],
})
export class DocumentDetailPageComponent implements OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly documentsService = inject(DocumentsService);
  private readonly cdr = inject(ChangeDetectorRef);
  private pollingSubscription?: Subscription;

  document: DocumentDetail | null = null;
  processingJobs: DocumentProcessingJob[] = [];

  isLoading = false;
  isRetrying = false;
  isDeleting = false;
  errorMessage = '';
  successMessage = '';

  private readonly uuid = this.route.snapshot.paramMap.get('uuid') || '';

  constructor() {
    this.loadDocument();
    this.loadProcessingJobs();
  }
  ngOnDestroy(): void {
    this.stopProcessingPolling();
  }

  startProcessingPolling(): void {
    this.stopProcessingPolling();

    this.pollingSubscription = interval(5000).subscribe(() => {
      this.loadDocument(false);
      this.loadProcessingJobs(false);
    });
  }

  stopProcessingPolling(): void {
    this.pollingSubscription?.unsubscribe();
    this.pollingSubscription = undefined;
  }

  hasActiveProcessingJobs(): boolean {
    return this.processingJobs.some((job) => ['pending', 'running'].includes(job.status));
  }

  loadDocument(showLoader = true): void {
    if (showLoader) {
      this.isLoading = true;
    }

    this.errorMessage = '';

    this.documentsService.getDocument(this.uuid).subscribe({
      next: (document) => {
        console.log('Document detail loaded:', document);

        this.document = { ...document };
        this.isLoading = false;

        this.cdr.detectChanges();
      },
      error: (error) => {
        console.error('Document detail API failed:', error);

        if (showLoader) {
          this.document = null;
        }

        this.isLoading = false;

        this.errorMessage =
          error?.error?.detail ||
          JSON.stringify(error?.error || {}) ||
          'Unable to load document detail.';

        this.cdr.detectChanges();
      },
    });
  }

  loadProcessingJobs(showLoader = true): void {
    this.documentsService.getProcessingJobs(this.uuid).subscribe({
      next: (jobs) => {
        console.log('Processing jobs loaded:', jobs);

        this.processingJobs = Array.isArray(jobs) ? [...jobs] : [];

        if (this.hasActiveProcessingJobs()) {
          this.startProcessingPolling();
        } else {
          this.stopProcessingPolling();
        }

        this.cdr.detectChanges();
      },
      error: (error) => {
        console.error('Processing jobs API failed:', error);

        if (showLoader) {
          this.processingJobs = [];
        }

        this.stopProcessingPolling();
        this.cdr.detectChanges();
      },
    });
  }

  retryProcessing(): void {
    this.isRetrying = true;
    this.errorMessage = '';
    this.successMessage = '';

    this.documentsService
      .retryProcessing(this.uuid)
      .pipe(
        finalize(() => {
          this.isRetrying = false;
        }),
      )
      .subscribe({
        next: (response) => {
          this.successMessage = response.detail;
          this.loadDocument();
          this.loadProcessingJobs();
          this.startProcessingPolling();
        },
        error: (error) => {
          this.errorMessage = error?.error?.detail || 'Unable to retry processing.';
        },
      });
  }

  deleteDocument(): void {
    const confirmed = window.confirm(
      'Delete this document? This action will remove it from the document list.',
    );

    if (!confirmed) {
      return;
    }

    this.isDeleting = true;
    this.errorMessage = '';

    this.documentsService
      .deleteDocument(this.uuid)
      .pipe(
        finalize(() => {
          this.isDeleting = false;
        }),
      )
      .subscribe({
        next: () => {
          this.router.navigate(['/documents']);
        },
        error: (error) => {
          this.errorMessage = error?.error?.detail || 'Unable to delete document.';
        },
      });
  }

  formatLabel(value: string): string {
    return value
      .replaceAll('_', ' ')
      .replaceAll('-', ' ')
      .replace(/\b\w/g, (character) => character.toUpperCase());
  }

  formatFileSize(size: number): string {
    if (!size) {
      return '0 B';
    }

    const units = ['B', 'KB', 'MB', 'GB'];
    const index = Math.floor(Math.log(size) / Math.log(1024));
    return `${(size / Math.pow(1024, index)).toFixed(2)} ${units[index]}`;
  }
}
